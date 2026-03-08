import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";

interface CompactModeContextValue {
  isCompact: boolean;
}

const CompactModeContext = createContext<CompactModeContextValue | null>(null);

export function CompactModeProvider({ children }: { children: React.ReactNode }) {
  const [isCompact, setIsCompact] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    async function checkCompact() {
      const [monitor, size] = await Promise.all([
        currentMonitor(),
        appWindow.innerSize(),
      ]);
      if (monitor) {
        const threshold = monitor.size.width * 0.25;
        setIsCompact(size.width < threshold);
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

  const value = useMemo(() => ({ isCompact }), [isCompact]);

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
