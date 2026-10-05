import { memo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecording } from "@/hooks/useRecording";
import { useTemplates } from "@/hooks/useTemplates";
import { useTranscript } from "@/hooks/useTranscripts";
import { useSnapshots, useSnapshotsEnabled } from "@/hooks/useSnapshots";
import type { TranscriptSegment } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScratchPad } from "@/components/ScratchPad";
import { Collapsible } from "@/components/Collapsible";
import { useCompactMode } from "@/contexts/CompactModeContext";
import { Kbd } from "@/components/Kbd";
import { AudioLevelMeter } from "@/components/AudioLevelMeter";
import { Square, ArrowLeft, ArrowDown, ChevronDown, ChevronRight, FileText, MicOff, Pause, Play, ScanLine } from "lucide-react";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const TRANSCRIPT_OPEN_KEY = "recordingTranscriptOpen";
/** Within this many px of the bottom counts as following the live edge. */
const FOLLOW_THRESHOLD_PX = 40;

// Memoized so the once-a-second timer tick doesn't re-render every line.
const LiveSegments = memo(function LiveSegments({
  segments,
}: {
  segments: TranscriptSegment[];
}) {
  return segments.map((seg) => (
    <div key={seg.id} className="text-sm leading-relaxed">
      <span className="font-medium text-primary">{seg.speaker_label}:</span>{" "}
      <span className="text-foreground">{seg.text}</span>
    </div>
  ));
});

interface TranscriptionStatus {
  meeting_id: string;
  available: boolean;
  reason?: string;
}

/** Passed as router state to start a recording for a calendar event. */
export interface RecordingIntent {
  title?: string;
  calendarEventId?: string;
}

export function RecordingView() {
  const navigate = useNavigate();
  const intent = (useLocation().state ?? {}) as RecordingIntent;
  const {
    isRecording,
    isPaused,
    currentMeeting,
    elapsed,
    error,
    startRecording,
    resumeRecording,
    setPaused,
    stopRecording,
  } = useRecording();
  const { templates } = useTemplates();
  const { isCompact } = useCompactMode();
  // Left blank, the backend names the recording after the calendar event
  // happening now, or the time.
  const [title, setTitle] = useState(intent.title ?? "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [notes, setNotes] = useState("");
  const [stopping, setStopping] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(
    () => localStorage.getItem(TRANSCRIPT_OPEN_KEY) === "true",
  );
  // Follow new lines only while the reader is at the bottom; scrolling up to
  // re-read pauses it and offers a way back.
  const [following, setFollowing] = useState(true);
  const [silent, setSilent] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  // Live transcript (loads what's already there when resuming), plus whether
  // transcription runs at all. Imports transcribing in the background send
  // these events too, so both are matched to this recording's meeting.
  const { segments } = useTranscript(currentMeeting?.id ?? "");
  const snapshotsEnabled = useSnapshotsEnabled();
  const { snapshots } = useSnapshots(currentMeeting?.id ?? null);
  // Listening from mount: the status can arrive before start_recording returns.
  const [latestStatus, setLatestStatus] = useState<TranscriptionStatus | null>(null);
  useEffect(() => {
    const unlisten = listen<TranscriptionStatus>("transcription-status", (event) =>
      setLatestStatus(event.payload),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
  const transcriptionStatus =
    latestStatus && latestStatus.meeting_id === currentMeeting?.id ? latestStatus : null;

  const latestTitleRef = useRef(title);
  latestTitleRef.current = title;
  const latestNotesRef = useRef(notes);
  latestNotesRef.current = notes;
  const latestTemplateRef = useRef(selectedTemplateId);
  latestTemplateRef.current = selectedTemplateId;

  // Start recording on mount
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      (async () => {
        const live = await resumeRecording().catch(() => null);
        if (live) {
          setTitle(live.title);
          setSelectedTemplateId(live.template_id ?? "");
          return;
        }
        const meeting = await startRecording(
          latestTitleRef.current.trim(),
          intent.calendarEventId,
          latestTemplateRef.current || undefined,
        );
        if (!latestTitleRef.current.trim()) setTitle(meeting.title);
      })().catch(() => {
        // Error is captured in useRecording's error state
      });
    }
  }, [hasStarted, startRecording, resumeRecording, intent.calendarEventId]);

  // Title and template edits are saved to the live meeting right away so
  // they survive leaving the page mid-recording. `savedRef` mirrors what the
  // meeting row holds, so only real changes are written.
  const savedRef = useRef<{ id: string; title: string; templateId: string } | null>(null);
  const hasPendingEditsRef = useRef(false);
  const saveDetails = useCallback(async () => {
    if (!currentMeeting) {
      // Recording is still starting; the effect below saves once it exists.
      hasPendingEditsRef.current = true;
      return;
    }
    const { id } = currentMeeting;
    if (savedRef.current?.id !== id) {
      savedRef.current = {
        id,
        title: currentMeeting.title,
        templateId: currentMeeting.template_id ?? "",
      };
    }
    const saved = savedRef.current;
    const title = latestTitleRef.current.trim();
    const templateId = latestTemplateRef.current;
    const writes: Promise<unknown>[] = [];
    if (title && title !== saved.title) {
      saved.title = title;
      writes.push(invoke("update_meeting_title", { id, title }));
    }
    if (templateId !== saved.templateId) {
      saved.templateId = templateId;
      writes.push(invoke("update_meeting_template", { id, templateId: templateId || null }));
    }
    await Promise.all(writes).catch((err) =>
      console.error("Failed to save meeting details:", err),
    );
  }, [currentMeeting]);

  useEffect(() => {
    if (currentMeeting && hasPendingEditsRef.current) {
      hasPendingEditsRef.current = false;
      saveDetails();
    }
  }, [currentMeeting, saveDetails]);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      latestTemplateRef.current = templateId;
      saveDetails();
    },
    [saveDetails],
  );

  const commitTitle = useCallback(() => {
    setIsEditingTitle(false);
    saveDetails();
  }, [saveDetails]);

  const toggleTranscript = useCallback(() => {
    setTranscriptOpen((open) => {
      localStorage.setItem(TRANSCRIPT_OPEN_KEY, String(!open));
      return !open;
    });
    setFollowing(true);
  }, []);

  const jumpToLive = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setFollowing(true);
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    if (following && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, following, transcriptOpen]);

  const handleStop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      // ⌘↵ can stop while the title field still has focus, before it commits.
      await saveDetails();
      const meeting = await stopRecording();
      const notes = latestNotesRef.current;
      if (notes.trim()) {
        await invoke("save_meeting_notes", { id: meeting.id, rawNotes: notes });
      }
      navigate(`/meeting/${meeting.id}`, { state: { justRecorded: true } });
    } catch {
      navigate("/");
    }
  }, [stopping, saveDetails, stopRecording, navigate]);

  // ⌘↵ wraps up the meeting from anywhere on the page, notes included.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter" && isRecording) {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleStop, isRecording]);

  // Show error state if recording failed to start
  if (error && !isRecording) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Recording failed
          </h2>
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft />
            Back to meetings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header bar: recording indicator, title, timer, waveform, stop */}
      <div className="flex items-center gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <span
            className={
              isPaused
                ? "h-2.5 w-2.5 rounded-full bg-muted-foreground"
                : "h-2.5 w-2.5 animate-pulse rounded-full bg-destructive"
            }
          />
          <span className="text-xs font-medium text-muted-foreground">
            {isPaused ? "PAUSED" : "REC"}
          </span>
        </div>

        {isCompact ? (
          <span className="text-sm font-semibold truncate max-w-[120px]">
            {title || "New recording"}
          </span>
        ) : (
          <>
            {isEditingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                }}
                className="text-sm font-semibold border-none bg-transparent h-auto py-0 max-w-xs"
                autoFocus
              />
            ) : (
              <button
                className="text-sm font-semibold hover:text-muted-foreground transition-colors truncate max-w-xs"
                onClick={() => setIsEditingTitle(true)}
              >
                {title || "New recording"}
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                size="xs"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                aria-label="Summary template"
                title="Summarize with this template when the recording ends"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatTime(elapsed)}
        </span>

        <AudioLevelMeter
          active={isRecording && !stopping}
          paused={isPaused}
          onSilenceChange={setSilent}
        />

        {snapshotsEnabled && (
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title="Snapshots: when someone shares their screen, slides, designs and charts are snapped from the meeting window into your notes"
          >
            <ScanLine className="h-3.5 w-3.5 text-primary" />
            {!isCompact && "Snapshots"}
            {snapshots.length > 0 && (
              <Badge variant="secondary" size="sm">
                {snapshots.length}
              </Badge>
            )}
          </span>
        )}

        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setPaused(!isPaused).catch(() => {})}
          disabled={!isRecording || stopping}
          title={isPaused ? "Resume recording" : "Pause recording. Nothing is recorded or transcribed until you resume"}
        >
          {isPaused ? <Play /> : <Pause />}
          {!isCompact && (isPaused ? "Resume" : "Pause")}
        </Button>

        <Button
          size="sm"
          variant="destructive"
          onClick={handleStop}
          disabled={stopping}
          title="Stop and save (⌘↵)"
        >
          <Square /> {stopping ? "Stopping…" : "Stop"}
          {!isCompact && !stopping && <Kbd onSolid className="ml-1">⌘↵</Kbd>}
        </Button>
      </div>

      {silent && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-6 py-2 text-xs text-foreground"
        >
          <MicOff className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Nootle hasn't heard anything for a while. Check that your microphone isn't muted and
            that the right input is selected in macOS Sound settings.
          </span>
        </div>
      )}

      {/* Notes — full width, takes remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Take notes during the meeting…"
          className="flex-1 w-full bg-transparent p-6 text-sm leading-relaxed resize-none focus:outline-none placeholder:text-muted-foreground/40"
          autoFocus
        />
      </div>

      <ScratchPad meetingId={currentMeeting?.id ?? null} elapsedMs={elapsed * 1000} />

      {/* Collapsible live transcript */}
      <div className="border-t">
        <button
          onClick={toggleTranscript}
          aria-expanded={transcriptOpen}
          className="flex w-full items-center gap-2 px-6 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {transcriptOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Live transcript
          {segments.length > 0 && (
            <Badge variant="secondary" size="sm">
              {segments.length}
            </Badge>
          )}
        </button>
        <Collapsible open={transcriptOpen}>
          {transcriptOpen && (
            <div className="relative">
            <ScrollArea
              className="h-[240px] border-t"
              viewportRef={scrollRef}
              onScrollCapture={handleTranscriptScroll}
            >
                <div role="log" aria-live="polite" aria-label="Live transcript" className="px-6 py-3 space-y-1.5">
                  {segments.length === 0 && transcriptionStatus?.available === false && (
                    <div className="text-xs text-muted-foreground italic">
                      <p>{transcriptionStatus.reason}</p>
                      <p className="mt-1">
                        <Link
                          to="/settings"
                          className="text-primary underline underline-offset-2"
                        >
                          Download models in Settings
                        </Link>{" "}
                        to enable live transcription.
                      </p>
                    </div>
                  )}
                  {segments.length === 0 && transcriptionStatus?.available !== false && (
                    <p className="text-xs text-muted-foreground italic">
                      {isPaused
                        ? "Paused. Resume to keep transcribing."
                        : "Listening. The transcript appears here as people speak."}
                    </p>
                  )}
                  <LiveSegments segments={segments} />
                </div>
              </ScrollArea>
              {!following && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={jumpToLive}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
                >
                  <ArrowDown /> Jump to live
                </Button>
              )}
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}
