import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { COMPACT_QUERY } from "@/lib/layout";

const STORAGE_KEY = "nootle-sidebar-collapsed";

interface CompactModeContextValue {
  isCompact: boolean;
  isAutoCompact: boolean;
  toggleCollapsed: () => void;
}

const CompactModeContext = createContext<CompactModeContextValue | null>(null);

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function CompactModeProvider({ children }: { children: React.ReactNode }) {
  // Below the compact width the sidebar becomes an icon rail, so the page
  // keeps the room. Keyed to the window's own width (not the display's), so it
  // behaves the same on every screen and in the browser-driven layout check.
  const [isAutoCompact, setIsAutoCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setIsAutoCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsManuallyCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const isCompact = isAutoCompact || isManuallyCollapsed;

  const value = useMemo(
    () => ({ isCompact, isAutoCompact, toggleCollapsed }),
    [isCompact, isAutoCompact, toggleCollapsed],
  );

  return (
    <CompactModeContext.Provider value={value}>
      {children}
    </CompactModeContext.Provider>
  );
}

export function useCompactMode() {
  const ctx = useContext(CompactModeContext);
  if (!ctx) throw new Error("useCompactMode must be used within CompactModeProvider");
  return ctx;
}
