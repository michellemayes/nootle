import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";

const navItems = [
  { to: "/", label: "Meetings", icon: "\uD83C\uDFA4" },
  { to: "/templates", label: "Templates", icon: "\uD83D\uDCC4" },
  { to: "/prompts", label: "Prompts", icon: "\u2728" },
  { to: "/settings", label: "Settings", icon: "\u2699\uFE0F" },
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
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
          whileHover={{ rotate: [0, -3, 3, 0] }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          onClick={handleLogoClick}
        >
          N
        </motion.div>
        <span className="text-lg font-semibold tracking-tight">Nootle</span>
      </div>

      {/* New Recording Button */}
      <div className="px-3 pb-2">
        <MotionButton
          className="w-full justify-start gap-2"
          onClick={() => navigate("/recording")}
        >
          <span className="text-base leading-none">{"\u23FA"}</span>
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
              className="text-base leading-none"
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 300, damping: 10 }}
            >
              {item.icon}
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
          {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
        </Button>
      </div>
    </motion.aside>
  );
}
