import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecording } from "@/hooks/useRecording";
import type { TranscriptSegment } from "@/types";
import { listen } from "@tauri-apps/api/event";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function WaveformBar({ index }: { index: number }) {
  return (
    <motion.div
      className="w-1 rounded-full bg-primary"
      animate={{
        height: [8, 24 + Math.random() * 16, 8],
      }}
      transition={{
        duration: 0.6 + Math.random() * 0.4,
        repeat: Infinity,
        repeatType: "reverse",
        delay: index * 0.05,
        ease: "easeInOut",
      }}
    />
  );
}

function Waveform() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-12">
      {Array.from({ length: 32 }).map((_, i) => (
        <WaveformBar key={i} index={i} />
      ))}
    </div>
  );
}

export function RecordingView() {
  const navigate = useNavigate();
  const { isRecording, elapsed, startRecording, stopRecording } =
    useRecording();
  const [title, setTitle] = useState("Untitled Recording");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start recording on mount
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      startRecording(title).catch(() => {
        // If recording fails, navigate back
      });
    }
  }, [hasStarted, startRecording, title]);

  // Listen for transcript updates
  useEffect(() => {
    const unlisten = listen<TranscriptSegment[]>("transcript-update", (event) => {
      setSegments(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  const handleStop = useCallback(async () => {
    try {
      const meeting = await stopRecording();
      navigate(`/meeting/${meeting.id}`);
    } catch {
      navigate("/");
    }
  }, [stopRecording, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      {/* Recording indicator */}
      <div className="flex items-center gap-2">
        <motion.div
          className="h-3 w-3 rounded-full bg-red-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-sm font-medium text-muted-foreground">
          Recording
        </span>
      </div>

      {/* Title */}
      <div className="text-center">
        {isEditingTitle ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setIsEditingTitle(false);
            }}
            className="text-center text-2xl font-bold border-none bg-transparent"
            autoFocus
          />
        ) : (
          <h1
            className="cursor-pointer text-2xl font-bold hover:text-muted-foreground transition-colors"
            onClick={() => setIsEditingTitle(true)}
          >
            {title}
          </h1>
        )}
      </div>

      {/* Timer */}
      <div className="font-mono text-5xl font-light tabular-nums tracking-wider text-foreground">
        {formatTime(elapsed)}
      </div>

      {/* Waveform */}
      {isRecording && <Waveform />}

      {/* Live transcript */}
      <div className="w-full max-w-2xl flex-1">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Live Transcript
        </h3>
        <ScrollArea className="h-48 rounded-lg border bg-card p-4">
          <div ref={scrollRef}>
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Transcript will appear here as you speak...
              </p>
            ) : (
              <div className="space-y-2">
                {segments.map((seg) => (
                  <div key={seg.id} className="text-sm">
                    <span className="font-medium text-primary">
                      {seg.speaker_label}:
                    </span>{" "}
                    <span className="text-foreground">{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Stop button */}
      <Button
        size="lg"
        variant="destructive"
        className="h-14 px-10 text-lg"
        onClick={handleStop}
      >
        {"\u23F9"} Stop Recording
      </Button>
    </div>
  );
}
