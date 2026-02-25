# Whimsy Implementation Plan — "Moments of Delight"

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add personality to Nootle through playful copy, micro-interactions, celebratory animations, and easter eggs — without changing the design system.

**Architecture:** All changes are frontend-only React/TypeScript. New animation components use Framer Motion (already installed). Reusable animation utilities (SparkleEffect, ThinkingDots) live in `src/components/`. Copy changes are inline string replacements. No new dependencies needed.

**Tech Stack:** React 19, TypeScript 5.8, Framer Motion 12, Tailwind CSS 4, shadcn/ui

**Design doc:** `docs/plans/2026-02-25-whimsy-design.md`

---

### Task 1: Playful Copy — All Pages

Update all static text strings across the app.

**Files:**
- Modify: `src/components/Sidebar.tsx` (line 34 — "New Recording")
- Modify: `src/pages/MeetingLibrary.tsx` (lines 95-97, 149-153)
- Modify: `src/pages/RecordingView.tsx` (lines 148-150)
- Modify: `src/pages/MeetingDetail.tsx` (lines 144, 161-163, 247-249, 257-259)
- Modify: `src/components/ChatPanel.tsx` (lines 73, 114-116, 134-138, 164)
- Modify: `src/components/Onboarding.tsx` (lines 82-88, 139-149)
- Modify: `src/pages/Prompts.tsx` (lines 119-125)
- Modify: `src/pages/Templates.tsx` (lines 138-145)
- Modify: `src/pages/Settings.tsx` (lines 199-200)

**Step 1: Update Sidebar.tsx**

Change line 34:
```tsx
// Old:
          New Recording
// New:
          Record Something
```

**Step 2: Update MeetingLibrary.tsx**

Add a `useLoadingMessage` helper at the top of the file:
```tsx
const LOADING_MESSAGES = [
  "Warming up the noodles...",
  "Untangling the transcript...",
  "Slurping through the data...",
  "Almost there, just al dente...",
];

function useLoadingMessage() {
  const [msg] = useState(() => LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
  return msg;
}
```

Update the loading state (line ~145):
```tsx
// Old:
<p className="text-sm text-muted-foreground">Loading meetings...</p>
// New: (use loadingMessage from hook call at top of MeetingLibrary component)
<p className="text-sm text-muted-foreground">{loadingMessage}</p>
```

Update empty state (lines 149-153):
```tsx
// Old:
<h2 className="text-lg font-medium">No meetings yet</h2>
<p className="text-sm text-muted-foreground">
  Start a new recording to get started
</p>
// New:
<h2 className="text-lg font-medium">No meetings yet</h2>
<p className="text-sm text-muted-foreground">
  Hit record and let Nootle do its thing
</p>
```

Update page subtitle (lines 95-97):
```tsx
// Old:
Your recorded meetings and transcriptions
// New:
Your recorded meetings and transcriptions
```
(Keep this one — it's already clear and clean.)

**Step 3: Update RecordingView.tsx**

Transcript empty state (line 149):
```tsx
// Old:
Transcript will appear here as you speak...
// New:
Listening... your words will show up here
```

**Step 4: Update MeetingDetail.tsx**

Chat button (line 144):
```tsx
// Old:
{"\uD83D\uDCAC"} Chat
// New:
{"\uD83D\uDCAC"} Ask Nootle
```

Transcript empty (line ~165):
```tsx
// Old:
No transcript available yet
// New:
No transcript here — this one's a mystery
```

Generate button (line ~248):
```tsx
// Old:
{generating ? "Generating..." : "Generate Summary"}
// New:
{generating ? "Cooking..." : "Cook Up a Summary"}
```

Summaries empty (line ~258):
```tsx
// Old:
No summaries yet. Generate one above.
// New:
Nothing cooked up yet. Pick a prompt and let it rip.
```

**Step 5: Update ChatPanel.tsx**

Header (line 73):
```tsx
// Old:
Chat with Meeting
// New:
Ask Nootle
```

Empty state (line ~115):
```tsx
// Old:
Ask questions about this meeting
// New:
Go ahead, quiz Nootle about this meeting
```

Send button (line 164):
```tsx
// Old:
Send
// New:
Ask
```

**Step 6: Update Onboarding.tsx**

Welcome body (lines 84-87):
```tsx
// Old:
Your AI-powered meeting recorder. Nootle captures audio,
transcribes in real-time, and generates smart summaries — all
locally on your Mac.
// New:
Nootle captures your meetings, transcribes them live, and
cooks up smart summaries — all on your Mac.
```

Done heading (line 140):
```tsx
// Old:
You're all set!
// New:
You're ready to nootle!
```

**Step 7: Update Prompts.tsx**

Empty state (lines 122-125):
```tsx
// Old:
<h2 className="text-lg font-medium">No prompts yet</h2>
<p className="text-sm text-muted-foreground">
  Create a prompt to get started with summarization
</p>
// New:
<h2 className="text-lg font-medium">No prompts yet</h2>
<p className="text-sm text-muted-foreground">
  Teach Nootle what to listen for
</p>
```

**Step 8: Update Templates.tsx**

Empty state (lines 141-144):
```tsx
// Old:
<h2 className="text-lg font-medium">No templates yet</h2>
<p className="text-sm text-muted-foreground">
  Create a template to standardize meeting summaries
</p>
// New:
<h2 className="text-lg font-medium">No templates yet</h2>
<p className="text-sm text-muted-foreground">
  Give Nootle a format to follow
</p>
```

**Step 9: Update Settings.tsx**

About description (line 200):
```tsx
// Old:
Nootle v0.1.0 — Meeting recorder and summarizer
// New:
Nootle v0.1.0 — Your meetings, transcribed and summarized with a twist
```

**Step 10: Build check**

Run: `pnpm build`
Expected: Build succeeds with no TypeScript errors.

**Step 11: Commit**

```bash
git add src/
git commit -m "feat: add playful copy across all pages and components"
```

---

### Task 2: Button Squish & Motion Wrapper

Add a satisfying press effect to primary buttons app-wide using a reusable motion wrapper.

**Files:**
- Create: `src/components/MotionButton.tsx`

**Step 1: Create MotionButton component**

Create `src/components/MotionButton.tsx`:
```tsx
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import React from "react";

const MotionButtonInner = motion.create(Button);

export const MotionButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(function MotionButton(props, ref) {
  return (
    <MotionButtonInner
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    />
  );
});
```

Note: We create this as a separate component rather than modifying `button.tsx` so that shadcn's Button stays untouched (easier upgrades) and we can selectively apply squish. Ghost/link buttons shouldn't squish.

**Step 2: Replace key buttons with MotionButton**

In these files, import `MotionButton` from `@/components/MotionButton` and replace `<Button>` with `<MotionButton>` for primary/default-variant and destructive-variant buttons only (NOT ghost, outline, or icon buttons):

- `src/components/Sidebar.tsx` — the "Record Something" button
- `src/pages/MeetingDetail.tsx` — "Cook Up a Summary" button
- `src/components/ChatPanel.tsx` — "Ask" send button
- `src/pages/RecordingView.tsx` — "Stop Recording" button
- `src/components/Onboarding.tsx` — "Get Started", "Continue", "Start Using Nootle" buttons
- `src/pages/Prompts.tsx` — "Create" button in dialog
- `src/pages/Templates.tsx` — "Create" button in dialog

**Step 3: Build check**

Run: `pnpm build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/MotionButton.tsx src/
git commit -m "feat: add squish micro-interaction to primary buttons"
```

---

### Task 3: Sidebar Micro-interactions — Logo Wiggle & Nav Bounce

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Add logo wiggle on hover**

Wrap the logo `<div>` with `motion.div` and add a whileHover:
```tsx
import { motion } from "framer-motion";

// Replace the logo block:
<motion.div
  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold"
  whileHover={{ rotate: [0, -3, 3, 0] }}
  transition={{ duration: 0.4, ease: "easeInOut" }}
>
  N
</motion.div>
```

**Step 2: Add nav icon bounce on hover**

Wrap each nav icon `<span>` with motion. Change the NavLink render to wrap the icon:
```tsx
<motion.span
  className="text-base leading-none"
  whileHover={{ y: -1 }}
  transition={{ type: "spring", stiffness: 300, damping: 10 }}
>
  {item.icon}
</motion.span>
```

**Step 3: Build check**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add logo wiggle and nav icon bounce on hover"
```

---

### Task 4: Meeting Card Hover Lift

**Files:**
- Modify: `src/pages/MeetingLibrary.tsx`

**Step 1: Add hover lift to MeetingCard**

The `motion.div` wrapper already has `initial`/`animate`. Add `whileHover`:
```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
  whileHover={{ y: -2 }}
>
  <Card
    className="cursor-pointer transition-shadow hover:bg-accent/30 hover:shadow-md"
    onClick={() => navigate(`/meeting/${meeting.id}`)}
  >
```

Note: Add `hover:shadow-md` to the Card className and use framer `whileHover` for the lift.

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/pages/MeetingLibrary.tsx
git commit -m "feat: add hover lift effect to meeting cards"
```

---

### Task 5: Chat Panel — Message Entrance & Thinking Dots

**Files:**
- Create: `src/components/ThinkingDots.tsx`
- Modify: `src/components/ChatPanel.tsx`

**Step 1: Create ThinkingDots component**

Create `src/components/ThinkingDots.tsx`:
```tsx
import { motion } from "framer-motion";

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
```

**Step 2: Update ChatPanel — thinking indicator**

Replace the "Thinking..." div (lines 134-138):
```tsx
// Old:
<div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
  Thinking...
</div>
// New:
<div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
  <ThinkingDots />
</div>
```

**Step 3: Update ChatPanel — message entrance animation**

Wrap each message bubble with `motion.div`:
```tsx
import { motion, AnimatePresence } from "framer-motion";

// Replace the message map. Wrap the outer div:
{messages.map((msg, i) => (
  <motion.div
    key={i}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
  >
    <div
      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
        msg.role === "user"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      }`}
    >
      {msg.content}
    </div>
  </motion.div>
))}
```

**Step 4: Build check**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add src/components/ThinkingDots.tsx src/components/ChatPanel.tsx
git commit -m "feat: add thinking dots and message entrance animations to chat"
```

---

### Task 6: Waveform Cascade Entrance

**Files:**
- Modify: `src/pages/RecordingView.tsx`

**Step 1: Add initial animation to WaveformBar**

Update `WaveformBar` to start from zero height and cascade in:
```tsx
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
```

The key changes: `initial` starts invisible with zero height. `opacity` has a separate fast transition with staggered delay so bars cascade left-to-right, then the height loop kicks in.

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/pages/RecordingView.tsx
git commit -m "feat: add cascading entrance animation to recording waveform"
```

---

### Task 7: Delete Item Exit Animation

**Files:**
- Modify: `src/pages/Prompts.tsx`
- Modify: `src/pages/Templates.tsx`

**Step 1: Update Prompts.tsx — wrap list in AnimatePresence**

Import `AnimatePresence` from framer-motion. Wrap the prompt list, add `exit` to each item, and add `layout` for smooth reflow:
```tsx
import { motion, AnimatePresence } from "framer-motion";

// Wrap the list:
<AnimatePresence>
  {prompts.map((prompt) => (
    <motion.div
      key={prompt.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      layout
    >
      {/* existing Card content */}
    </motion.div>
  ))}
</AnimatePresence>
```

**Step 2: Same treatment in Templates.tsx**

Identical pattern — import AnimatePresence, wrap list, add exit and layout.

**Step 3: Build check**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/pages/Prompts.tsx src/pages/Templates.tsx
git commit -m "feat: add shrink-and-fade exit animation for deleted items"
```

---

### Task 8: Celebratory Animations — Sparkle Burst

**Files:**
- Create: `src/components/SparkleEffect.tsx`
- Modify: `src/pages/MeetingDetail.tsx`

**Step 1: Create SparkleEffect component**

Create `src/components/SparkleEffect.tsx`:
```tsx
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  distance: number;
  size: number;
}

export function SparkleEffect({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (trigger) {
      const newParticles = Array.from({ length: 7 }, (_, i) => ({
        id: Date.now() + i,
        x: 0,
        y: 0,
        angle: (i / 7) * 360 + (Math.random() * 30 - 15),
        distance: 30 + Math.random() * 20,
        size: 3 + Math.random() * 3,
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 700);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.distance;
        const ty = Math.sin(rad) * p.distance;
        return (
          <motion.div
            key={p.id}
            className="pointer-events-none absolute"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ width: p.size, height: p.size }}
          >
            <div className="h-full w-full rounded-full bg-primary" />
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
```

**Step 2: Wire into MeetingDetail generate button**

In `MeetingDetail.tsx`, add state to trigger sparkle after generation completes. Wrap the generate button in a `relative` container and position `SparkleEffect` at center:

```tsx
import { SparkleEffect } from "@/components/SparkleEffect";

// Add state:
const [justGenerated, setJustGenerated] = useState(false);

// In handleGenerate, after success:
const handleGenerate = async () => {
  if (!selectedPrompt || !selectedProvider || !selectedModel) return;
  setGenerating(true);
  try {
    await generateSummary(selectedPrompt, selectedProvider, selectedModel);
    setJustGenerated(true);
    setTimeout(() => setJustGenerated(false), 100);
  } catch {
    // Error handling
  } finally {
    setGenerating(false);
  }
};

// Wrap button:
<div className="relative flex items-center justify-center">
  <MotionButton
    size="sm"
    className="w-full"
    onClick={handleGenerate}
    disabled={generating || !selectedPrompt || !selectedProvider || !selectedModel}
  >
    {generating ? "Cooking..." : "Cook Up a Summary"}
  </MotionButton>
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <SparkleEffect trigger={justGenerated} />
  </div>
</div>
```

**Step 3: Build check**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/components/SparkleEffect.tsx src/pages/MeetingDetail.tsx
git commit -m "feat: add sparkle burst when summary generation completes"
```

---

### Task 9: Recording Stop Ripple & Permission Badge Bounce

**Files:**
- Modify: `src/pages/RecordingView.tsx`
- Modify: `src/components/Onboarding.tsx`

**Step 1: Add ripple effect to stop button**

In `RecordingView.tsx`, add a ripple animation on the stop button that plays before navigation:

```tsx
const [stopping, setStopping] = useState(false);

const handleStop = useCallback(async () => {
  setStopping(true);
  // Brief delay for the ripple to play
  await new Promise((r) => setTimeout(r, 400));
  try {
    const meeting = await stopRecording();
    navigate(`/meeting/${meeting.id}`);
  } catch {
    navigate("/");
  }
}, [stopRecording, navigate]);

// In render, wrap stop button:
<div className="relative">
  <MotionButton
    size="lg"
    variant="destructive"
    className="h-14 px-10 text-lg"
    onClick={handleStop}
    disabled={stopping}
  >
    {"\u23F9"} Stop Recording
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
```

**Step 2: Add badge bounce to permission granted**

In `Onboarding.tsx`, in the `PermissionRow` component, wrap the granted Badge with `motion.div`:

```tsx
import { motion } from "framer-motion";

// In PermissionRow, replace the granted Badge:
{granted ? (
  <motion.div
    initial={{ scale: 1 }}
    animate={{ scale: [1, 1.15, 1] }}
    transition={{ duration: 0.3 }}
  >
    <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400">
      Granted
    </Badge>
  </motion.div>
) : (
  // ... existing button
)}
```

**Step 3: Build check**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add src/pages/RecordingView.tsx src/components/Onboarding.tsx
git commit -m "feat: add stop-recording ripple and permission-granted badge bounce"
```

---

### Task 10: Onboarding Sparkle Shower

**Files:**
- Modify: `src/components/Onboarding.tsx`

**Step 1: Add sparkle shower to the final "Done" step**

Create an inline `SparkleShower` within the Onboarding component (it's specific to this screen):

```tsx
function SparkleShower() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    size: 2 + Math.random() * 3,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/30"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
          }}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: "100%", opacity: [0, 0.8, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
```

Render it behind the "Done" step content:
```tsx
{step === "Done" && (
  <div className="relative text-center">
    <SparkleShower />
    <h2 className="relative mb-2 text-3xl font-bold text-foreground">
      You're ready to nootle!
    </h2>
    {/* rest of content with relative class added */}
  </div>
)}
```

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add sparkle shower to onboarding completion screen"
```

---

### Task 11: Copy Button Feedback

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Upgrade copy button with animated checkmark**

Replace the copy button with a motion version that pulses on copy:
```tsx
import { motion, AnimatePresence } from "framer-motion";

// Replace the copy button:
<Button
  variant="secondary"
  size="xs"
  className="absolute top-2 right-2"
  onClick={handleCopy}
>
  <AnimatePresence mode="wait">
    <motion.span
      key={copied ? "check" : "copy"}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: copied ? [1, 1.2, 1] : 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
    >
      {copied ? "\u2713 Copied" : "Copy"}
    </motion.span>
  </AnimatePresence>
</Button>
```

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add animated checkmark feedback to copy button"
```

---

### Task 12: Easter Egg — Sidebar Logo Click Sequence

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Add click counter and ripple animation**

Add state and a ref for click counting. On 5 rapid clicks, trigger a sine-wave animation on the sidebar:

```tsx
import { useState, useRef } from "react";
import { motion } from "framer-motion";

// Inside Sidebar component:
const [wiggleSidebar, setWiggleSidebar] = useState(false);
const clickCountRef = useRef(0);
const clickTimerRef = useRef<ReturnType<typeof setTimeout>>();

const handleLogoClick = () => {
  clickCountRef.current += 1;
  clearTimeout(clickTimerRef.current);
  clickTimerRef.current = setTimeout(() => {
    clickCountRef.current = 0;
  }, 1000);

  if (clickCountRef.current >= 5) {
    clickCountRef.current = 0;
    setWiggleSidebar(true);
    setTimeout(() => setWiggleSidebar(false), 500);
  }
};

// Wrap the entire <aside> with motion.aside:
<motion.aside
  className="flex h-screen w-60 flex-col border-r bg-card"
  animate={wiggleSidebar ? {
    x: [0, -2, 3, -3, 2, -1, 0],
  } : {}}
  transition={{ duration: 0.4, ease: "easeInOut" }}
>
```

Add `onClick={handleLogoClick}` and `className="cursor-pointer"` to the logo `motion.div`.

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add sidebar wiggle easter egg on rapid logo clicks"
```

---

### Task 13: Easter Egg — Search "noodle"

**Files:**
- Modify: `src/pages/MeetingLibrary.tsx`

**Step 1: Add noodle easter egg to empty state**

In the empty state conditional, add a check for the search term:

```tsx
// Replace the empty state block:
) : meetings.length === 0 ? (
  <div className="flex flex-1 flex-col items-center justify-center gap-3">
    {search.toLowerCase() === "noodle" ? (
      <>
        <span className="text-4xl">{"\uD83C\uDF5C"}</span>
        <h2 className="text-lg font-medium">You found the secret noodle!</h2>
        <p className="text-sm text-muted-foreground">
          Unfortunately, it's not a meeting.
        </p>
      </>
    ) : (
      <>
        <span className="text-4xl">{"\uD83C\uDFA4"}</span>
        <h2 className="text-lg font-medium">No meetings yet</h2>
        <p className="text-sm text-muted-foreground">
          Hit record and let Nootle do its thing
        </p>
      </>
    )}
  </div>
) : (
```

**Step 2: Build check**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add src/pages/MeetingLibrary.tsx
git commit -m "feat: add secret noodle easter egg in meeting search"
```

---

### Task 14: Final Build & Typecheck

**Files:** None (verification only)

**Step 1: Full build**

Run: `pnpm build`
Expected: Clean build with no errors.

**Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Final commit if any formatting cleanup needed**

If the build required any fixes, commit them:
```bash
git add -A
git commit -m "chore: fix any build issues from whimsy implementation"
```
