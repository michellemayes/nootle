import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Mic, FileText, Sparkles, Settings, HelpCircle, Circle, Moon, Sun, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Meetings", icon: Mic },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/prompts", label: "Prompts", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [wiggleSidebar, setWiggleSidebar] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleLogoClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 1000);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setWiggleSidebar(true);
      setTimeout(() => setWiggleSidebar(false), 500);
    }
  };

  return (
    <motion.aside
      className="flex h-screen w-60 flex-col border-r bg-card"
      animate={
        wiggleSidebar
          ? {
              x: [0, -2, 3, -3, 2, -1, 0],
            }
          : {}
      }
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 pt-6 pb-4">
        <motion.div
          className="cursor-pointer"
          whileHover={{ rotate: [0, -3, 3, 0] }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          onClick={handleLogoClick}
        >
          <img src="/nootle-icon.png" alt="Nootle" className="h-8 w-8 rounded-lg" />
        </motion.div>
        <span className="text-lg font-semibold tracking-tight">Nootle</span>
      </div>

      {/* New Recording Button */}
      <div className="px-3 pb-2">
        <MotionButton
          className="w-full justify-start gap-2"
          onClick={() => navigate("/recording")}
        >
          <Circle className="h-4 w-4" />
          Record Something
        </MotionButton>
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
            <motion.span
              className="inline-flex"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 300, damping: 10 }}
            >
              <item.icon className="h-4 w-4" />
            </motion.span>
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
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </div>
    </motion.aside>
  );
}
