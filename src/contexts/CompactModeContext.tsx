import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";

interface CompactModeContextValue {
  isCompact: boolean;
}

const CompactModeContext = createContext<CompactModeContextValue | null>(null);

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

    const unlistenResize = appWindow.onResized(() => checkCompact());
    const unlistenMove = appWindow.onMoved(() => checkCompact());

    return () => {
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
