import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  accentHue: number;
  accentChroma: number;
  setAccentColor: (hue: number, chroma: number) => void;
  surfaceHue: number;
  surfaceTint: number;
  setSurfaceColor: (hue: number, tint: number) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

// CSS variables that get accent-tinted, with per-mode lightness values
const ACCENT_VARS = {
  light: {
    "--primary": 0.541,
    "--ring": 0.541,
    "--sidebar-primary": 0.541,
    "--sidebar-ring": 0.541,
  },
  dark: {
    "--primary": 0.627,
    "--ring": 0.541,
    "--sidebar-primary": 0.627,
    "--sidebar-ring": 0.541,
  },
} as const;

function applyAccentToDOM(hue: number, chroma: number, theme: Theme) {
  const root = document.documentElement;
  const isDefault = chroma === 0;

  if (isDefault) {
    // Remove inline overrides so the CSS defaults take over
    for (const varName of Object.keys(ACCENT_VARS.light)) {
      root.style.removeProperty(varName);
    }
    return;
  }

  const vars = ACCENT_VARS[theme];
  for (const [varName, lightness] of Object.entries(vars)) {
    root.style.setProperty(varName, `oklch(${lightness} ${chroma} ${hue})`);
  }
}

// Background theme: hue plus a chroma multiplier for every surface color
// (see --surface-hue / --surface-tint in index.css). Tint 0 is neutral, which
// also switches light mode to a pure-white page.
export const DEFAULT_SURFACE = { hue: 293, tint: 1 } as const;

function applySurfaceToDOM(hue: number, tint: number) {
  const root = document.documentElement;
  root.style.setProperty("--surface-hue", String(hue));
  root.style.setProperty("--surface-tint", String(tint));
  if (tint === 0) root.dataset.surface = "neutral";
  else delete root.dataset.surface;
}

function readStoredNumber(key: string, fallback: number): number {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const n = Number(stored);
  return Number.isFinite(n) ? n : fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return stored === "dark" ? "dark" : "light";
  });

  const [accentHue, setAccentHue] = useState<number>(() => {
    const stored = localStorage.getItem("accent-hue");
    return stored ? (Number(stored) || 0) : 0;
  });

  const [accentChroma, setAccentChroma] = useState<number>(() => {
    const stored = localStorage.getItem("accent-chroma");
    return stored ? (Number(stored) || 0) : 0;
  });

  const [surfaceHue, setSurfaceHue] = useState(() => readStoredNumber("surface-hue", DEFAULT_SURFACE.hue));
  const [surfaceTint, setSurfaceTint] = useState(() => readStoredNumber("surface-tint", DEFAULT_SURFACE.tint));

  useEffect(() => {
    // Apply the .dark class to <html> so it's on the same element as the inline
    // accent styles. If we put .dark on a descendant div instead, its rule
    // redefines --primary inside the subtree and overrides the user's accent.
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    applyAccentToDOM(accentHue, accentChroma, theme);
    localStorage.setItem("accent-hue", String(accentHue));
    localStorage.setItem("accent-chroma", String(accentChroma));
  }, [accentHue, accentChroma, theme]);

  useEffect(() => {
    applySurfaceToDOM(surfaceHue, surfaceTint);
    localStorage.setItem("surface-hue", String(surfaceHue));
    localStorage.setItem("surface-tint", String(surfaceTint));
  }, [surfaceHue, surfaceTint]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const setAccentColor = useCallback((hue: number, chroma: number) => {
    setAccentHue(hue);
    setAccentChroma(chroma);
  }, []);

  const setSurfaceColor = useCallback((hue: number, tint: number) => {
    setSurfaceHue(hue);
    setSurfaceTint(tint);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, accentHue, accentChroma, setAccentColor, surfaceHue, surfaceTint, setSurfaceColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
