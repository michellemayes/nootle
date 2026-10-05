import { useEffect, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMs } from "@/lib/utils";
import type { TranscriptSegment } from "@/types";

export const SKIP_SECONDS = 15;
const SPEEDS = [1, 1.25, 1.5, 2];

function formatPlayerTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "00:00";
  return formatMs(seconds * 1000);
}

export function skipBy(audio: HTMLAudioElement | null, seconds: number) {
  if (!audio) return;
  const end = isFinite(audio.duration) ? audio.duration : Infinity;
  audio.currentTime = Math.max(0, Math.min(end, audio.currentTime + seconds));
}

/** Mirrors the element's own play/pause state, whatever started or stopped it. */
export function useIsPlaying(audio: HTMLAudioElement | null) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!audio) return;
    const sync = () => setPlaying(!audio.paused);
    sync();
    const events = ["play", "pause", "ended", "emptied"] as const;
    events.forEach((e) => audio.addEventListener(e, sync));
    return () => events.forEach((e) => audio.removeEventListener(e, sync));
  }, [audio]);
  return playing;
}

/** Index of the last segment starting at or before `ms` (-1 if none). */
function segmentIndexAt(segments: TranscriptSegment[], ms: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Marks the transcript row under the playhead with `data-active` (rows carry
 * `data-segment-id`) and keeps it in view, unless the reader has scrolled
 * away from it. Done on the DOM rather than in React state so playback
 * doesn't re-render the whole transcript every time the line changes.
 */
export function useFollowPlayback(
  audio: HTMLAudioElement | null,
  segments: TranscriptSegment[],
  viewport: HTMLElement | null,
) {
  useEffect(() => {
    if (!audio || !viewport || segments.length === 0) return;
    let activeEl: HTMLElement | null = null;

    const isOutside = (el: HTMLElement, margin = 0) => {
      const view = viewport.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.top < view.top || r.bottom > view.bottom - margin;
    };
    const mark = (el: HTMLElement | null, on: boolean) => {
      if (!el) return;
      if (on) {
        el.dataset.active = "true";
        el.setAttribute("aria-current", "true");
      } else {
        delete el.dataset.active;
        el.removeAttribute("aria-current");
      }
    };

    const update = () => {
      const index = audio.currentTime === 0 && audio.paused
        ? -1
        : segmentIndexAt(segments, audio.currentTime * 1000);
      const id = index >= 0 ? segments[index].id : null;
      if (activeEl?.isConnected && activeEl.dataset.segmentId === id) return;
      const next = id
        ? viewport.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(id)}"]`)
        : null;
      // Follow only if the reader was still looking at the previous line.
      const follow = !audio.paused && next && (!activeEl?.isConnected || !isOutside(activeEl));
      mark(activeEl, false);
      mark(next, true);
      activeEl = next;
      if (follow && isOutside(next, 24)) {
        next.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    update();
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("seeked", update);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("seeked", update);
      mark(activeEl, false);
    };
  }, [audio, segments, viewport]);
}

/**
 * Skip buttons, seek bar, clock, and speed. Owns the playback position so
 * `timeupdate` re-renders only this, not the meeting page.
 */
export function AudioPlayerControls({
  audio,
  showBar,
  disabled,
}: {
  audio: HTMLAudioElement | null;
  showBar: boolean;
  disabled: boolean;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeked", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
    };
  }, [audio]);

  useEffect(() => {
    if (audio) audio.playbackRate = speed;
  }, [audio, speed]);

  const seekToRatio = (ratio: number) => {
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
  };

  const progress = duration > 0 ? `${(currentTime / duration) * 100}%` : "0%";

  const cycleSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={() => skipBy(audio, -SKIP_SECONDS)}
        aria-label={`Back ${SKIP_SECONDS} seconds`}
        title={`Back ${SKIP_SECONDS}s (←)`}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={() => skipBy(audio, SKIP_SECONDS)}
        aria-label={`Forward ${SKIP_SECONDS} seconds`}
        title={`Forward ${SKIP_SECONDS}s (→)`}
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      {showBar ? (
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatPlayerTime(currentTime)} of ${formatPlayerTime(duration)}`}
          className="group/seek flex-1 cursor-pointer rounded-full py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekToRatio((e.clientX - rect.left) / rect.width);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              skipBy(audio, e.key === "ArrowLeft" ? -5 : 5);
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              seekToRatio(e.key === "Home" ? 0 : 1);
            }
          }}
        >
          <div className="relative h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-[width] duration-150"
              style={{ width: progress }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100"
              style={{ left: progress }}
            />
          </div>
        </div>
      ) : (
        <span className="flex-1" />
      )}
      <span className="text-xs font-mono text-muted-foreground tabular-nums">
        {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
      </span>
      <Button
        variant="ghost"
        size="xs"
        disabled={disabled}
        onClick={cycleSpeed}
        className="w-12 font-mono tabular-nums"
        aria-label={`Playback speed ${speed}x`}
        title="Playback speed"
      >
        {speed}×
      </Button>
    </>
  );
}
