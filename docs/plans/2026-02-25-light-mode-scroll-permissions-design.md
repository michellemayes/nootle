# Design: Light Mode Default, Scroll Fixes, Permission Onboarding

## Problem

Three UX issues:
1. App is hardcoded to dark mode with no light mode option
2. Settings and onboarding screens clip content (no scroll)
3. Onboarding permissions step is informational only — doesn't request or verify permissions

## Design

### 1. Theme System

**New file: `src/hooks/useTheme.tsx`**
- React context + provider managing `"light" | "dark"` state
- Reads from `localStorage("theme")` on mount, defaults to `"light"`
- Applies/removes `dark` class on a root div
- Exposes `theme` and `toggleTheme` via `useTheme()` hook

**`App.tsx`:** Replace hardcoded `<div className="dark">` with `<ThemeProvider>`. Provider's root div conditionally applies `className="dark"`.

**`Onboarding.tsx`:** Remove `<div className="dark">` wrapper. Renders in current theme (light by default).

**`Sidebar.tsx`:** Add sun/moon toggle button in footer area next to version text.

**`Settings.tsx`:** Add "Appearance" card with light/dark toggle using same `useTheme()` hook.

**`index.css`:** No changes — `:root` already defines light palette, `.dark` defines dark palette.

### 2. Scroll Fixes

**`Settings.tsx`:** Wrap page content in `<ScrollArea className="flex-1">`.

**`Onboarding.tsx`:** Add `overflow-y-auto max-h-[90vh]` to the modal card.

**`App.tsx` Layout:** No change — `overflow-hidden` on `<main>` is correct; child pages need their own scroll containers.

### 3. Permission Requests in Onboarding

**New Rust commands in `commands.rs`:**
- `check_permissions()` — returns status of microphone, screen recording, and calendar permissions
- `request_microphone_permission()` — calls AVCaptureDevice requestAccess for audio
- `request_screen_recording_permission()` — calls CGRequestScreenCaptureAccess (opens System Settings)
- `request_calendar_permission()` — calls EKEventStore requestFullAccessToEvents

**Screen Recording caveat:** macOS has no inline grant prompt. `CGRequestScreenCaptureAccess()` opens System Settings. UI shows "Open System Settings" button and polls `check_permissions` every 2s to detect when user grants it.

**`Onboarding.tsx` Step 2 changes:**
- Each PermissionRow gets a status badge (granted/pending) and a "Grant" button
- Clicking "Grant" calls the corresponding Rust command
- Screen Recording button says "Open System Settings" with polling
- "Continue" button disabled until all three permissions granted

**Rust implementation approach:** Use `cidre` (already a dependency) for AV framework microphone access. Use `objc2` bindings for EventKit calendar access and CoreGraphics screen recording APIs.
