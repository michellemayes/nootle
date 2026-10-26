import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { openKnowledgeDocument } from "@/components/SourceCitation";
import { toast } from "@/components/Toaster";
import { Collapsible } from "@/components/Collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useKnowledge } from "@/hooks/useKnowledge";
import { formatDate, plural } from "@/lib/utils";
import type { KnowledgeDocument, KnowledgeHit, KnowledgeSource } from "@/types";

// Matches what the backend reads (knowledge::extract::kind_for_path).
const FILE_EXTENSIONS = [
  "pdf", "docx", "pptx", "xlsx", "md", "markdown", "mdx", "txt", "text", "rst", "org", "csv", "tsv",
  "html", "htm", "webloc", "url",
];

const KIND_LABELS: Record<string, string> = {
  pdf: "PDFs",
  docx: "Word",
  pptx: "Slides",
  xlsx: "Spreadsheets",
  markdown: "Markdown",
  text: "Text",
  html: "HTML",
  web: "Web pages",
};

const SOURCE_ICONS = { folder: Folder, file: FileText, url: Globe };

/** Folders, files and web pages Nootle draws on in Chat, notes and Live Assist. */
export function KnowledgePage() {
  const { sources, tags, addSource, removeSource, setSourceTags, reindex } = useKnowledge();
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<KnowledgeSource | null>(null);

  const add = async (kind: KnowledgeSource["kind"], location: string) => {
    try {
      await addSource(kind, location);
    } catch (err) {
      toast(String(err));
    }
  };

  const addFolder = async () => {
    const dir = await open({ directory: true, title: "Add a folder to your knowledge base" });
    if (typeof dir === "string") await add("folder", dir);
  };

  const addFiles = async () => {
    const files = await open({
      multiple: true,
      title: "Add files to your knowledge base",
      filters: [{ name: "Documents", extensions: FILE_EXTENSIONS }],
    });
    for (const file of Array.isArray(files) ? files : files ? [files] : []) {
      await add("file", file);
    }
  };

  const addUrl = async (e: FormEvent) => {
    e.preventDefault();
    const address = url.trim();
    if (!address) return;
    await add("url", /^https?:\/\//i.test(address) ? address : `https://${address}`);
    setUrl("");
  };

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      setHits(
        await invoke<KnowledgeHit[]>("search_knowledge", {
          query,
          tags: tagFilter ? [tagFilter] : [],
          kinds: kindFilter ? [kindFilter] : [],
        }),
      );
    } catch (err) {
      toast(String(err));
    } finally {
      setSearching(false);
    }
  };

  // Changing a filter re-runs the search that's showing.
  useEffect(() => {
    if (hits !== null) search();
  }, [tagFilter, kindFilter]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Knowledge"
        description="Folders, files and web pages Nootle can draw on in Chat, notes and Live Assist. Indexed on your Mac; files never leave it."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={addFiles}>
              <FilePlus /> Add files
            </Button>
            <Button size="sm" onClick={addFolder}>
              <FolderPlus /> Add folder
            </Button>
          </>
        }
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <form onSubmit={addUrl} className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Add a web page, e.g. https://example.com/handbook"
              aria-label="Web page address"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!url.trim()}>
              <Globe /> Add page
            </Button>
          </form>

          {sources === null ? (
            <LoadingState message="Loading your knowledge base…" />
          ) : sources.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              size="panel"
              title="Teach Nootle what you know"
              description="Add project folders, reference docs, decks, spreadsheets and bookmarks. Nootle indexes them on your Mac, then uses them to answer questions in Chat, fill in your meeting notes, and suggest answers live during calls. A Google Drive for desktop folder works too."
              action={
                <Button size="sm" onClick={addFolder}>
                  <FolderPlus /> Add a folder
                </Button>
              }
            />
          ) : (
            <>
              <section className="space-y-3">
                <form onSubmit={search} className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-48 flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        if (!e.target.value) setHits(null);
                      }}
                      placeholder="Search your documents by meaning or keyword"
                      aria-label="Search knowledge"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  {tags.length > 0 && (
                    <Select
                      size="xs"
                      value={tagFilter}
                      onChange={(e) => setTagFilter(e.target.value)}
                      aria-label="Filter by tag"
                    >
                      <option value="">All tags</option>
                      {tags.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  )}
                  <Select
                    size="xs"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value)}
                    aria-label="Filter by type"
                  >
                    <option value="">All types</option>
                    {Object.entries(KIND_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>{label}</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="outline" disabled={!query.trim() || searching}>
                    {searching ? <Loader2 className="animate-spin" /> : <Search />} Search
                  </Button>
                </form>
                {hits !== null && <SearchResults hits={hits} />}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-medium">Sources</h2>
                  <Button size="xs" variant="ghost" onClick={() => reindex()}>
                    <RefreshCw /> Check for changes
                  </Button>
                </div>
                <ul className="divide-y rounded-lg border">
                  {sources.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      onReindex={() => reindex(source.id)}
                      onRemove={() => setRemoveTarget(source)}
                      onTagsChange={(next) => setSourceTags(source.id, next)}
                    />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove from knowledge base?"
        description={`Nootle will forget what it learned from ${removeTarget?.name ?? "this source"}. Your files aren't touched.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removeTarget) await removeSource(removeTarget.id);
        }}
      />
    </div>
  );
}

function SearchResults({ hits }: { hits: KnowledgeHit[] }) {
  if (hits.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing matched. Try other words.</p>;
  }
  return (
    <ul className="space-y-2">
      {hits.map((hit) => (
        <li key={hit.chunk_id}>
          <button
            onClick={() => openKnowledgeDocument(hit.document_id)}
            className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{hit.document_title}</span>
              {hit.locator && (
                <span className="shrink-0 text-xs font-normal text-muted-foreground">{hit.locator}</span>
              )}
              <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                {hit.source_name}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{hit.text}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SourceRow({
  source,
  onReindex,
  onRemove,
  onTagsChange,
}: {
  source: KnowledgeSource;
  onReindex: () => void;
  onRemove: () => void;
  onTagsChange: (tags: string[]) => void;
}) {
  const Icon = SOURCE_ICONS[source.kind];
  const [expanded, setExpanded] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const indexing = source.status === "indexing" || source.status === "pending";

  useEffect(() => {
    if (!expanded || indexing) return;
    invoke<KnowledgeDocument[]>("list_knowledge_documents", { sourceId: source.id })
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [expanded, indexing, source.id, source.last_indexed_at]);

  const addTag = (e: FormEvent) => {
    e.preventDefault();
    const tag = tagDraft.trim();
    if (tag && !source.tags.includes(tag)) onTagsChange([...source.tags, tag]);
    setTagDraft("");
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Hide documents" : "Show documents"}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" title={source.location}>
              {source.name}
            </span>
            {indexing ? (
              <Badge variant="secondary" size="sm">
                <Loader2 className="animate-spin" /> Indexing
              </Badge>
            ) : source.status === "error" ? (
              <Badge variant="destructive" size="sm">Error</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {plural(source.document_count, "document")}
                {source.last_indexed_at && ` · updated ${formatDate(source.last_indexed_at)}`}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{source.location}</p>
          {source.error && !indexing && (
            <p className="mt-1 text-xs text-destructive">{source.error}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {source.tags.map((tag) => (
              <Badge key={tag} variant="outline" size="sm">
                {tag}
                <button
                  onClick={() => onTagsChange(source.tags.filter((t) => t !== tag))}
                  aria-label={`Remove tag ${tag}`}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <form onSubmit={addTag}>
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="+ tag"
                aria-label="Add a tag"
                className="w-20 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </form>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onReindex}
            disabled={indexing}
            title="Read everything again"
            aria-label="Re-index"
          >
            <RefreshCw />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={onRemove} title="Remove" aria-label="Remove">
            <Trash2 />
          </Button>
        </div>
      </div>
      <Collapsible open={expanded}>
        <div className="ml-14 mt-2">
          {documents === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents yet.</p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => openKnowledgeDocument(doc.id)}
                    className="truncate text-left hover:underline"
                    title={doc.location}
                  >
                    {doc.title}
                  </button>
                  <span className="shrink-0 text-muted-foreground">
                    {KIND_LABELS[doc.kind] ?? doc.kind}
                    {doc.chunk_count === 0 && " · no readable text"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Collapsible>
    </li>
  );
}
