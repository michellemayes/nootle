import { invoke } from "@tauri-apps/api/core";
import { FileText } from "lucide-react";
import { formatMs } from "@/lib/utils";
import { toast } from "@/components/Toaster";
import type { ChatSource } from "@/types";

/** Opens a knowledge-base document in its own app, or a web page in the browser. */
export function openKnowledgeDocument(id: string) {
  invoke("open_knowledge_document", { id }).catch((err) => toast(String(err)));
}

/** A cited passage: a meeting moment opens the meeting; a document opens the file. */
export function SourceCitation({
  source,
  onOpenMeeting,
}: {
  source: ChatSource;
  onOpenMeeting: (meetingId: string) => void;
}) {
  const className =
    "inline-flex max-w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors";
  if (source.type === "document") {
    return (
      <button
        onClick={() => openKnowledgeDocument(source.document_id)}
        title={source.snippet}
        className={className}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {source.document_title}
          {source.locator && `, ${source.locator}`}
        </span>
      </button>
    );
  }
  return (
    <button onClick={() => onOpenMeeting(source.meeting_id)} className={className}>
      {source.meeting_title}, {formatMs(source.start_ms)}
    </button>
  );
}
