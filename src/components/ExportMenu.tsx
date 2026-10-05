import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Check, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Meeting } from "@/types";

const FORMATS = [
  { format: "md", label: "Markdown", hint: "Summaries, action items, notes, transcript" },
  { format: "txt", label: "Transcript", hint: "Plain text with timestamps" },
  { format: "srt", label: "Subtitles (SRT)", hint: "For video players and editors" },
  { format: "vtt", label: "Subtitles (WebVTT)", hint: "For the web, with speaker names" },
] as const;

/** Characters macOS Finder or other apps choke on in a file name. */
const fileSafe = (title: string) => title.replace(/[/\\:*?"<>|]+/g, "-").trim() || "Meeting";

/** Save a meeting to a file in one of the formats `export_meeting` writes. */
export function ExportMenu({ meeting }: { meeting: Meeting }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const exportAs = async (format: string) => {
    const path = await save({
      defaultPath: `${fileSafe(meeting.title)}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return;
    try {
      await invoke("export_meeting", { meetingId: meeting.id, format, path });
      setResult({ ok: true, message: `Saved to ${path}` });
    } catch (err) {
      setResult({ ok: false, message: String(err) });
    }
    setTimeout(() => setResult(null), 3000);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5" title={result?.message}>
          {result ? (
            result.ok ? (
              <Check className="h-3 w-3 text-success-foreground" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-destructive" />
            )
          ) : (
            <Download className="h-3 w-3" />
          )}
          {result ? (result.ok ? "Exported" : "Export failed") : "Export"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {FORMATS.map(({ format, label, hint }) => (
          <DropdownMenuItem key={format} onClick={() => exportAs(format)}>
            <span className="flex flex-col">
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
