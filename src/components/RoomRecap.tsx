import { useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Headphones, Pause, Play, RotateCw, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";
import { ChatComposer } from "@/components/ChatMessage";
import { ThinkingDots } from "@/components/ThinkingDots";
import { AudioPlayerControls, playheadIndex, useFollowPlayback, useIsPlaying } from "@/components/AudioPlayerControls";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { cn, formatMs } from "@/lib/utils";
import type { AudioRecap, RoomAnswer } from "@/types";

/** Plays `audio` and pauses every other player on the page (the meeting's
 * recording, the recap, the last answer), so two never talk over each other. */
function playAlone(audio: HTMLAudioElement | null) {
  if (!audio) return;
  document.querySelectorAll("audio").forEach((a) => a !== audio && a.pause());
  audio.play().catch(() => {});
}

/** The audio element's current position as an index into `lines`. Updates
 * only when the line changes, not on every `timeupdate`. */
function useLineIndex(audio: HTMLAudioElement | null, lines: { start_ms: number }[]) {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    if (!audio) return;
    const update = () => setIndex(playheadIndex(audio, lines));
    update();
    const events = ["timeupdate", "seeked", "emptied"] as const;
    events.forEach((e) => audio.addEventListener(e, update));
    return () => events.forEach((e) => audio.removeEventListener(e, update));
  }, [audio, lines]);
  return index;
}

/**
 * Ask the Room: a spoken recap of the meeting, a voice per speaker, made on
 * demand and played here with the line being spoken shown as it plays; then
 * questions answered aloud in the voice of whoever the answer comes from.
 */
export function RoomRecap({
  meetingId,
  speakerColors,
}: {
  meetingId: string;
  /** The transcript's speaker colours, so people look the same here. */
  speakerColors: Map<string, string>;
}) {
  const { selectedProvider, selectedModel } = useGlobalLLMSelection();
  const hasModel = Boolean(selectedProvider && selectedModel);
  // undefined until the cached recap (or its absence) has loaded.
  const [recap, setRecap] = useState<AudioRecap | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<RoomAnswer | null>(null);
  // Bumped per answer: each is written to the same file.
  const [answerVersion, setAnswerVersion] = useState(0);

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [answerAudio, setAnswerAudio] = useState<HTMLAudioElement | null>(null);
  const isPlaying = useIsPlaying(audio);
  const answerPlaying = useIsPlaying(answerAudio);
  // Lines keyed like transcript segments, so the script list highlights and
  // follows playback the same way the transcript does.
  const lines = useMemo(
    () => (recap?.lines ?? []).map((line, i) => ({ ...line, id: String(i) })),
    [recap],
  );
  const lineIndex = useLineIndex(audio, lines);
  const current = lines[Math.max(0, lineIndex)];
  const [scriptViewport, setScriptViewport] = useState<HTMLDivElement | null>(null);
  useFollowPlayback(audio, lines, scriptViewport);

  useEffect(() => {
    setRecap(undefined);
    setAnswer(null);
    setError(null);
    invoke<AudioRecap | null>("get_audio_recap", { meetingId })
      .then(setRecap)
      .catch(() => setRecap(null));
  }, [meetingId]);

  // Speak each new answer as soon as it's ready.
  useEffect(() => {
    if (answer && answerAudio) playAlone(answerAudio);
  }, [answer, answerVersion, answerAudio]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      audio?.pause();
      setRecap(
        await invoke<AudioRecap>("generate_audio_recap", {
          meetingId,
          provider: selectedProvider,
          model: selectedModel,
        }),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setError(null);
    try {
      const result = await invoke<RoomAnswer>("ask_the_room", {
        meetingId,
        question: q,
        provider: selectedProvider,
        model: selectedModel,
      });
      setQuestion("");
      setAnswer(result);
      setAnswerVersion((v) => v + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setAsking(false);
    }
  };

  const seekTo = (ms: number) => {
    if (!audio) return;
    audio.currentTime = ms / 1000;
    playAlone(audio);
  };

  const colorOf = (speaker: string) => speakerColors.get(speaker) ?? "text-foreground";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-2">
        <Headphones className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Ask the Room</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          A spoken recap, a voice per speaker, made on your Mac
        </span>
        {recap && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={generate}
            disabled={generating || !hasModel}
            title="Write and record a new recap"
          >
            <RotateCw className={cn("h-3 w-3 mr-1", generating && "animate-spin")} />
            {generating ? "Regenerating…" : "Regenerate"}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b px-5 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {recap && <audio ref={setAudio} src={`${convertFileSrc(recap.audio_path)}?v=${encodeURIComponent(recap.created_at)}`} preload="metadata" />}
      {answer && <audio ref={setAnswerAudio} src={`${convertFileSrc(answer.audio_path)}?v=${answerVersion}`} />}

      {!recap ? (
        recap === null && (
          <EmptyState
            icon={generating ? Sparkles : Headphones}
            size="panel"
            title={generating ? undefined : "Listen to this meeting"}
            description={
              generating
                ? "Writing the script and recording the voices…"
                : hasModel
                  ? "A 2–4 minute spoken recap: the key points, decisions and action items, each in the voice of the person who raised it, in the order they came up. The voices are made on your Mac; no audio leaves it."
                  : "Pick an AI model in Settings → AI to write the recap. The voices are made on your Mac."
            }
            action={
              !generating && (
                <Button size="sm" onClick={generate} disabled={!hasModel}>
                  <Headphones className="h-3.5 w-3.5 mr-1" />
                  Make audio recap
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          <div className="shrink-0 px-5 pt-4 pb-3">
            <div className="rounded-lg border bg-muted/30 p-4" aria-live="polite">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-sm font-semibold", colorOf(current.speaker))}>{current.speaker}</span>
                {current.voice && (
                  <span className="text-xs text-muted-foreground">voiced by {current.voice}</span>
                )}
              </div>
              <p className="mt-1.5 min-h-[3rem] text-base leading-relaxed">{current.text}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => (isPlaying ? audio?.pause() : playAlone(audio))}
                  aria-label={isPlaying ? "Pause recap" : "Play recap"}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <AudioPlayerControls audio={audio} showBar disabled={!audio} />
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1" viewportRef={setScriptViewport}>
            <ol className="space-y-1 px-5 pb-4">
              {lines.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    data-segment-id={line.id}
                    onClick={() => seekTo(line.start_ms)}
                    className="-mx-2 flex w-[calc(100%+1rem)] gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60 data-[active=true]:bg-primary/10"
                  >
                    <span className="w-10 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                      {formatMs(line.start_ms)}
                    </span>
                    <span>
                      <span className={cn("mr-1.5 font-semibold", colorOf(line.speaker))}>{line.speaker}:</span>
                      {line.text}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </ScrollArea>

          <div className="shrink-0 space-y-2 border-t px-5 py-4">
            <h3 className="text-sm font-semibold">Ask the room</h3>
            <p className="text-xs text-muted-foreground">
              Ask anything about the meeting and hear the answer in the voice of whoever it comes from.
            </p>
            {asking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ThinkingDots /> Asking the room…
              </div>
            )}
            {answer && !asking && (
              <div className="flex items-start gap-2 rounded-lg border p-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => (answerPlaying ? answerAudio?.pause() : playAlone(answerAudio))}
                  aria-label={answerPlaying ? "Pause answer" : "Play answer"}
                  title={answerPlaying ? "Pause" : "Play again"}
                >
                  {answerPlaying ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <p className="text-sm">
                  <span className={cn("mr-1.5 font-semibold", colorOf(answer.line.speaker))}>
                    {answer.line.speaker}:
                  </span>
                  {answer.line.text}
                </p>
              </div>
            )}
            <ChatComposer
              value={question}
              onChange={setQuestion}
              onSend={ask}
              placeholder="What did we decide about the launch date?"
              disabled={asking || !hasModel}
              // Clear of the floating Ask Nootle bubble.
              className="pr-14"
            />
          </div>
        </>
      )}
    </div>
  );
}
