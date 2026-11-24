import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { openUpgrade, usePlan } from "@/hooks/usePlan";
import { cn, plural } from "@/lib/utils";

export function PlanChip({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { status } = usePlan();
  if (!status || status.paidPro) return null;

  const trial = status.source === "trial";
  const label = trial ? `Pro trial · ${plural(status.trialDaysLeft, "day")}` : "Upgrade";
  const quiet = trial && status.trialDaysLeft > 3;

  return (
    <button
      type="button"
      onClick={() => (trial ? navigate("/settings?tab=plan") : openUpgrade())}
      title={trial ? `${label} left` : "Upgrade to Nootle Pro"}
      aria-label={trial ? `${label} left` : "Upgrade to Nootle Pro"}
      className={cn(
        "flex min-w-0 items-center rounded-full font-medium transition-colors",
        compact ? "mx-auto mb-2 h-8 w-8 justify-center" : "gap-1 px-1.5 py-0.5 text-[11px]",
        quiet
          ? "border border-sidebar-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          : "bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </button>
  );
}
