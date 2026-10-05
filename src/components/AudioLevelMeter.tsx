import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordingStatus } from "@/types";

const POLL_MS = 120;
/** RMS below this counts as silence (roughly -54 dBFS). */
const SILENCE_RMS = 0.002;
/** How long both inputs must stay silent before we flag it. */
const SILENCE_WARNING_MS = 20_000;
/** Relative bar heights, so a single level reads as a little waveform. */
const BAR_SHAPE = [0.55, 0.85, 1, 0.75, 0.5];

/** Map RMS onto 0–1 on a -60…-10 dBFS scale, which is where speech lives. */
function toMeter(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

function Bars({ level, label, icon: Icon, paused }: {
  level: number;
  label: string;
  icon: typeof Mic;
  paused: boolean;
}) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <span className="flex h-4 items-center gap-[2px]" aria-hidden>
        {BAR_SHAPE.map((shape, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-[height] duration-100 ease-out",
              paused ? "bg-muted-foreground/40" : "bg-primary",
            )}
            style={{ height: `${Math.max(3, Math.round(16 * level * shape))}px` }}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Live mic and system-audio level bars: visible proof that audio is coming
 * in. Calls `onSilenceChange(true)` after a long stretch with nothing on
 * either input, so the page can suggest checking the microphone.
 */
export function AudioLevelMeter({
  active,
  paused,
  onSilenceChange,
}: {
  active: boolean;
  paused: boolean;
  onSilenceChange?: (silent: boolean) => void;
}) {
  const [mic, setMic] = useState(0);
  const [system, setSystem] = useState<number | null>(null);
  const silentSinceRef = useRef<number | null>(null);
  const silentRef = useRef(false);
  const onSilenceRef = useRef(onSilenceChange);
  onSilenceRef.current = onSilenceChange;

  useEffect(() => {
    const setSilent = (silent: boolean) => {
      if (silentRef.current === silent) return;
      silentRef.current = silent;
      onSilenceRef.current?.(silent);
    };
    if (!active || paused) {
      setMic(0);
      setSystem((s) => (s === null ? null : 0));
      silentSinceRef.current = null;
      setSilent(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const status = await invoke<RecordingStatus | null>("recording_status").catch(() => null);
      if (cancelled || !status) return;
      const micRms = status.mic_level ?? 0;
      const sysRms = status.system_level ?? null;
      // Fast attack, slower release, so the bars don't flicker.
      setMic((prev) => Math.max(toMeter(micRms), prev * 0.6));
      setSystem((prev) => (sysRms === null ? null : Math.max(toMeter(sysRms), (prev ?? 0) * 0.6)));

      const heard = micRms > SILENCE_RMS || (sysRms ?? 0) > SILENCE_RMS;
      const now = Date.now();
      if (heard) {
        silentSinceRef.current = null;
        setSilent(false);
      } else {
        silentSinceRef.current ??= now;
        if (now - silentSinceRef.current > SILENCE_WARNING_MS) setSilent(true);
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, paused]);

  return (
    <span
      className="flex items-center gap-2.5"
      role="img"
      aria-label={paused ? "Audio input paused" : "Live audio input levels"}
    >
      <Bars level={mic} label="Microphone" icon={Mic} paused={paused} />
      {system !== null && (
        <Bars level={system} label="System audio (other people in the call)" icon={Volume2} paused={paused} />
      )}
    </span>
  );
}
