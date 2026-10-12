//! The knowledge base: folders, files and web pages you point Nootle at.
//! Their text is split into passages and embedded with the same on-device
//! model as meetings, so Ask, notes and Live Assist can draw on your own
//! documents. Nothing is uploaded; web pages are fetched once a day.

pub mod extract;

use crate::db::{
    Database, KnowledgeDocument, KnowledgeHit, KnowledgeSource, NewKnowledgeChunk,
    NewKnowledgeDocument,
};
use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Folders are walked this deep and no further.
const MAX_DEPTH: usize = 12;
/// Files indexed per folder, so pointing at a home folder can't run forever.
const MAX_FILES_PER_FOLDER: usize = 10_000;
/// Folders that hold build output, dependencies or app data, not documents.
const SKIPPED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "build",
    "dist",
    "__pycache__",
    "venv",
    "Library",
];

/// Turns passages into embeddings: the search model in the app, a stand-in in tests.
pub type Embed<'a> = dyn FnMut(&[String]) -> Result<Vec<Vec<f32>>> + 'a;

/// Checks a new source and returns its canonical location and display name.
pub fn validate_source(kind: &str, location: &str) -> Result<(String, String)> {
    let location = location.trim();
    match kind {
        "folder" | "file" => {
            let path = std::fs::canonicalize(location)
                .with_context(|| format!("Couldn't find {location}"))?;
            if kind == "folder" && !path.is_dir() {
                bail!("{location} isn't a folder");
            }
            if kind == "file" {
                if !path.is_file() {
                    bail!("{location} isn't a file");
                }
                if extract::kind_for_path(&path).is_none() {
                    bail!(
                        "Nootle can't read this kind of file. Supported: PDF, Word, PowerPoint, \
                         Excel, Markdown, text, HTML and bookmarks."
                    );
                }
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());
            Ok((path.to_string_lossy().into_owned(), name))
        }
        "url" => {
            let url = url::Url::parse(location).context("That isn't a valid web address")?;
            if !matches!(url.scheme(), "http" | "https") {
                bail!("Only http and https pages can be added");
            }
            let name = format!(
                "{}{}",
                url.host_str().unwrap_or_default(),
                url.path().trim_end_matches('/')
            );
            Ok((url.to_string(), name))
        }
        other => bail!("Unknown source type '{other}'"),
    }
}

/// Tags trimmed, de-duplicated and without blanks.
pub fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    tags.iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && seen.insert(t.to_lowercase()))
        .collect()
}

pub fn add_source(
    db: &Database,
    kind: &str,
    location: &str,
    tags: &[String],
) -> Result<KnowledgeSource> {
    let (location, name) = validate_source(kind, location)?;
    Ok(db.create_knowledge_source(kind, &location, &name, &clean_tags(tags))?)
}

/// Sources being indexed now, so a periodic pass never races a manual one.
static INDEXING: Mutex<Option<HashSet<String>>> = Mutex::new(None);

struct IndexingGuard(String);

impl IndexingGuard {
    fn begin(source_id: &str) -> Option<Self> {
        let mut active = INDEXING.lock().unwrap_or_else(|e| e.into_inner());
        active
            .get_or_insert_with(HashSet::new)
            .insert(source_id.to_string())
            .then(|| Self(source_id.to_string()))
    }
}

impl Drop for IndexingGuard {
    fn drop(&mut self) {
        if let Some(active) = INDEXING.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            active.remove(&self.0);
        }
    }
}

/// What an indexing pass did.
#[derive(Debug, Default, Clone, Serialize, PartialEq)]
pub struct IndexReport {
    pub indexed: usize,
    pub unchanged: usize,
    pub removed: usize,
    /// Files that couldn't be read, with why.
    pub failed: Vec<(String, String)>,
    /// True when the source was already being indexed and this pass was skipped.
    pub skipped: bool,
}

/// Brings a source's index up to date: reads new and changed files (or
/// re-fetches a page once a day), and drops files that are gone. With
/// `force`, everything is read again. Blocking; web pages are fetched on the
/// current Tokio runtime, so call it from `spawn_blocking`.
pub fn index_source(
    db: &Database,
    source_id: &str,
    force: bool,
    embed: &mut Embed,
) -> Result<IndexReport> {
    let Some(_guard) = IndexingGuard::begin(source_id) else {
        return Ok(IndexReport {
            skipped: true,
            ..Default::default()
        });
    };
    let source = db.get_knowledge_source(source_id)?;
    db.set_knowledge_source_status(source_id, "indexing", None)?;
    let result = index_documents(db, &source, force, embed);
    let (status, error) = match &result {
        Ok(report) if report.failed.is_empty() => ("ready", None),
        Ok(report) => {
            let names: Vec<String> = report
                .failed
                .iter()
                .take(3)
                .map(|(location, why)| format!("{} ({why})", display_name(location)))
                .collect();
            let more = report.failed.len().saturating_sub(3);
            let more = if more > 0 {
                format!(" and {more} more")
            } else {
                String::new()
            };
            (
                "ready",
                Some(format!("Couldn't read {}{more}", names.join(", "))),
            )
        }
        Err(e) => ("error", Some(e.to_string())),
    };
    db.set_knowledge_source_status(source_id, status, error.as_deref())?;
    result
}

fn display_name(location: &str) -> String {
    Path::new(location)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| location.to_string())
}

fn index_documents(
    db: &Database,
    source: &KnowledgeSource,
    force: bool,
    embed: &mut Embed,
) -> Result<IndexReport> {
    let existing: HashMap<String, KnowledgeDocument> = db
        .list_knowledge_documents(&source.id)?
        .into_iter()
        .map(|d| (d.location.clone(), d))
        .collect();
    let targets: Vec<String> = match source.kind.as_str() {
        "folder" => {
            let root = Path::new(&source.location);
            if !root.is_dir() {
                bail!("The folder is missing. Was it moved or renamed?");
            }
            files_in(root)
                .into_iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        }
        _ => vec![source.location.clone()],
    };

    let mut report = IndexReport::default();
    let mut seen = HashSet::new();
    for location in targets {
        seen.insert(location.clone());
        let previous = existing.get(&location);
        let read = if source.kind == "url" {
            read_page(&location, previous, force)
        } else {
            read_file(Path::new(&location), previous, force)
        };
        match read {
            Ok(Read::Unchanged) => report.unchanged += 1,
            Ok(Read::Touched(signature)) => {
                if let Some(doc) = previous {
                    db.update_knowledge_document_signature(&doc.id, &signature)?;
                }
                report.unchanged += 1;
            }
            Ok(Read::Changed(doc)) => match store(db, &source.id, &location, doc, embed) {
                Ok(()) => report.indexed += 1,
                Err(e) => report.failed.push((location, e.to_string())),
            },
            Err(e) if source.kind == "folder" => report.failed.push((location, e.to_string())),
            // A lone file or page that can't be read is the source failing.
            Err(e) => return Err(e),
        }
    }
    for (location, doc) in &existing {
        if !seen.contains(location) {
            db.delete_knowledge_document(&doc.id)?;
            report.removed += 1;
        }
    }
    Ok(report)
}

/// The readable files under `root`, skipping hidden files, symlinks and
/// folders of build output, in a stable order.
pub fn files_in(root: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
        if depth > MAX_DEPTH || out.len() >= MAX_FILES_PER_FOLDER {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            // Hidden files, and the lock files Office leaves beside open documents.
            if name.starts_with('.') || name.starts_with("~$") {
                continue;
            }
            // DirEntry::file_type doesn't follow symlinks, so a link loop can't trap the walk.
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                if !SKIPPED_DIRS.contains(&name.as_ref()) {
                    walk(&path, depth + 1, out);
                }
            } else if file_type.is_file() && extract::kind_for_path(&path).is_some() {
                out.push(path);
                if out.len() >= MAX_FILES_PER_FOLDER {
                    return;
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(root, 0, &mut out);
    out
}

/// A document read from disk or the web, ready to embed.
struct ReadDocument {
    title: String,
    kind: String,
    signature: String,
    content_hash: String,
    chunks: Vec<NewKnowledgeChunk>,
}

enum Read {
    Unchanged,
    /// Modified on disk but with the same content: just record the new signature.
    Touched(String),
    Changed(ReadDocument),
}

fn content_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn read_file(path: &Path, previous: Option<&KnowledgeDocument>, force: bool) -> Result<Read> {
    let kind = extract::kind_for_path(path).ok_or_else(|| anyhow!("unsupported file type"))?;
    let meta = std::fs::metadata(path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());
    let signature = format!("{}:{modified}", meta.len());
    if !force && previous.is_some_and(|d| d.signature == signature) {
        return Ok(Read::Unchanged);
    }
    if meta.len() > extract::MAX_FILE_BYTES {
        bail!("larger than 50 MB");
    }
    let bytes = std::fs::read(path)?;
    let hash = content_hash(&bytes);
    if !force && previous.is_some_and(|d| d.content_hash == hash) {
        return Ok(Read::Touched(signature));
    }
    let file_title = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();

    let (kind, extracted) = if kind == "bookmark" {
        let url = extract::bookmark_url(&bytes).ok_or_else(|| anyhow!("no web address in it"))?;
        let (kind, page) = fetch(&url)?;
        (kind, extract::extract(kind, &page)?)
    } else {
        (kind, extract::extract(kind, &bytes)?)
    };
    // A document's own title (a Markdown heading, a page's <title>) says more
    // than its file name.
    let title = extracted.title.clone().unwrap_or(file_title);
    Ok(Read::Changed(ReadDocument {
        title,
        kind: kind.to_string(),
        signature,
        content_hash: hash,
        chunks: extract::chunk_sections(&extracted.sections),
    }))
}

/// Pages are fetched at most once a day unless forced.
fn read_page(url: &str, previous: Option<&KnowledgeDocument>, force: bool) -> Result<Read> {
    let signature = format!("fetched:{}", chrono::Utc::now().format("%Y-%m-%d"));
    if !force && previous.is_some_and(|d| d.signature == signature) {
        return Ok(Read::Unchanged);
    }
    let (kind, page) = fetch(url)?;
    let hash = content_hash(&page);
    if !force && previous.is_some_and(|d| d.content_hash == hash) {
        return Ok(Read::Touched(signature));
    }
    let extracted = extract::extract(kind, &page)?;
    Ok(Read::Changed(ReadDocument {
        title: extracted.title.clone().unwrap_or_else(|| url.to_string()),
        kind: kind.to_string(),
        signature,
        content_hash: hash,
        chunks: extract::chunk_sections(&extracted.sections),
    }))
}

/// Downloads a page (or PDF) on the current Tokio runtime. Returns its
/// format for `extract::extract` and its bytes.
fn fetch(url: &str) -> Result<(&'static str, Vec<u8>)> {
    let handle = tokio::runtime::Handle::try_current()
        .map_err(|_| anyhow!("web pages can only be fetched from the app"))?;
    handle.block_on(async {
        let mut response = crate::http::CLIENT
            .get(url)
            .header(reqwest::header::USER_AGENT, "Nootle (knowledge base)")
            .send()
            .await?
            .error_for_status()?;
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let kind = if content_type.contains("application/pdf") {
            "pdf"
        } else if content_type.contains("text/markdown") {
            "markdown"
        } else if content_type.contains("text/plain") {
            "text"
        } else if content_type.is_empty() || content_type.contains("html") {
            "web"
        } else {
            bail!("unsupported page type ({content_type})");
        };
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            body.extend_from_slice(&chunk);
            if body.len() as u64 > extract::MAX_FILE_BYTES {
                bail!("larger than 50 MB");
            }
        }
        Ok((kind, body))
    })
}

/// Embeds a document's passages and stores them. Each passage is embedded
/// with its document's title, so a passage that never names its subject
/// still matches questions about it.
fn store(
    db: &Database,
    source_id: &str,
    location: &str,
    doc: ReadDocument,
    embed: &mut Embed,
) -> Result<()> {
    let texts: Vec<String> = doc
        .chunks
        .iter()
        .map(|c| match &c.locator {
            Some(locator) => format!("{} ({locator})\n{}", doc.title, c.text),
            None => format!("{}\n{}", doc.title, c.text),
        })
        .collect();
    let embeddings = if texts.is_empty() {
        Vec::new()
    } else {
        embed(&texts)?
    };
    if embeddings.len() != doc.chunks.len() {
        bail!("the search model returned the wrong number of embeddings");
    }
    let chunks: Vec<(NewKnowledgeChunk, Vec<f32>)> =
        doc.chunks.into_iter().zip(embeddings).collect();
    db.replace_knowledge_document(
        &NewKnowledgeDocument {
            source_id,
            location,
            title: &doc.title,
            kind: &doc.kind,
            signature: &doc.signature,
            content_hash: &doc.content_hash,
        },
        &chunks,
    )?;
    Ok(())
}

/// Knowledge passages for a question, by meaning and by keyword, merged
/// with Reciprocal Rank Fusion like meeting search.
pub fn search(
    db: &Database,
    query_embedding: &[f32],
    question: &str,
    tags: &[String],
    kinds: &[String],
    limit: usize,
) -> Result<Vec<KnowledgeHit>> {
    let candidates = limit * 2;
    let by_meaning = db.search_knowledge_similar(query_embedding, candidates, tags, kinds)?;
    let by_keywords = db.search_knowledge_keywords(question, candidates, tags, kinds)?;
    Ok(crate::ops::reciprocal_rank_fusion(
        [by_meaning, by_keywords],
        limit,
        |h| &h.chunk_id,
    ))
}

/// How a passage is cited: "Q3 plan, Page 4".
pub fn citation(hit: &KnowledgeHit) -> String {
    match &hit.locator {
        Some(locator) => format!("{}, {locator}", hit.document_title),
        None => hit.document_title.clone(),
    }
}

/// A passage as a chat source, beside meeting sources.
pub fn source_json(hit: &KnowledgeHit) -> serde_json::Value {
    serde_json::json!({
        "type": "document",
        "document_id": hit.document_id,
        "document_title": hit.document_title,
        "document_kind": hit.document_kind,
        "locator": hit.locator,
        "location": hit.location,
        "snippet": crate::ops::truncate_at_word_boundary(&hit.text, 240, "…"),
    })
}

/// Passages formatted for a prompt, each headed with how to cite it.
pub fn prompt_context(hits: &[KnowledgeHit]) -> String {
    hits.iter()
        .map(|h| format!("---\n[Document: \"{}\"]\n{}\n", citation(h), h.text))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_embed(texts: &[String]) -> Result<Vec<Vec<f32>>> {
        // A unit vector per passage, nudged by length so they differ.
        Ok(texts
            .iter()
            .map(|t| {
                let mut v = vec![0f32; 384];
                v[t.len() % 384] = 1.0;
                v
            })
            .collect())
    }

    #[test]
    fn indexes_a_folder_incrementally() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("plan.md"),
            "# Launch plan\n\nShip the beta in May.",
        )
        .unwrap();
        std::fs::write(dir.path().join("notes.txt"), "Pricing stays at $12.").unwrap();
        std::fs::write(dir.path().join("photo.jpg"), [0u8; 4]).unwrap();
        std::fs::create_dir(dir.path().join("node_modules")).unwrap();
        std::fs::write(dir.path().join("node_modules/readme.md"), "dependency").unwrap();
        std::fs::write(dir.path().join(".hidden.md"), "secret").unwrap();

        let db = Database::new_in_memory().unwrap();
        let source = add_source(
            &db,
            "folder",
            dir.path().to_str().unwrap(),
            &["Launch".into(), " launch ".into(), "".into()],
        )
        .unwrap();
        assert_eq!(source.tags, ["Launch"]);

        let report = index_source(&db, &source.id, false, &mut fake_embed).unwrap();
        assert_eq!((report.indexed, report.unchanged), (2, 0));
        let docs = db.list_knowledge_documents(&source.id).unwrap();
        let titles: Vec<_> = docs.iter().map(|d| d.title.as_str()).collect();
        assert_eq!(titles, ["Launch plan", "notes"]);
        let source = db.get_knowledge_source(&source.id).unwrap();
        assert_eq!(
            (source.status.as_str(), source.document_count),
            ("ready", 2)
        );

        // Nothing changed: nothing is read again.
        let report = index_source(&db, &source.id, false, &mut fake_embed).unwrap();
        assert_eq!((report.indexed, report.unchanged), (0, 2));

        // A deleted file leaves the index.
        std::fs::remove_file(dir.path().join("notes.txt")).unwrap();
        let report = index_source(&db, &source.id, false, &mut fake_embed).unwrap();
        assert_eq!(report.removed, 1);

        let hits = db.search_knowledge_keywords("beta", 5, &[], &[]).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_title, "Launch plan");
        assert_eq!(hits[0].tags, ["Launch"]);

        // Tag and format filters.
        assert_eq!(
            db.search_knowledge_keywords("beta", 5, &["Other".into()], &[])
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            db.search_knowledge_keywords("beta", 5, &[], &["pdf".into()])
                .unwrap()
                .len(),
            0
        );
        let similar = db
            .search_knowledge_similar(
                &fake_embed(&["x".into()]).unwrap()[0],
                5,
                &["Launch".into()],
                &[],
            )
            .unwrap();
        assert_eq!(similar.len(), 1);

        db.delete_knowledge_source(&source.id).unwrap();
        assert!(!db.has_knowledge().unwrap());
        assert!(db.list_knowledge_sources().unwrap().is_empty());
    }

    #[test]
    fn records_files_it_cannot_read() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("broken.docx"), "not a zip").unwrap();
        std::fs::write(dir.path().join("fine.md"), "readable").unwrap();
        let db = Database::new_in_memory().unwrap();
        let source = add_source(&db, "folder", dir.path().to_str().unwrap(), &[]).unwrap();
        let report = index_source(&db, &source.id, false, &mut fake_embed).unwrap();
        assert_eq!(report.indexed, 1);
        assert_eq!(report.failed.len(), 1);
        let source = db.get_knowledge_source(&source.id).unwrap();
        assert_eq!(source.status, "ready");
        assert!(source
            .error
            .unwrap()
            .starts_with("Couldn't read broken.docx"));
    }

    #[test]
    fn rejects_bad_sources() {
        let db = Database::new_in_memory().unwrap();
        assert!(add_source(&db, "folder", "/definitely/not/here", &[]).is_err());
        assert!(add_source(&db, "url", "ftp://example.com/file", &[]).is_err());
        assert!(add_source(&db, "url", "not a url", &[]).is_err());
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("photo.jpg");
        std::fs::write(&image, [0u8; 4]).unwrap();
        assert!(add_source(&db, "file", image.to_str().unwrap(), &[]).is_err());
        add_source(&db, "folder", dir.path().to_str().unwrap(), &[]).unwrap();
        let again = add_source(&db, "folder", dir.path().to_str().unwrap(), &[]);
        assert!(again.unwrap_err().to_string().contains("already"));
    }

    #[test]
    fn names_web_pages_by_address() {
        let (location, name) = validate_source("url", "https://example.com/docs/").unwrap();
        assert_eq!(location, "https://example.com/docs/");
        assert_eq!(name, "example.com/docs");
    }

    #[test]
    fn a_source_is_indexed_once_at_a_time() {
        let guard = IndexingGuard::begin("s1").unwrap();
        assert!(IndexingGuard::begin("s1").is_none());
        assert!(IndexingGuard::begin("s2").is_some());
        drop(guard);
        assert!(IndexingGuard::begin("s1").is_some());
    }
}
