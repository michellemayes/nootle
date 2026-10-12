//! Turns files and web pages into plain text for the knowledge base: PDFs,
//! Word, PowerPoint and Excel files, Markdown, plain text, HTML, and
//! bookmark files (whose page is fetched by the indexer).

use anyhow::{anyhow, Context, Result};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Cursor, Read};
use std::path::Path;

/// Text from one part of a document.
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    /// Where it came from: "Page 3", "Slide 2", "Sheet: Budget".
    pub locator: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Extracted {
    /// The document's own title (a Markdown heading, an HTML `<title>`), if it has one.
    pub title: Option<String>,
    pub sections: Vec<Section>,
}

/// The largest file read, so a stray disk image doesn't stall indexing.
pub const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;

/// The format of a file Nootle can read, from its extension.
pub fn kind_for_path(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "pdf" => "pdf",
        "docx" => "docx",
        "pptx" => "pptx",
        "xlsx" => "xlsx",
        "md" | "markdown" | "mdx" => "markdown",
        "txt" | "text" | "rst" | "org" | "csv" | "tsv" => "text",
        "html" | "htm" => "html",
        "webloc" | "url" => "bookmark",
        _ => return None,
    })
}

/// Reads a document of `kind` from its bytes. Bookmarks are handled by the
/// indexer, which fetches the page they point to (see `bookmark_url`).
pub fn extract(kind: &str, bytes: &[u8]) -> Result<Extracted> {
    match kind {
        "pdf" => pdf(bytes),
        "docx" => docx(bytes),
        "pptx" => pptx(bytes),
        "xlsx" => xlsx(bytes),
        "markdown" => {
            let text = decode_text(bytes);
            Ok(Extracted {
                title: markdown_title(&text),
                sections: vec![Section {
                    locator: None,
                    text,
                }],
            })
        }
        "text" => Ok(Extracted {
            title: None,
            sections: vec![Section {
                locator: None,
                text: decode_text(bytes),
            }],
        }),
        "html" | "web" => {
            let (title, text) = html_to_text(&decode_text(bytes));
            Ok(Extracted {
                title,
                sections: vec![Section {
                    locator: None,
                    text,
                }],
            })
        }
        other => Err(anyhow!("Unsupported document type: {other}")),
    }
}

/// The web address a `.webloc` (macOS) or `.url` (Windows) bookmark points to.
pub fn bookmark_url(bytes: &[u8]) -> Option<String> {
    let text = decode_text(bytes);
    // .url files are INI: `URL=https://…`.
    let from_ini = text.lines().find_map(|line| {
        let (key, value) = line.split_once('=')?;
        key.trim()
            .eq_ignore_ascii_case("url")
            .then(|| value.trim().to_string())
    });
    // .webloc files are a plist with the address in a <string>.
    let from_plist = || {
        let start = text.find("<string>")? + "<string>".len();
        let end = start + text[start..].find("</string>")?;
        Some(decode_entities(text[start..end].trim()))
    };
    from_ini
        .or_else(from_plist)
        .filter(|u| u.starts_with("http://") || u.starts_with("https://"))
}

fn decode_text(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

fn markdown_title(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find_map(|l| l.strip_prefix("# "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

fn pdf(bytes: &[u8]) -> Result<Extracted> {
    // The PDF parser panics on some malformed files; one bad PDF must not
    // take down indexing.
    let pages = std::panic::catch_unwind(|| pdf_extract::extract_text_from_mem_by_pages(bytes))
        .map_err(|_| anyhow!("Couldn't read this PDF"))?
        .map_err(|e| anyhow!("Couldn't read this PDF: {e}"))?;
    Ok(Extracted {
        title: None,
        sections: pages
            .into_iter()
            .enumerate()
            .map(|(i, text)| Section {
                locator: Some(format!("Page {}", i + 1)),
                text,
            })
            .collect(),
    })
}

/// Office files are zips of XML parts.
fn zip_archive(bytes: &[u8]) -> Result<zip::ZipArchive<Cursor<&[u8]>>> {
    zip::ZipArchive::new(Cursor::new(bytes)).context("Not a valid Office file")
}

fn zip_part(archive: &mut zip::ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<String> {
    let file = archive.by_name(name)?;
    let mut text = String::new();
    // Capped, so a crafted file can't inflate into gigabytes.
    file.take(MAX_FILE_BYTES).read_to_string(&mut text)?;
    Ok(text)
}

/// Text inside `<…:t>` elements, with a line break after each paragraph
/// (`<…:p>`), which is how Word and PowerPoint store their text.
fn ooxml_text(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) if e.local_name().as_ref() == b"t" => in_text = true,
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"t" => in_text = false,
                b"p" => out.push('\n'),
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.local_name().as_ref() {
                b"tab" => out.push('\t'),
                b"br" => out.push('\n'),
                _ => {}
            },
            Ok(Event::Text(t)) if in_text => out.push_str(&t.decode().unwrap_or_default()),
            Ok(Event::GeneralRef(r)) if in_text => push_entity(&mut out, &r),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

fn push_entity(out: &mut String, r: &quick_xml::events::BytesRef) {
    if let Ok(Some(c)) = r.resolve_char_ref() {
        out.push(c);
    } else if let Some(s) = r
        .decode()
        .ok()
        .and_then(|name| quick_xml::escape::resolve_xml_entity(&name))
    {
        out.push_str(s);
    }
}

fn docx(bytes: &[u8]) -> Result<Extracted> {
    let mut archive = zip_archive(bytes)?;
    let text = ooxml_text(&zip_part(&mut archive, "word/document.xml")?);
    Ok(Extracted {
        title: None,
        sections: vec![Section {
            locator: None,
            text,
        }],
    })
}

fn pptx(bytes: &[u8]) -> Result<Extracted> {
    let mut archive = zip_archive(bytes)?;
    let mut slides: Vec<(u32, String)> = archive
        .file_names()
        .filter_map(|name| {
            let n = name
                .strip_prefix("ppt/slides/slide")?
                .strip_suffix(".xml")?
                .parse()
                .ok()?;
            Some((n, name.to_string()))
        })
        .collect();
    slides.sort();
    let mut sections = Vec::with_capacity(slides.len());
    for (n, name) in slides {
        sections.push(Section {
            locator: Some(format!("Slide {n}")),
            text: ooxml_text(&zip_part(&mut archive, &name)?),
        });
    }
    Ok(Extracted {
        title: None,
        sections,
    })
}

/// Rows past this in a sheet are skipped; a data dump isn't knowledge.
const MAX_SHEET_ROWS: usize = 5_000;

fn xlsx(bytes: &[u8]) -> Result<Extracted> {
    let mut archive = zip_archive(bytes)?;
    let shared = zip_part(&mut archive, "xl/sharedStrings.xml")
        .map(|xml| shared_strings(&xml))
        .unwrap_or_default();
    let rels = zip_part(&mut archive, "xl/_rels/workbook.xml.rels").unwrap_or_default();
    let workbook = zip_part(&mut archive, "xl/workbook.xml")?;
    let mut sections = Vec::new();
    for (name, rel_id) in sheet_names(&workbook) {
        let Some(target) = relationship_target(&rels, &rel_id) else {
            continue;
        };
        let path = match target.strip_prefix('/') {
            Some(absolute) => absolute.to_string(),
            None => format!("xl/{target}"),
        };
        let Ok(xml) = zip_part(&mut archive, &path) else {
            continue;
        };
        sections.push(Section {
            locator: Some(format!("Sheet: {name}")),
            text: sheet_text(&xml, &shared),
        });
    }
    Ok(Extracted {
        title: None,
        sections,
    })
}

fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| a.key.as_ref() == key || a.key.local_name().as_ref() == key)
        .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()))
}

/// The workbook's sheets in tab order, as (name, relationship id).
fn sheet_names(workbook: &str) -> Vec<(String, String)> {
    let mut reader = Reader::from_str(workbook);
    let mut sheets = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) if e.local_name().as_ref() == b"sheet" => {
                if let (Some(name), Some(id)) = (attr(&e, b"name"), attr(&e, b"r:id")) {
                    sheets.push((name, id));
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    sheets
}

fn relationship_target(rels: &str, id: &str) -> Option<String> {
    let mut reader = Reader::from_str(rels);
    loop {
        match reader.read_event() {
            Ok(Event::Empty(e)) | Ok(Event::Start(e))
                if e.local_name().as_ref() == b"Relationship"
                    && attr(&e, b"Id").as_deref() == Some(id) =>
            {
                return attr(&e, b"Target");
            }
            Ok(Event::Eof) | Err(_) => return None,
            _ => {}
        }
    }
}

/// The workbook's shared strings, which cells refer to by index.
fn shared_strings(xml: &str) -> Vec<String> {
    let mut reader = Reader::from_str(xml);
    let mut strings = Vec::new();
    let mut current = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) if e.local_name().as_ref() == b"t" => in_text = true,
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"t" => in_text = false,
                b"si" => strings.push(std::mem::take(&mut current)),
                _ => {}
            },
            Ok(Event::Text(t)) if in_text => current.push_str(&t.decode().unwrap_or_default()),
            Ok(Event::GeneralRef(r)) if in_text => push_entity(&mut current, &r),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    strings
}

/// A sheet as lines of cells separated by " | ".
fn sheet_text(xml: &str, shared: &[String]) -> String {
    let mut reader = Reader::from_str(xml);
    let mut lines = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut cell_type = String::new();
    let mut value = String::new();
    let mut in_value = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"c" => {
                    cell_type = attr(&e, b"t").unwrap_or_default();
                    value.clear();
                }
                b"v" | b"t" => in_value = true,
                _ => {}
            },
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"v" | b"t" => in_value = false,
                b"c" => {
                    let text = match cell_type.as_str() {
                        "s" => value
                            .trim()
                            .parse::<usize>()
                            .ok()
                            .and_then(|i| shared.get(i).cloned())
                            .unwrap_or_default(),
                        "b" => (if value.trim() == "1" { "TRUE" } else { "FALSE" }).to_string(),
                        _ => value.clone(),
                    };
                    if !text.trim().is_empty() {
                        row.push(text.trim().to_string());
                    }
                }
                b"row" => {
                    if !row.is_empty() {
                        lines.push(row.join(" | "));
                        row.clear();
                    }
                    if lines.len() >= MAX_SHEET_ROWS {
                        break;
                    }
                }
                _ => {}
            },
            Ok(Event::Text(t)) if in_value => value.push_str(&t.decode().unwrap_or_default()),
            Ok(Event::GeneralRef(r)) if in_value => push_entity(&mut value, &r),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    lines.join("\n")
}

/// Elements whose content is never readable text.
const SKIPPED_ELEMENTS: &[&str] = &["script", "style", "noscript", "svg", "template", "iframe"];
/// Elements that start a new line of text.
const BLOCK_ELEMENTS: &[&str] = &[
    "p",
    "div",
    "br",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "tr",
    "section",
    "article",
    "header",
    "footer",
    "ul",
    "ol",
    "table",
    "blockquote",
    "pre",
    "dt",
    "dd",
    "hr",
];

/// An HTML page's title and readable text, one block per line.
pub fn html_to_text(html: &str) -> (Option<String>, String) {
    let lower = html.to_ascii_lowercase();
    let title = lower.find("<title").and_then(|i| {
        let start = i + lower[i..].find('>')? + 1;
        let end = start + lower[start..].find("</title")?;
        let t = decode_entities(html[start..end].trim());
        (!t.is_empty()).then(|| t.split_whitespace().collect::<Vec<_>>().join(" "))
    });

    let mut text = String::new();
    let mut i = 0;
    while i < html.len() {
        let Some(open) = html[i..].find('<').map(|o| i + o) else {
            text.push_str(&html[i..]);
            break;
        };
        text.push_str(&html[i..open]);
        // Comments may contain '>' and tags.
        if html[open..].starts_with("<!--") {
            i = html[open..]
                .find("-->")
                .map_or(html.len(), |end| open + end + 3);
            continue;
        }
        let Some(close) = html[open..].find('>').map(|c| open + c) else {
            break;
        };
        let tag = &lower[open + 1..close];
        let name: String = tag
            .trim_start_matches('/')
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        i = close + 1;
        if SKIPPED_ELEMENTS.contains(&name.as_str()) && !tag.starts_with('/') && !tag.ends_with('/')
        {
            let end_tag = format!("</{name}");
            i = lower[i..]
                .find(&end_tag)
                .and_then(|e| lower[i + e..].find('>').map(|c| i + e + c + 1))
                .unwrap_or(html.len());
        } else if name == "title" && !tag.starts_with('/') {
            // Already taken as the title; don't repeat it as body text.
            i = lower[i..]
                .find("</title")
                .and_then(|e| lower[i + e..].find('>').map(|c| i + e + c + 1))
                .unwrap_or(html.len());
        } else if BLOCK_ELEMENTS.contains(&name.as_str()) {
            text.push('\n');
        } else {
            text.push(' ');
        }
    }

    let body = decode_entities(&text)
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (title, body)
}

/// Decodes the HTML entities that matter for reading text.
fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        let decoded = rest[1..]
            .find(';')
            .filter(|&end| end <= 10)
            .and_then(|end| {
                let entity = &rest[1..end + 1];
                let ch = match entity {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    "mdash" => Some('—'),
                    "ndash" => Some('–'),
                    "hellip" => Some('…'),
                    "rsquo" => Some('\u{2019}'),
                    "lsquo" => Some('\u{2018}'),
                    "rdquo" => Some('\u{201D}'),
                    "ldquo" => Some('\u{201C}'),
                    _ => entity.strip_prefix('#').and_then(|n| {
                        let code = match n.strip_prefix(['x', 'X']) {
                            Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                            None => n.parse().ok()?,
                        };
                        char::from_u32(code)
                    }),
                };
                ch.map(|c| (c, end + 2))
            });
        match decoded {
            Some((c, len)) => {
                out.push(c);
                rest = &rest[len..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

// Counted in words, like transcript chunks: about 1.3 wordpieces per word
// keeps a passage inside the embedding model's 256-wordpiece window.
const CHUNK_WORDS: usize = 160;
const OVERLAP_WORDS: usize = 30;
/// Passages past this in one document are dropped; it keeps one huge file
/// from monopolising the search model.
pub const MAX_CHUNKS_PER_DOCUMENT: usize = 2_000;

/// Splits sections into overlapping passages of about `CHUNK_WORDS` words,
/// breaking between lines where possible. Passages never span sections, so
/// each keeps its page or slide.
pub fn chunk_sections(sections: &[Section]) -> Vec<crate::db::NewKnowledgeChunk> {
    let mut chunks = Vec::new();
    for section in sections {
        // Lines longer than a passage are cut into passage-sized pieces.
        let pieces: Vec<Vec<&str>> = section
            .text
            .lines()
            .map(|l| l.split_whitespace().collect::<Vec<_>>())
            .filter(|words| !words.is_empty())
            .flat_map(|words| {
                words
                    .chunks(CHUNK_WORDS)
                    .map(<[&str]>::to_vec)
                    .collect::<Vec<_>>()
            })
            .collect();

        let mut current: Vec<&Vec<&str>> = Vec::new();
        let mut words = 0;
        let mut flush = |current: &[&Vec<&str>]| {
            let text = current
                .iter()
                .map(|p| p.join(" "))
                .collect::<Vec<_>>()
                .join("\n");
            chunks.push(crate::db::NewKnowledgeChunk {
                locator: section.locator.clone(),
                text,
            });
        };
        for piece in &pieces {
            if words + piece.len() > CHUNK_WORDS && !current.is_empty() {
                flush(&current);
                // Carry the last few lines over so a passage cut mid-thought
                // still makes sense on its own.
                let mut keep = 0;
                let mut kept_words = 0;
                for p in current.iter().rev() {
                    if kept_words + p.len() > OVERLAP_WORDS {
                        break;
                    }
                    kept_words += p.len();
                    keep += 1;
                }
                current.drain(..current.len() - keep);
                words = kept_words;
            }
            current.push(piece);
            words += piece.len();
        }
        if !current.is_empty() {
            flush(&current);
        }
    }
    chunks.truncate(MAX_CHUNKS_PER_DOCUMENT);
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn office_file(parts: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            for (name, content) in parts {
                zip.start_file(*name, zip::write::SimpleFileOptions::default())
                    .unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn recognises_supported_files() {
        assert_eq!(kind_for_path(Path::new("/a/Plan.PDF")), Some("pdf"));
        assert_eq!(kind_for_path(Path::new("notes.md")), Some("markdown"));
        assert_eq!(kind_for_path(Path::new("deck.pptx")), Some("pptx"));
        assert_eq!(kind_for_path(Path::new("link.webloc")), Some("bookmark"));
        assert_eq!(kind_for_path(Path::new("photo.jpg")), None);
        assert_eq!(kind_for_path(Path::new("Makefile")), None);
    }

    #[test]
    fn reads_word_documents() {
        let doc = office_file(&[(
            "word/document.xml",
            r#"<w:document xmlns:w="w"><w:body>
                <w:p><w:r><w:t>Launch plan</w:t></w:r></w:p>
                <w:p><w:r><w:t xml:space="preserve">Ship in </w:t></w:r><w:r><w:t>Q3 &amp; review</w:t></w:r></w:p>
            </w:body></w:document>"#,
        )]);
        let out = extract("docx", &doc).unwrap();
        assert_eq!(
            out.sections[0].text.trim(),
            "Launch plan\nShip in Q3 & review"
        );
    }

    #[test]
    fn reads_slides_in_order() {
        let deck = office_file(&[
            (
                "ppt/slides/slide10.xml",
                r#"<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>Last</a:t></a:r></a:p></p:sld>"#,
            ),
            (
                "ppt/slides/slide2.xml",
                r#"<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>"#,
            ),
        ]);
        let out = extract("pptx", &deck).unwrap();
        let slides: Vec<_> = out
            .sections
            .iter()
            .map(|s| (s.locator.clone().unwrap(), s.text.trim().to_string()))
            .collect();
        assert_eq!(
            slides,
            [
                ("Slide 2".to_string(), "Second".to_string()),
                ("Slide 10".to_string(), "Last".to_string())
            ]
        );
    }

    #[test]
    fn reads_spreadsheets_with_shared_strings() {
        let book = office_file(&[
            (
                "xl/workbook.xml",
                r#"<workbook xmlns:r="r"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>"#,
            ),
            (
                "xl/sharedStrings.xml",
                r#"<sst><si><t>Team</t></si><si><t>Cost</t></si><si><t>Design</t></si></sst>"#,
            ),
            (
                "xl/worksheets/sheet1.xml",
                r#"<worksheet><sheetData>
                    <row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
                    <row><c t="s"><v>2</v></c><c><v>1200</v></c><c t="inlineStr"><is><t>approved</t></is></c></row>
                </sheetData></worksheet>"#,
            ),
        ]);
        let out = extract("xlsx", &book).unwrap();
        assert_eq!(out.sections[0].locator.as_deref(), Some("Sheet: Budget"));
        assert_eq!(
            out.sections[0].text,
            "Team | Cost\nDesign | 1200 | approved"
        );
    }

    #[test]
    fn strips_html_to_readable_text() {
        let (title, text) = html_to_text(
            "<html><head><title>Pricing &amp; Plans</title><style>p{}</style>\
             <script>var x = '<p>';</script></head><body><!-- nav > here -->\
             <h1>Plans</h1><p>Team plan is &#36;12&nbsp;per seat.</p><ul><li>SSO</li></ul></body></html>",
        );
        assert_eq!(title.as_deref(), Some("Pricing & Plans"));
        assert_eq!(text, "Plans\nTeam plan is $12 per seat.\nSSO");
    }

    #[test]
    fn finds_bookmark_addresses() {
        assert_eq!(
            bookmark_url(b"[InternetShortcut]\r\nURL=https://example.com/spec\r\n"),
            Some("https://example.com/spec".into())
        );
        assert_eq!(
            bookmark_url(
                br#"<plist><dict><key>URL</key><string>https://example.com/?a=1&amp;b=2</string></dict></plist>"#
            ),
            Some("https://example.com/?a=1&b=2".into())
        );
        assert_eq!(bookmark_url(b"URL=file:///etc/passwd"), None);
    }

    #[test]
    fn takes_markdown_titles() {
        let out = extract("markdown", b"\xEF\xBB\xBF# Onboarding\n\nWelcome").unwrap();
        assert_eq!(out.title.as_deref(), Some("Onboarding"));
    }

    #[test]
    fn chunks_overlap_and_keep_their_page() {
        // 20-word lines: eight fill a passage, and one fits in the overlap.
        let line = |n: usize| {
            (0..20)
                .map(|i| format!("w{n}x{i}"))
                .collect::<Vec<_>>()
                .join(" ")
        };
        let text = (0..20).map(line).collect::<Vec<_>>().join("\n");
        let chunks = chunk_sections(&[Section {
            locator: Some("Page 4".into()),
            text,
        }]);
        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|c| c.locator.as_deref() == Some("Page 4")));
        assert!(chunks
            .iter()
            .all(|c| c.text.split_whitespace().count() <= CHUNK_WORDS));
        // Each passage after the first repeats the end of the one before.
        let first_last_line = chunks[0].text.lines().last().unwrap();
        assert!(chunks[1].text.starts_with(first_last_line));
    }

    #[test]
    fn splits_lines_longer_than_a_passage() {
        let text = vec!["word"; CHUNK_WORDS * 2 + 5].join(" ");
        let chunks = chunk_sections(&[Section {
            locator: None,
            text,
        }]);
        assert_eq!(chunks.len(), 3);
    }
}
