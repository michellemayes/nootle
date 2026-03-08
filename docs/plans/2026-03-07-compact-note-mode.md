# Compact Note Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a responsive compact mode that strips the UI to notes + collapsible transcript + icon-only sidebar when the window is narrower than 25% of the screen width.

**Architecture:** A `CompactModeContext` detects screen width via Tauri's monitor API and window resize events, exposing an `isCompact` boolean. The Sidebar, RecordingView, MeetingDetail, and GlobalChatPanel components read this context to conditionally render their compact variants. No separate layout — same components, CSS-driven responsive behavior.

**Tech Stack:** React Context, Tauri window/monitor APIs (`@tauri-apps/api`), Tailwind CSS transitions, Framer Motion (existing), CSS keyframe animations.

---

### Task 1: Create CompactModeContext

**Files:**
- Create: `src/contexts/CompactModeContext.tsx`

**Step 1: Write the context file**

```tsx
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { currentMonitor } from "@tauri-apps/api/window";

interface CompactModeContextValue {
  isCompact: boolean;
}

const CompactModeContext = createContext<CompactModeContextValue>({ isCompact: false });

export function CompactModeProvider({ children }: { children: React.ReactNode }) {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    async function checkCompact() {
      const monitor = await currentMonitor();
      const size = await appWindow.innerSize();
      if (monitor) {
        const threshold = monitor.size.width * 0.25;
        setIsCompact(size.width < threshold);
      }
    }

    checkCompact();

    const unlisten = appWindow.onResized(async () => {
      await checkCompact();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const value = useMemo(() => ({ isCompact }), [isCompact]);

  return (
    <CompactModeContext.Provider value={value}>
      {children}
    </CompactModeContext.Provider>
  );
}

export function useCompactMode() {
  return useContext(CompactModeContext);
}
```

**Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Expected: No errors related to CompactModeContext

**Step 3: Commit**

```bash
git add src/contexts/CompactModeContext.tsx
git commit -m "feat: add CompactModeContext with screen-width detection"
```

---

### Task 2: Wire CompactModeProvider into App and lower minimum window width

**Files:**
- Modify: `src/App.tsx` (lines 44-46, wrap with CompactModeProvider)
- Modify: `src-tauri/tauri.conf.json` (line 18, change minWidth)

**Step 1: Add provider to App.tsx**

In `src/App.tsx`, add import:
```tsx
import { CompactModeProvider } from "@/contexts/CompactModeContext";
```

Wrap the `LLMSelectionProvider` with `CompactModeProvider`:
```tsx
<ThemeProvider>
  <CompactModeProvider>
    <LLMSelectionProvider>
      <BrowserRouter>
        ...
      </BrowserRouter>
    </LLMSelectionProvider>
  </CompactModeProvider>
</ThemeProvider>
```

**Step 2: Lower minimum window width**

In `src-tauri/tauri.conf.json`, change:
```json
"minWidth": 300,
```

**Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/App.tsx src-tauri/tauri.conf.json
git commit -m "feat: wire CompactModeProvider and lower min window width to 300px"
```

---

### Task 3: Make Sidebar respond to compact mode

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Add compact mode hook and conditional rendering**

Import the hook:
```tsx
import { useCompactMode } from "@/contexts/CompactModeContext";
```

Inside `Sidebar()`, destructure:
```tsx
const { isCompact } = useCompactMode();
```

Changes to the `<motion.aside>`:
- Replace fixed `w-60` with dynamic width: `className={cn("flex h-screen flex-col bg-sidebar ...", isCompact ? "w-12" : "w-60")}` and add `transition-all duration-200`
- Logo section: hide text `<span>` when compact, keep icon
- "Record Something" button: hide text, show only `<Circle>` icon when compact
- Nav items: hide `{item.label}` when compact, add `title={item.label}` for tooltip
- Footer (LLM selector, version, theme toggle): hide entirely when compact

Each nav item gets a `title` attribute for the tooltip:
```tsx
<NavLink
  key={item.to}
  to={item.to}
  end={item.to === "/"}
  title={isCompact ? item.label : undefined}
  className={({ isActive }) =>
    cn(
      "flex items-center rounded-md transition-colors",
      isCompact ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
      "text-sm font-medium",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    )
  }
>
```

**Step 2: Verify it compiles and test visually**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Then manually resize the window below 25% screen width to check sidebar collapses.

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: sidebar collapses to icons in compact mode"
```

---

### Task 4: Add compact sound wave recording indicator

**Files:**
- Create: `src/components/CompactRecordingIndicator.tsx`

**Step 1: Create the component**

```tsx
export function CompactRecordingIndicator() {
  return (
    <div className="flex items-center gap-[2px] h-4" title="Recording">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-green-500"
          style={{
            animation: `compact-wave 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}
```

**Step 2: Add the CSS keyframes**

In `src/index.css`, add:
```css
@keyframes compact-wave {
  0% { height: 4px; }
  100% { height: 16px; }
}
```

**Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/CompactRecordingIndicator.tsx src/index.css
git commit -m "feat: add compact sound wave recording indicator"
```

---

### Task 5: Make RecordingView respond to compact mode

**Files:**
- Modify: `src/pages/RecordingView.tsx`

**Step 1: Add compact mode and conditional rendering**

Import:
```tsx
import { useCompactMode } from "@/contexts/CompactModeContext";
import { CompactRecordingIndicator } from "@/components/CompactRecordingIndicator";
```

Inside `RecordingView()`:
```tsx
const { isCompact } = useCompactMode();
```

Changes to the header bar (lines 161-240):
- When `isCompact`, hide the template selector (lines 191-206)
- When `isCompact`, hide the title editing (show just a truncated title)
- When `isCompact`, replace the 12-bar waveform with `<CompactRecordingIndicator />` in the top-right corner of the notes area (not the header)

When `isCompact`, add the `CompactRecordingIndicator` as a fixed-position element in the notes area:
```tsx
<div className="flex-1 flex flex-col min-h-0 relative">
  {isCompact && isRecording && (
    <div className="absolute top-3 right-3 z-10">
      <CompactRecordingIndicator />
    </div>
  )}
  <textarea ... />
</div>
```

The header bar when compact shows only: recording dot, timer, stop button. Minimal.

**Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/pages/RecordingView.tsx
git commit -m "feat: recording view compact mode with sound wave indicator"
```

---

### Task 6: Make MeetingDetail respond to compact mode

**Files:**
- Modify: `src/pages/MeetingDetail.tsx`

**Step 1: Add compact mode to MeetingDetail**

Import:
```tsx
import { useCompactMode } from "@/contexts/CompactModeContext";
```

Inside the component:
```tsx
const { isCompact } = useCompactMode();
```

Changes:
1. **Header area** (meeting title, labels, action buttons): When compact, hide labels and action buttons. Show only title + back button.

2. **Tab bar** (lines 1047-1054): When compact, show only icons in TabsTrigger:
   - Notes → `FileText` icon
   - Summaries → `Sparkles` icon
   - Insights → `Lightbulb` icon
   - Highlights → `StickyNote` icon
   - Analytics → `BarChart3` icon
   - Workflows → `Zap` icon

   Use `title` attribute for tooltip. Each trigger gets:
   ```tsx
   <TabsTrigger value="notes" title="Notes">
     {isCompact ? <FileText className="h-4 w-4" /> : "Notes"}
   </TabsTrigger>
   ```

3. **Transcript panel**: When `isCompact`, force `transcriptCollapsed` to true initially (it already defaults to true, so this is a no-op, but ensure compact mode doesn't change this).

4. **Audio player**: When compact, simplify to just play/pause + time display. Hide the seek bar. (The audio player is inline in MeetingDetail — look for the `<audio>` and play controls.)

**Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/pages/MeetingDetail.tsx
git commit -m "feat: meeting detail compact mode with icon-only tabs"
```

---

### Task 7: Hide GlobalChatPanel in compact mode

**Files:**
- Modify: `src/components/GlobalChatPanel.tsx`

**Step 1: Add early return for compact mode**

Import:
```tsx
import { useCompactMode } from "@/contexts/CompactModeContext";
```

Inside `GlobalChatPanel()`, after the existing `onChatPage` check:
```tsx
const { isCompact } = useCompactMode();

// existing
if (onChatPage) return null;
// add
if (isCompact) return null;
```

**Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/GlobalChatPanel.tsx
git commit -m "feat: hide global chat panel in compact mode"
```

---

### Task 8: Manual integration testing

**Step 1: Run the app**

Run: `pnpm tauri dev`

**Step 2: Test the following scenarios**

1. Resize window below 25% screen width → sidebar collapses to icons, no labels
2. Resize back above threshold → sidebar expands, labels return
3. While in compact mode, navigate to recording → notes full width, compact wave indicator visible, template selector hidden
4. While recording in compact mode, toggle transcript open/closed
5. While in compact mode, navigate to a meeting detail → tabs show icons only, transcript collapsed
6. While in compact mode, verify global chat FAB is hidden
7. Resize window while mid-typing in notes → text preserved, no re-mount
8. Move window between displays (if multi-monitor) → threshold recalculates

**Step 3: Fix any issues found**

**Step 4: Final commit if fixes needed**

```bash
git add -u
git commit -m "fix: compact mode integration fixes"
```
