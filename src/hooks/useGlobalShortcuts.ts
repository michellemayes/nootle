import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { navItems } from "@/lib/navigation";

/**
 * App-wide shortcuts: ⌘N starts (or returns to) a recording, ⌘1…⌘6 jump
 * between pages, ⌘, opens Settings. ⌘K lives in CommandPalette.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        if (pathname !== "/recording") navigate("/recording");
        return;
      }
      if (key === "," && !e.shiftKey) {
        e.preventDefault();
        navigate("/settings");
        return;
      }
      const index = Number(e.key) - 1;
      if (!e.shiftKey && index >= 0 && index < navItems.length) {
        e.preventDefault();
        navigate(navItems[index].to);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, pathname]);
}
