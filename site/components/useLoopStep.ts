"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * Steps through `steps` frames of a looping demo while it's on screen.
 * With reduced motion it holds on the last frame, so that frame should show the finished state.
 * `running` is false offscreen; put it on `data-running` so CSS loops pause too.
 */
export function useLoopStep(steps: number, intervalMs: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % steps), intervalMs);
    return () => clearInterval(id);
  }, [inView, reduce, steps, intervalMs]);

  return { ref, step: reduce ? steps - 1 : step, reduce: !!reduce, running: inView && !reduce };
}
