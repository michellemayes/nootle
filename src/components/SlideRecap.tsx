import type { ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, Presentation, RefreshCw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatMs } from "@/lib/utils";
import type { Slide } from "@/types";

function slideWindow(slide: Slide) {
  return `${formatMs(slide.offset_ms)}–${formatMs(slide.end_ms)}`;
}

/** A `[slide N]` citation in a summary: a small thumbnail of the slide. */
export function SlideCitation({
  slide,
  onOpen,
  children,
}: {
  slide: Slide;
  onOpen: (slide: Slide) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(slide)}
      title={`Slide ${slide.number}${slide.headline ? `: ${slide.headline}` : ""} (${slideWindow(slide)})`}
      className="not-prose mx-0.5 inline-flex items-center gap-1 rounded border bg-muted/50 py-px pl-px pr-1.5 align-middle text-[10px] font-medium leading-none text-muted-foreground no-underline transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <img
        src={convertFileSrc(slide.image_path)}
        alt=""
        className="h-4 w-7 rounded-sm object-cover"
      />
      {children ?? `slide ${slide.number}`}
    </button>
  );
}

/** One slide, large, with its recap and a way to play from when it came up. */
export function SlideDialog({
  slide,
  onClose,
  onSeek,
}: {
  slide: Slide | null;
  onClose: () => void;
  onSeek?: (ms: number) => void;
}) {
  return (
    <Dialog open={slide !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl">
        {slide && (
          <>
            <DialogTitle className="text-sm">
              Slide {slide.number}
              {slide.headline && ` · ${slide.headline}`}
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {slideWindow(slide)}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              A slide shared during the meeting
            </DialogDescription>
            <img
              src={convertFileSrc(slide.image_path)}
              alt={`Slide ${slide.number}`}
              className="max-h-[60vh] w-full rounded-md border object-contain"
            />
            {slide.recap && <p className="text-sm text-muted-foreground">{slide.recap}</p>}
            {onSeek && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => onSeek(slide.offset_ms)}>
                  <Play className="mr-1 h-3 w-3" />
                  Play from {formatMs(slide.offset_ms)}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Each slide with what was said while it was up. */
export function SlideRecapSection({
  slides,
  onOpen,
  onSeek,
  onGenerate,
  generating,
  canGenerate,
}: {
  slides: Slide[];
  onOpen: (slide: Slide) => void;
  onSeek: (ms: number) => void;
  onGenerate: (replace: boolean) => void;
  generating: boolean;
  /** False without a model to write recaps with. */
  canGenerate: boolean;
}) {
  if (slides.length === 0) return null;
  const missing = slides.some((s) => !s.recap);
  const [Icon, label] = generating
    ? [Sparkles, "Recapping…"]
    : missing
      ? [Sparkles, "Recap slides"]
      : [RefreshCw, "Redo recap"];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Presentation className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Slide recap</h3>
        <Badge variant="secondary" size="sm">
          {slides.length}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-xs"
          onClick={() => onGenerate(!missing)}
          disabled={generating || !canGenerate}
          title={canGenerate ? undefined : "Choose a model to write slide recaps"}
        >
          <Icon className={cn("mr-1 h-3 w-3", generating && "animate-pulse")} />
          {label}
        </Button>
      </div>
      <ol className="space-y-3">
        {slides.map((slide) => (
          <li key={slide.id} className="flex gap-3">
            <button
              type="button"
              className="w-36 shrink-0 overflow-hidden rounded-md border bg-muted/30 transition-colors hover:border-primary/50"
              onClick={() => onOpen(slide)}
              title={`View slide ${slide.number}`}
            >
              <img
                src={convertFileSrc(slide.image_path)}
                alt={`Slide ${slide.number}`}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-foreground">Slide {slide.number}</span>
                <button
                  type="button"
                  className="font-mono text-muted-foreground hover:text-primary hover:underline"
                  onClick={() => onSeek(slide.offset_ms)}
                  title="Play from here"
                >
                  {slideWindow(slide)}
                </button>
              </div>
              {slide.headline && (
                <p className="truncate text-sm font-medium text-foreground">{slide.headline}</p>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {slide.recap ?? <span className="italic">Not recapped yet.</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
