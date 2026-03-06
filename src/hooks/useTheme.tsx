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

// CSS variables that get accent-tinted, with per-mode lightness values
const ACCENT_VARS = {
  light: {
    "--primary": 0.45,
    "--ring": 0.6,
    "--sidebar-primary": 0.45,
    "--sidebar-ring": 0.6,
  },
  dark: {
    "--primary": 0.75,
    "--ring": 0.6,
    "--sidebar-primary": 0.75,
    "--sidebar-ring": 0.6,
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

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    applyAccentToDOM(accentHue, accentChroma, theme);
    localStorage.setItem("accent-hue", String(accentHue));
    localStorage.setItem("accent-chroma", String(accentChroma));
  }, [accentHue, accentChroma, theme]);

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
