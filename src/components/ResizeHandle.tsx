import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

type Side = "left" | "right";

interface ResizeHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
  min: number;
  max: number;
  side: Side;
  label: string;
}

export function ResizeHandle({ width, onWidthChange, min, max, side, label }: ResizeHandleProps) {
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const directionMultiplier = side === "right" ? 1 : -1;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = (e.clientX - startX.current) * directionMultiplier;
      onWidthChange(Math.min(Math.max(startWidth.current + delta, min), max));
    };

    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (isResizing.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [min, max, side, onWidthChange]);

  const growKey = side === "right" ? "ArrowRight" : "ArrowLeft";
  const shrinkKey = side === "right" ? "ArrowLeft" : "ArrowRight";

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onMouseDown={(e) => {
        e.preventDefault();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = widthRef.current;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onKeyDown={(e) => {
        if (e.key === growKey) {
          e.preventDefault();
          onWidthChange(Math.min(widthRef.current + 20, max));
        }
        if (e.key === shrinkKey) {
          e.preventDefault();
          onWidthChange(Math.max(widthRef.current - 20, min));
        }
      }}
      className={cn(
        "absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 z-10 focus-visible:bg-primary/30 focus-visible:outline-none",
        side === "right" ? "right-0" : "left-0",
      )}
    />
  );
}
