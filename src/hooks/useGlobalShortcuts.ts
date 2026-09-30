import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { navItems } from "@/lib/navigation";
import { toggleCommandPalette } from "@/components/CommandPalette";

const ROUTES: Record<string, string> = {
  n: "/recording",
  ",": "/settings",
  ...Object.fromEntries(navItems.map((item, i) => [String(i + 1), item.to])),
};

/**
 * App-wide shortcuts: ⌘K opens the command palette, ⌘N starts (or returns
 * to) a recording, ⌘1…⌘6 jump between pages, ⌘, opens Settings.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      const to = ROUTES[key];
      if (!to) return;
      e.preventDefault();
      if (window.location.pathname !== to) navigate(to);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
