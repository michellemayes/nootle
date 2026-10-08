import { NavLink, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAppVersion } from "@/hooks/useAppVersion";
import { useGlobalLLMSelection } from "@/contexts/LLMSelectionContext";
import { useCompactMode } from "@/contexts/CompactModeContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { NootleLogo } from "@/components/NootleLogo";
import { Circle, Moon, Sun, Bot, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { Kbd } from "@/components/Kbd";
import { useIsRecording } from "@/hooks/useRecording";
import { toggleCommandPalette } from "@/components/CommandPalette";

export function Sidebar() {
  const navigate = useNavigate();
  const isRecording = useIsRecording();
  const { theme, toggleTheme } = useTheme();
  const version = useAppVersion();
  const { selectedProvider, selectedModel, providers, models, filteredModels, changeProvider, setSelectedModel } = useGlobalLLMSelection();
  const { isCompact, isAutoCompact, toggleCollapsed } = useCompactMode();

  return (
    <aside
      className={cn("group/sidebar flex flex-col bg-sidebar backdrop-blur-xl backdrop-saturate-[1.8] border-r border-sidebar-border transition-[width] duration-200 ease-out", isCompact ? "w-12" : "w-60")}
    >
      {/* Logo */}
      <div data-tauri-drag-region className={cn("relative flex items-center px-5 pt-10 pb-4", isCompact ? "justify-center px-2" : "gap-2")}>
        <NootleLogo className="h-8 w-8 shrink-0 text-primary" aria-label="Nootle" />
        {!isCompact && <span className="text-lg font-semibold tracking-tight">Nootle</span>}
        {!isAutoCompact && (
          <button
            onClick={toggleCollapsed}
            aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors",
              isCompact ? "absolute right-1 top-10 opacity-0 group-hover/sidebar:opacity-100 transition-opacity" : "ml-auto",
            )}
            title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCompact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* New Recording Button */}
      <div className="space-y-1.5 px-3 pb-2">
        <Button
          className={cn(
            isCompact ? "w-full aspect-square justify-center" : "w-full justify-start gap-2",
            isRecording && "bg-destructive hover:bg-destructive/90 text-white",
          )}
          onClick={() => navigate("/recording")}
          title={isRecording ? "Back to recording" : "New recording (⌘N)"}
        >
          {isRecording ? (
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          {!isCompact && (isRecording ? "Back to recording" : "New recording")}
          {!isCompact && !isRecording && (
            <Kbd onSolid className="ml-auto">⌘N</Kbd>
          )}
        </Button>
        <button
          type="button"
          onClick={toggleCommandPalette}
          title="Search or jump to… (⌘K)"
          className={cn(
            "flex w-full items-center rounded-md border border-sidebar-border text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
            isCompact ? "justify-center py-2" : "gap-2 px-2.5 py-1.5",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!isCompact && (
            <>
              <span className="flex-1 text-left">Search or jump to…</span>
              <Kbd>⌘K</Kbd>
            </>
          )}
        </button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-3">
        {navItems.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={`${item.label} (⌘${i + 1})`}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md transition-colors",
                isCompact ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                "text-sm font-medium",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCompact && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!isCompact && (
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
                <Select
                  size="xs"
                  containerClassName="w-full"
                  value={selectedProvider}
                  onChange={(e) => changeProvider(e.target.value)}
                  aria-label="LLM provider"
                >
                  <option value="">Provider</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
                <Select
                  size="xs"
                  containerClassName="w-full"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  aria-label="LLM model"
                >
                  <option value="">Model</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center justify-between px-2">
            <p className="text-xs text-muted-foreground">v{version}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
