import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

const navItems = [
  { to: "/", label: "Meetings", icon: "\uD83C\uDFA4" },
  { to: "/templates", label: "Templates", icon: "\uD83D\uDCC4" },
  { to: "/prompts", label: "Prompts", icon: "\u2728" },
  { to: "/settings", label: "Settings", icon: "\u2699\uFE0F" },
  { to: "/help", label: "Help", icon: "\u2753" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 pt-6 pb-4">
        <img src="/nootle-icon.svg" alt="Nootle" className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight">Nootle</span>
      </div>

      {/* New Recording Button */}
      <div className="px-3 pb-2">
        <Button
          className="w-full justify-start gap-2"
          onClick={() => navigate("/recording")}
        >
          <span className="text-base leading-none">{"\u23FA"}</span>
          New Recording
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-xs text-muted-foreground">Nootle v0.1.0</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="h-8 w-8 p-0"
        >
          {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
        </Button>
      </div>
    </aside>
  );
}
