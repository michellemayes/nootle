import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MotionButton } from "@/components/MotionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecording } from "@/hooks/useRecording";
import type { TranscriptSegment } from "@/types";
import { listen } from "@tauri-apps/api/event";
import { Square, ArrowLeft } from "lucide-react";

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
      initial={{ height: 0, opacity: 0 }}
      animate={{
        height: [8, 24 + Math.random() * 16, 8],
        opacity: 1,
      }}
      transition={{
        height: {
          duration: 0.6 + Math.random() * 0.4,
          repeat: Infinity,
          repeatType: "reverse",
          delay: 0.3 + index * 0.05,
          ease: "easeInOut",
        },
        opacity: {
          duration: 0.2,
          delay: index * 0.03,
        },
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

interface TranscriptionStatus {
  available: boolean;
  reason?: string;
}

export function RecordingView() {
  const navigate = useNavigate();
  const { isRecording, elapsed, error, startRecording, stopRecording } =
    useRecording();
  const [title, setTitle] = useState("Untitled Recording");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [stopping, setStopping] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] =
    useState<TranscriptionStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for transcript updates
  useEffect(() => {
    const unlisten = listen<TranscriptSegment[]>(
      "transcript-update",
      (event) => {
        setSegments(event.payload);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for transcription status
  useEffect(() => {
    const unlisten = listen<TranscriptionStatus>(
      "transcription-status",
      (event) => {
        setTranscriptionStatus(event.payload);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Start recording on mount — after event listeners are registered above
  // so we don't miss the transcription-status event from the backend
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      startRecording(title).catch(() => {
        // Error is captured in useRecording's error state
      });
    }
  }, [hasStarted, startRecording, title]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    await new Promise((r) => setTimeout(r, 400));
    try {
      const meeting = await stopRecording();
      navigate(`/meeting/${meeting.id}`);
    } catch {
      navigate("/");
    }
  }, [stopRecording, navigate]);

  // Show error state if recording failed to start
  if (error && !isRecording) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Recording Failed
          </h2>
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

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
              transcriptionStatus?.available === false ? (
                <div className="text-sm text-muted-foreground italic">
                  <p>{transcriptionStatus.reason}</p>
                  <p className="mt-2">
                    <Link
                      to="/settings"
                      className="text-primary underline underline-offset-2"
                    >
                      Download models in Settings
                    </Link>{" "}
                    to enable live transcription.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Listening... your words will show up here
                </p>
              )
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
      <div className="relative inline-flex">
        <MotionButton
          size="lg"
          variant="destructive"
          className="h-14 px-10 text-lg"
          onClick={handleStop}
          disabled={stopping}
        >
          <Square className="h-5 w-5" /> Stop Recording
        </MotionButton>
        <AnimatePresence>
          {stopping && (
            <motion.div
              className="absolute inset-0 rounded-md border-2 border-destructive"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
