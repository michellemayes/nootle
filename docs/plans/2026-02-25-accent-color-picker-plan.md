# Accent Color Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users change the theme accent color via preset swatches or a custom color picker on the Settings page.

**Architecture:** Store hue (0-360) and chroma as CSS custom properties (`--accent-h`, `--accent-c`) on the root element. CSS variables for `--primary`, `--ring`, and `--sidebar-primary` reference these via OKLCH with mode-appropriate lightness. The ThemeProvider manages state and persistence via localStorage.

**Tech Stack:** React 19, Tailwind CSS 4, OKLCH color space, shadcn/ui, localStorage

---

### Task 1: Update CSS variables to use accent custom properties

**Files:**
- Modify: `src/index.css:48-81` (`:root` block)
- Modify: `src/index.css:83-115` (`.dark` block)

**Step 1: Add accent custom property defaults to `:root`**

In `src/index.css`, add `--accent-h` and `--accent-c` defaults inside `:root` (right after `--radius`), then replace the static `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`, `--sidebar-primary-foreground`, and `--sidebar-ring` values with dynamic OKLCH expressions.

The `:root` block should become:

```css
:root {
    --radius: 0.625rem;
    --accent-h: 0;
    --accent-c: 0;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 var(--accent-c) var(--accent-h));
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 var(--accent-c) var(--accent-h));
    --chart-1: oklch(0.646 0.222 41.116);
    --chart-2: oklch(0.6 0.118 184.704);
    --chart-3: oklch(0.398 0.07 227.392);
    --chart-4: oklch(0.828 0.189 84.429);
    --chart-5: oklch(0.769 0.188 70.08);
    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 var(--accent-c) var(--accent-h));
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 var(--accent-c) var(--accent-h));
}
```

**Step 2: Update the `.dark` block**

Replace the same variables in `.dark` with dynamic expressions using different lightness values appropriate for dark mode:

```css
.dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.75 var(--accent-c) var(--accent-h));
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 var(--accent-c) var(--accent-h));
    --chart-1: oklch(0.488 0.243 264.376);
    --chart-2: oklch(0.696 0.17 162.48);
    --chart-3: oklch(0.769 0.188 70.08);
    --chart-4: oklch(0.627 0.265 303.9);
    --chart-5: oklch(0.645 0.246 16.439);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.75 var(--accent-c) var(--accent-h));
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 var(--accent-c) var(--accent-h));
}
```

**Step 3: Verify the app still renders correctly**

Run: `npm run dev` (or `pnpm dev`)
Expected: App looks identical to before — accent-h=0, accent-c=0 produces the same neutral gray as the original hardcoded values.

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: make primary/ring CSS vars use accent custom properties"
```

---

### Task 2: Extend ThemeProvider with accent color state

**Files:**
- Modify: `src/hooks/useTheme.tsx`

**Step 1: Add accent state, persistence, and CSS property application**

Replace the entire file with:

```tsx
// src/hooks/useTheme.tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  accentHue: number;
  accentChroma: number;
  setAccentColor: (hue: number, chroma: number) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function applyAccentToDOM(hue: number, chroma: number) {
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(hue));
  root.style.setProperty("--accent-c", String(chroma));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return stored === "dark" ? "dark" : "light";
  });

  const [accentHue, setAccentHue] = useState<number>(() => {
    const stored = localStorage.getItem("accent-hue");
    return stored ? Number(stored) : 0;
  });

  const [accentChroma, setAccentChroma] = useState<number>(() => {
    const stored = localStorage.getItem("accent-chroma");
    return stored ? Number(stored) : 0;
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    applyAccentToDOM(accentHue, accentChroma);
    localStorage.setItem("accent-hue", String(accentHue));
    localStorage.setItem("accent-chroma", String(accentChroma));
  }, [accentHue, accentChroma]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const setAccentColor = useCallback((hue: number, chroma: number) => {
    setAccentHue(hue);
    setAccentChroma(chroma);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentHue, accentChroma, setAccentColor }}>
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

**Step 2: Verify**

Run: `npm run dev`
Expected: App still works. No visual change yet (defaults are 0/0). Open DevTools, check `document.documentElement.style` has `--accent-h: 0` and `--accent-c: 0`.

**Step 3: Commit**

```bash
git add src/hooks/useTheme.tsx
git commit -m "feat: add accent color state to ThemeProvider"
```

---

### Task 3: Create AccentColorPicker component

**Files:**
- Create: `src/components/AccentColorPicker.tsx`

**Step 1: Create the component**

Create `src/components/AccentColorPicker.tsx` with the following content:

```tsx
import { useRef } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const PRESETS = [
  { name: "Default", hue: 0, chroma: 0 },
  { name: "Blue", hue: 260, chroma: 0.18 },
  { name: "Purple", hue: 300, chroma: 0.18 },
  { name: "Green", hue: 155, chroma: 0.15 },
  { name: "Orange", hue: 55, chroma: 0.18 },
  { name: "Pink", hue: 350, chroma: 0.18 },
  { name: "Teal", hue: 195, chroma: 0.12 },
  { name: "Red", hue: 25, chroma: 0.20 },
] as const;

/** Convert hex (#rrggbb) to OKLCH hue and chroma using a canvas for sRGB->OKLCH approximation. */
function hexToHueChroma(hex: string): { hue: number; chroma: number } {
  // Parse hex to RGB 0-255
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB to linear
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Linear RGB to OKLab (using the standard matrix)
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_cbrt = Math.cbrt(l_);
  const m_cbrt = Math.cbrt(m_);
  const s_cbrt = Math.cbrt(s_);

  const L = 0.2104542553 * l_cbrt + 0.7936177850 * m_cbrt - 0.0040720468 * s_cbrt;
  const a = 1.9779984951 * l_cbrt - 2.4285922050 * m_cbrt + 0.4505937099 * s_cbrt;
  const bOk = 0.0259040371 * l_cbrt + 0.7827717662 * m_cbrt - 0.8086757660 * s_cbrt;

  const chroma = Math.sqrt(a * a + bOk * bOk);
  let hue = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return { hue: Math.round(hue), chroma: Math.round(chroma * 1000) / 1000 };
}

function isActive(presetHue: number, presetChroma: number, currentHue: number, currentChroma: number): boolean {
  return Math.abs(presetHue - currentHue) < 1 && Math.abs(presetChroma - currentChroma) < 0.005;
}

export function AccentColorPicker() {
  const { accentHue, accentChroma, setAccentColor } = useTheme();
  const colorInputRef = useRef<HTMLInputElement>(null);

  const isCustom = !PRESETS.some((p) => isActive(p.hue, p.chroma, accentHue, accentChroma));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Accent color</p>
      <p className="text-sm text-muted-foreground">
        Tints buttons, focus rings, and active elements
      </p>
      <div className="flex items-center gap-2 pt-1">
        {PRESETS.map((preset) => {
          const active = isActive(preset.hue, preset.chroma, accentHue, accentChroma);
          // Show the light-mode primary lightness for the swatch preview
          const bg = preset.chroma === 0
            ? "oklch(0.35 0 0)"
            : `oklch(0.55 ${preset.chroma} ${preset.hue})`;
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => setAccentColor(preset.hue, preset.chroma)}
              className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{
                backgroundColor: bg,
                borderColor: active ? bg : "transparent",
              }}
            >
              {active && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" strokeWidth={3} />
              )}
            </button>
          );
        })}

        {/* Custom color picker */}
        <button
          type="button"
          title="Custom color"
          onClick={() => colorInputRef.current?.click()}
          className="relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{
            background: isCustom
              ? `oklch(0.55 ${accentChroma} ${accentHue})`
              : "conic-gradient(from 0deg, oklch(0.65 0.2 0), oklch(0.65 0.2 60), oklch(0.65 0.2 120), oklch(0.65 0.2 180), oklch(0.65 0.2 240), oklch(0.65 0.2 300), oklch(0.65 0.2 360))",
            borderColor: isCustom
              ? `oklch(0.55 ${accentChroma} ${accentHue})`
              : "transparent",
          }}
        >
          {isCustom && (
            <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" strokeWidth={3} />
          )}
        </button>
        <input
          ref={colorInputRef}
          type="color"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const { hue, chroma } = hexToHueChroma(e.target.value);
            setAccentColor(hue, Math.max(chroma, 0.05));
          }}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npm run dev`
Expected: No compile errors. Component not visible yet (not imported into Settings).

**Step 3: Commit**

```bash
git add src/components/AccentColorPicker.tsx
git commit -m "feat: create AccentColorPicker component with presets and custom picker"
```

---

### Task 4: Add AccentColorPicker to Settings page

**Files:**
- Modify: `src/pages/Settings.tsx:1-229`

**Step 1: Import AccentColorPicker**

Add to the imports at the top of `src/pages/Settings.tsx`:

```tsx
import { AccentColorPicker } from "@/components/AccentColorPicker";
```

**Step 2: Add the picker below the theme toggle**

In the `SettingsPage` component, inside the Appearance `<CardContent>`, add a separator and the picker after the existing theme toggle `<div>`. The Appearance CardContent (lines 216-228) should become:

```tsx
          <CardContent className="space-y-4">
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
            <AccentColorPicker />
          </CardContent>
```

Note: Change `<CardContent>` to `<CardContent className="space-y-4">` for proper spacing.

**Step 3: Verify**

Run: `npm run dev`, navigate to Settings.
Expected: The Appearance card shows the theme toggle and below it the accent color swatches. Clicking a swatch changes the primary color throughout the app. Clicking the rainbow circle opens the native color picker. Refreshing the page persists the choice.

**Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add accent color picker to Settings appearance card"
```
