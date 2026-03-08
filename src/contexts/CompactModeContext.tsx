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
