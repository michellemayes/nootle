import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAppVersion } from "@/hooks/useAppVersion";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/MotionButton";
import { Mic, Settings, HelpCircle, Circle, Moon, Sun, Lightbulb, MessageSquare, FileText, Bot } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Meetings", icon: Mic },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: HelpCircle },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const version = useAppVersion();
  const { selectedProvider, selectedModel, providers, models, filteredModels, changeProvider, setSelectedModel } = useGlobalLLMSelection();
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
      className="flex h-screen w-60 flex-col bg-sidebar backdrop-blur-xl backdrop-saturate-[1.8] shadow-[1px_0_0_0_var(--sidebar-border)]"
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
      <div className="flex items-center gap-2 px-5 pt-6 pb-4 [-webkit-app-region:drag]">
        <motion.div
          className="cursor-pointer [-webkit-app-region:no-drag]"
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
      <div className="space-y-2 px-3 pb-4">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors">
              <Bot className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {selectedModel
                  ? models.find((m) => m.id === selectedModel)?.name ?? selectedModel
                  : "No model selected"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-56 p-2">
            <div className="space-y-2">
              <select
                value={selectedProvider}
                onChange={(e) => changeProvider(e.target.value)}
                className="h-7 w-full rounded-md border bg-transparent px-2 text-xs"
              >
                <option value="">Provider</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-7 w-full rounded-md border bg-transparent px-2 text-xs"
              >
                <option value="">Model</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-between px-2">
          <p className="text-xs text-muted-foreground">v{version}</p>
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
      </div>
    </motion.aside>
  );
}
