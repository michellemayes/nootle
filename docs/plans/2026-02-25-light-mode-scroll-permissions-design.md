# Light Mode Default, Scroll Fixes, Permission Onboarding — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Default the app to light mode with a dark toggle, fix scroll clipping in settings/onboarding, and make onboarding actually request macOS permissions before continuing.

**Architecture:** Three independent changes to the Tauri + React app. Theme system is a React context that toggles a CSS class. Scroll fix adds ScrollArea wrappers to pages missing them. Permissions adds new Rust Tauri commands using macOS native APIs (CoreGraphics, AVFoundation, EventKit) and wires them into the onboarding UI with polling for screen recording.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Tauri 2, Rust, macOS native APIs via raw FFI (`libc` + `objc2` or manual `extern "C"` bindings)

---

### Task 1: Create Theme Context and Provider

**Files:**
- Create: `src/hooks/useTheme.tsx`

**Step 1: Create the theme hook file**

```tsx
// src/hooks/useTheme.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme === "dark" ? "dark" : ""}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

**Step 2: Verify file was created**

Run: `ls src/hooks/useTheme.tsx`
Expected: File exists

**Step 3: Commit**

```bash
git add src/hooks/useTheme.tsx
git commit -m "feat: add theme context with light/dark toggle and localStorage persistence"
```

---

### Task 2: Wire ThemeProvider into App and Remove Hardcoded Dark Mode

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Onboarding.tsx`

**Step 1: Update App.tsx**

Replace the hardcoded `<div className="dark">` wrapper with `<ThemeProvider>`. The ThemeProvider's root div handles the class.

In `App.tsx`:
- Add import: `import { ThemeProvider } from "@/hooks/useTheme";`
- In the `App` component, replace `<div className="dark">` with `<ThemeProvider>` and `</div>` with `</ThemeProvider>`
- Remove the old `<div className="dark">` and closing `</div>` around BrowserRouter
- Also wrap the Onboarding render in ThemeProvider: replace `return <Onboarding ... />` with `return <ThemeProvider><Onboarding ... /></ThemeProvider>`

The result should look like:

```tsx
function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("onboarding_complete") === "true"
  );

  if (!onboarded) {
    return (
      <ThemeProvider>
        <Onboarding onComplete={() => setOnboarded(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* ... routes unchanged ... */}
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

**Step 2: Update Onboarding.tsx**

Remove the `<div className="dark">` wrapper in the Onboarding component's return. Replace it with a plain fragment `<>...</>` or just remove the wrapper entirely so the component returns the `<div className="fixed inset-0 ...">` directly.

**Step 3: Verify the app compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Then: `cd .. && npx tsc --noEmit 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/App.tsx src/components/Onboarding.tsx
git commit -m "feat: wire ThemeProvider into app, remove hardcoded dark mode"
```

---

### Task 3: Add Theme Toggle to Sidebar and Settings

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/pages/Settings.tsx`

**Step 1: Add toggle to Sidebar footer**

In `Sidebar.tsx`:
- Import `useTheme`: `import { useTheme } from "@/hooks/useTheme";`
- Import `Button`: already imported
- Inside the `Sidebar` component, add: `const { theme, toggleTheme } = useTheme();`
- Replace the footer div content to include a toggle button next to the version text:

```tsx
{/* Footer */}
<div className="flex items-center justify-between px-5 py-4">
  <p className="text-xs text-muted-foreground">Nootle v0.1.0</p>
  <Button
    variant="ghost"
    size="sm"
    onClick={toggleTheme}
    title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    className="h-8 w-8 p-0"
  >
    {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
  </Button>
</div>
```

**Step 2: Add Appearance card to Settings**

In `Settings.tsx`:
- Import `useTheme`: `import { useTheme } from "@/hooks/useTheme";`
- Inside `SettingsPage`, add: `const { theme, toggleTheme } = useTheme();`
- Add an Appearance card between the header and API Keys card:

```tsx
{/* Appearance */}
<Card>
  <CardHeader>
    <CardTitle>Appearance</CardTitle>
    <CardDescription>Choose your preferred color scheme</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Theme</p>
        <p className="text-sm text-muted-foreground">
          {theme === "light" ? "Light mode" : "Dark mode"}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={toggleTheme}>
        {theme === "light" ? "\u{1F319} Dark" : "\u{2600}\u{FE0F} Light"}
      </Button>
    </div>
  </CardContent>
</Card>
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/pages/Settings.tsx
git commit -m "feat: add theme toggle to sidebar footer and settings page"
```

---

### Task 4: Fix Scroll Clipping in Settings and Onboarding

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/components/Onboarding.tsx`

**Step 1: Add ScrollArea to Settings page**

In `Settings.tsx`:
- Import ScrollArea: `import { ScrollArea } from "@/components/ui/scroll-area";`
- Wrap the entire page content in ScrollArea. Change the outer div from:
  ```tsx
  <div className="flex flex-1 flex-col gap-8 p-8 max-w-3xl">
  ```
  To:
  ```tsx
  <ScrollArea className="flex-1">
    <div className="flex flex-col gap-8 p-8 max-w-3xl">
      {/* ... all existing content ... */}
    </div>
  </ScrollArea>
  ```

**Step 2: Add overflow handling to Onboarding modal**

In `Onboarding.tsx`, on the `motion.div` card element (line 65), add `overflow-y-auto max-h-[90vh]` to the className:

```tsx
className="mx-auto w-full max-w-lg overflow-y-auto max-h-[90vh] rounded-2xl border border-border bg-card p-8 shadow-2xl"
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/pages/Settings.tsx src/components/Onboarding.tsx
git commit -m "fix: add scroll containers to settings and onboarding to prevent content clipping"
```

---

### Task 5: Add Rust Permission Commands

**Files:**
- Create: `src-tauri/src/permissions.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Create permissions module**

Create `src-tauri/src/permissions.rs` with macOS native API calls using raw FFI. This avoids adding new crate dependencies.

```rust
// src-tauri/src/permissions.rs
//! macOS permission checks and requests via native APIs.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct PermissionStatus {
    pub microphone: String,       // "granted" | "denied" | "undetermined"
    pub screen_recording: bool,   // true if granted
    pub calendar: String,         // "granted" | "denied" | "undetermined"
}

// --- Microphone (AVFoundation) ---

/// Check microphone authorization status.
/// Uses AVCaptureDevice.authorizationStatus(for: .audio)
pub fn check_microphone() -> String {
    // AVAuthorizationStatus: 0=notDetermined, 1=restricted, 2=denied, 3=authorized
    let status: i64 = unsafe {
        let cls = objc_getClass(b"AVCaptureDevice\0".as_ptr() as *const _);
        if cls.is_null() {
            return "undetermined".to_string();
        }
        let sel = sel_registerName(b"authorizationStatusForMediaType:\0".as_ptr() as *const _);
        let audio_type = NSString::new("soun");
        msg_send(cls, sel, audio_type.0)
    };
    match status {
        3 => "granted".to_string(),
        2 | 1 => "denied".to_string(),
        _ => "undetermined".to_string(),
    }
}

/// Request microphone access. Returns true if granted.
/// This is async on macOS but we block on it since Tauri commands are async.
pub async fn request_microphone() -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel();
    unsafe {
        let cls = objc_getClass(b"AVCaptureDevice\0".as_ptr() as *const _);
        if cls.is_null() {
            return false;
        }
        let sel = sel_registerName(
            b"requestAccessForMediaType:completionHandler:\0".as_ptr() as *const _,
        );
        let audio_type = NSString::new("soun");

        // Create a block for the completion handler
        let block = ConcreteBlock::new(move |granted: bool| {
            let _ = tx.send(granted);
        });
        let block = block.copy();

        let _: () = msg_send_with_block(cls, sel, audio_type.0, &*block);
    }
    rx.await.unwrap_or(false)
}

// --- Screen Recording (CoreGraphics) ---

extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Check if screen recording permission is granted.
pub fn check_screen_recording() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Request screen recording access. Opens System Settings on macOS.
/// Returns the current status (may still be false until user toggles in Settings).
pub fn request_screen_recording() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}

// --- Calendar (EventKit) ---

/// Check calendar authorization status.
pub fn check_calendar() -> String {
    // EKAuthorizationStatus: 0=notDetermined, 1=restricted, 2=denied, 3=authorized, 4=writeOnly
    let status: i64 = unsafe {
        let cls = objc_getClass(b"EKEventStore\0".as_ptr() as *const _);
        if cls.is_null() {
            return "undetermined".to_string();
        }
        let sel = sel_registerName(
            b"authorizationStatusForEntityType:\0".as_ptr() as *const _,
        );
        // EKEntityTypeEvent = 0
        msg_send(cls, sel, 0i64)
    };
    match status {
        3 | 4 => "granted".to_string(),
        2 | 1 => "denied".to_string(),
        _ => "undetermined".to_string(),
    }
}

/// Request calendar access. Returns true if granted.
pub async fn request_calendar() -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel();
    unsafe {
        let cls = objc_getClass(b"EKEventStore\0".as_ptr() as *const _);
        if cls.is_null() {
            return false;
        }

        // Alloc and init an EKEventStore instance
        let alloc_sel = sel_registerName(b"alloc\0".as_ptr() as *const _);
        let init_sel = sel_registerName(b"init\0".as_ptr() as *const _);
        let store: *mut Object = msg_send_obj(cls, alloc_sel);
        let store: *mut Object = msg_send_obj(store, init_sel);

        // requestFullAccessToEventsWithCompletion:
        let sel = sel_registerName(
            b"requestFullAccessToEventsWithCompletion:\0".as_ptr() as *const _,
        );

        let block = ConcreteBlock::new(move |granted: bool, _error: *mut Object| {
            let _ = tx.send(granted);
        });
        let block = block.copy();

        let _: () = msg_send_block_1(store, sel, &*block);
    }
    rx.await.unwrap_or(false)
}

/// Check all permissions at once.
pub fn check_all() -> PermissionStatus {
    PermissionStatus {
        microphone: check_microphone(),
        screen_recording: check_screen_recording(),
        calendar: check_calendar(),
    }
}

// --- ObjC runtime FFI helpers ---

#[allow(non_camel_case_types)]
type id = *mut Object;

#[repr(C)]
struct Object {
    _private: [u8; 0],
}

extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *mut Object;
    fn sel_registerName(name: *const std::ffi::c_char) -> *const std::ffi::c_void;
    fn objc_msgSend();
}

/// Send a message returning i64 with one argument.
unsafe fn msg_send(obj: *mut Object, sel: *const std::ffi::c_void, arg: id) -> i64 {
    let f: unsafe extern "C" fn(*mut Object, *const std::ffi::c_void, id) -> i64 =
        std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel, arg)
}

/// Send a message returning *mut Object with no extra args.
unsafe fn msg_send_obj(obj: *mut Object, sel: *const std::ffi::c_void) -> *mut Object {
    let f: unsafe extern "C" fn(*mut Object, *const std::ffi::c_void) -> *mut Object =
        std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel)
}

/// Send a message with a block argument, no return.
unsafe fn msg_send_with_block(
    obj: *mut Object,
    sel: *const std::ffi::c_void,
    arg: id,
    block: &std::ffi::c_void,
) {
    let f: unsafe extern "C" fn(*mut Object, *const std::ffi::c_void, id, *const std::ffi::c_void) =
        std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel, arg, block as *const _)
}

/// Send a message with just a block argument, no return.
unsafe fn msg_send_block_1(
    obj: *mut Object,
    sel: *const std::ffi::c_void,
    block: &std::ffi::c_void,
) {
    let f: unsafe extern "C" fn(*mut Object, *const std::ffi::c_void, *const std::ffi::c_void) =
        std::mem::transmute(objc_msgSend as *const ());
    f(obj, sel, block as *const _)
}

/// Minimal NSString wrapper for passing Objective-C string args.
struct NSString(*mut Object);

impl NSString {
    fn new(s: &str) -> Self {
        unsafe {
            let cls = objc_getClass(b"NSString\0".as_ptr() as *const _);
            let sel = sel_registerName(
                b"stringWithUTF8String:\0".as_ptr() as *const _,
            );
            let cstr = std::ffi::CString::new(s).unwrap();
            let f: unsafe extern "C" fn(
                *mut Object,
                *const std::ffi::c_void,
                *const std::ffi::c_char,
            ) -> *mut Object = std::mem::transmute(objc_msgSend as *const ());
            NSString(f(cls, sel, cstr.as_ptr()))
        }
    }
}

/// Minimal Block support for ObjC completion handlers.
/// Uses the blocks crate pattern.
use std::ffi::c_void;

#[repr(C)]
struct BlockDescriptor {
    reserved: u64,
    size: u64,
    copy_helper: Option<unsafe extern "C" fn(*mut c_void, *const c_void)>,
    dispose_helper: Option<unsafe extern "C" fn(*mut c_void)>,
}

/// A concrete block that wraps a Rust closure for use as an ObjC block.
struct ConcreteBlock<F> {
    closure: F,
}

impl<F> ConcreteBlock<F> {
    fn new(closure: F) -> Self {
        Self { closure }
    }

    fn copy(&self) -> Box<Self>
    where
        F: Clone,
    {
        Box::new(Self {
            closure: self.closure.clone(),
        })
    }
}

// NOTE: The actual block FFI implementation above is simplified.
// The implementing engineer should use the `block2` crate for production-quality
// ObjC block support. Add `block2 = "0.5"` to Cargo.toml dependencies.
// The raw FFI above illustrates the intent — replace msg_send_with_block and
// msg_send_block_1 with proper block2::StackBlock or block2::RcBlock usage.
```

**Important note for the implementing engineer:** The raw ObjC FFI above is a sketch. For a clean implementation, add `block2 = "0.5"` and `objc2 = "0.5"` to `Cargo.toml` and use their safe wrappers. Alternatively, add `objc2-av-foundation`, `objc2-event-kit`, and `objc2-core-graphics` for typed bindings. The FFI shape and API names above are correct — only the calling mechanism needs to use a proper block/objc crate.

**Step 2: Add `permissions` module to lib.rs**

In `src-tauri/src/lib.rs`, add:
```rust
pub mod permissions;
```

**Step 3: Add Tauri commands to commands.rs**

Add these commands at the bottom of `src-tauri/src/commands.rs`:

```rust
// Permission commands
#[tauri::command]
pub fn check_permissions() -> Result<crate::permissions::PermissionStatus, String> {
    Ok(crate::permissions::check_all())
}

#[tauri::command]
pub async fn request_microphone_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_microphone().await)
}

#[tauri::command]
pub fn request_screen_recording_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_screen_recording())
}

#[tauri::command]
pub async fn request_calendar_permission() -> Result<bool, String> {
    Ok(crate::permissions::request_calendar().await)
}
```

**Step 4: Register commands in lib.rs invoke_handler**

In `src-tauri/src/lib.rs`, add to the `invoke_handler` macro:
```rust
commands::check_permissions,
commands::request_microphone_permission,
commands::request_screen_recording_permission,
commands::request_calendar_permission,
```

**Step 5: Add required dependencies to Cargo.toml**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:
```toml
block2 = "0.5"
objc2 = "0.5"
```

**Step 6: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`

**Step 7: Commit**

```bash
git add src-tauri/src/permissions.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src-tauri/Cargo.toml
git commit -m "feat: add Rust permission check/request commands for mic, screen recording, calendar"
```

---

### Task 6: Update Onboarding UI to Request Permissions

**Files:**
- Modify: `src/components/Onboarding.tsx`

**Step 1: Rewrite the Permissions step**

Replace the entire permissions step in `Onboarding.tsx`. The new step:
- Calls `check_permissions` on mount and polls every 2s
- Shows per-permission status (granted/pending)
- Has "Grant" buttons that call the corresponding Tauri commands
- Disables "Continue" until all three are granted

Replace `{step === "Permissions" && (...)}` with:

```tsx
{step === "Permissions" && (
  <PermissionsStep onAllGranted={() => {}} onNext={next} />
)}
```

And add a new `PermissionsStep` component:

```tsx
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PermissionStatus {
  microphone: string;
  screen_recording: boolean;
  calendar: string;
}

function PermissionsStep({ onNext }: { onAllGranted?: () => void; onNext: () => void }) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const s = await invoke<PermissionStatus>("check_permissions");
      setStatus(s);
    } catch (e) {
      console.error("Failed to check permissions:", e);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const allGranted =
    status?.microphone === "granted" &&
    status?.screen_recording === true &&
    status?.calendar === "granted";

  const requestPermission = async (type: "microphone" | "screen_recording" | "calendar") => {
    setRequesting(type);
    try {
      if (type === "microphone") {
        await invoke("request_microphone_permission");
      } else if (type === "screen_recording") {
        await invoke("request_screen_recording_permission");
      } else {
        await invoke("request_calendar_permission");
      }
      await checkStatus();
    } catch (e) {
      console.error(`Failed to request ${type} permission:`, e);
    } finally {
      setRequesting(null);
    }
  };

  const micGranted = status?.microphone === "granted";
  const screenGranted = status?.screen_recording === true;
  const calGranted = status?.calendar === "granted";

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-foreground">Permissions</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Nootle needs these permissions to record and transcribe your meetings.
      </p>
      <div className="space-y-3">
        <PermissionRow
          icon={"\uD83C\uDF99"}
          title="Microphone"
          desc="Record your voice during meetings"
          granted={micGranted}
          onRequest={() => requestPermission("microphone")}
          requesting={requesting === "microphone"}
        />
        <PermissionRow
          icon={"\uD83D\uDDA5"}
          title="Screen Recording"
          desc="Capture system audio from meeting apps"
          granted={screenGranted}
          onRequest={() => requestPermission("screen_recording")}
          requesting={requesting === "screen_recording"}
          buttonLabel={screenGranted ? undefined : "Open System Settings"}
        />
        <PermissionRow
          icon={"\uD83D\uDCC5"}
          title="Calendar"
          desc="Auto-detect meetings from your calendar"
          granted={calGranted}
          onRequest={() => requestPermission("calendar")}
          requesting={requesting === "calendar"}
        />
      </div>
      {!allGranted && (
        <p className="mt-4 text-xs text-muted-foreground">
          Screen Recording requires toggling in System Settings. It will be detected automatically.
        </p>
      )}
      <div className="mt-8 flex justify-end">
        <Button onClick={onNext} disabled={!allGranted}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

And update the `PermissionRow` component to support interactive state:

```tsx
function PermissionRow({
  icon,
  title,
  desc,
  granted,
  onRequest,
  requesting,
  buttonLabel,
}: {
  icon: string;
  title: string;
  desc: string;
  granted: boolean;
  onRequest: () => void;
  requesting: boolean;
  buttonLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      {granted ? (
        <Badge variant="secondary" className="bg-green-500/15 text-green-600 dark:text-green-400">
          Granted
        </Badge>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onRequest}
          disabled={requesting}
        >
          {requesting ? "..." : buttonLabel || "Grant"}
        </Button>
      )}
    </div>
  );
}
```

**Step 2: Add Badge import to Onboarding.tsx**

```tsx
import { Badge } from "@/components/ui/badge";
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: onboarding permissions step requests and verifies macOS permissions"
```

---

### Task 7: Manual QA and Final Commit

**Step 1: Run full build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Run: `cd .. && npx tsc --noEmit 2>&1 | tail -10`

**Step 2: Verify all changes look correct**

Run: `git diff main --stat`

Expected files changed:
- `src/hooks/useTheme.tsx` (new)
- `src/App.tsx` (modified)
- `src/components/Onboarding.tsx` (modified)
- `src/components/Sidebar.tsx` (modified)
- `src/pages/Settings.tsx` (modified)
- `src-tauri/src/permissions.rs` (new)
- `src-tauri/src/lib.rs` (modified)
- `src-tauri/src/commands.rs` (modified)
- `src-tauri/Cargo.toml` (modified)

**Step 3: If any issues, fix and commit**

Fix any compilation errors or issues found during the checks.
