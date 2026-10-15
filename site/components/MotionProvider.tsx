"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Makes every framer-motion animation honour the visitor's reduced-motion setting. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
