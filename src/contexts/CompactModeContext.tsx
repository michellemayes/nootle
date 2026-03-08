import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";

const STORAGE_KEY = "nootle-sidebar-collapsed";
const COMPACT_THRESHOLD_RATIO = 0.38;

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
  const [isAutoCompact, setIsAutoCompact] = useState(false);
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(readStoredCollapsed);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    async function checkCompact() {
      const [monitor, size] = await Promise.all([
        currentMonitor(),
        appWindow.innerSize(),
      ]);
      if (monitor) {
        const threshold = monitor.size.width * COMPACT_THRESHOLD_RATIO;
        setIsAutoCompact(size.width < threshold);
      }
    }

    function scheduleCheck() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(checkCompact, 150);
    }

    checkCompact();

    const unlistenResize = appWindow.onResized(scheduleCheck);
    const unlistenMove = appWindow.onMoved(scheduleCheck);

    return () => {
      clearTimeout(timerRef.current);
      unlistenResize.then((fn) => fn());
      unlistenMove.then((fn) => fn());
    };
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
