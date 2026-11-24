import { useCallback, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/Toaster";
import { usePlan, useUpgradeRequests } from "@/hooks/usePlan";
import { PRICES, PRO_FEATURE_IDS, PRO_FEATURES, monthlyEquivalent, type PlanInterval, type ProFeatureId } from "@/lib/plan";
import { cn } from "@/lib/utils";

/** Mounted once; `openUpgrade()` opens it. */
export function UpgradeDialog() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<ProFeatureId | undefined>();
  const [interval, setChoice] = useState<PlanInterval>("yearly");
  const {
    status,
    actions: { checkout, signIn },
  } = usePlan();

  useUpgradeRequests(
    useCallback((f?: ProFeatureId) => {
      setFeature(f);
      setOpen(true);
    }, []),
  );

  const lead = feature ? PRO_FEATURES[feature] : null;
  const buy = () => checkout(interval).catch((err) => toast(`Couldn't open checkout: ${err}`));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-5 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Nootle Pro</span>
          </div>
          <DialogTitle className="text-xl leading-tight">
            {lead ? `${lead.name} is part of Pro` : "Do more with every meeting"}
          </DialogTitle>
          <DialogDescription>
            {lead ? lead.value : "Recording, transcripts, summaries and search stay free forever."}
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Plan" className="grid gap-2 sm:grid-cols-3">
          {PRICES.map((p) => {
            const selected = p.interval === interval;
            const best = p.interval === "yearly";
            return (
              <button
                key={p.interval}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(p.interval)}
                className={cn(
                  "relative flex min-w-0 flex-col items-start rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "hover:bg-accent/50",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                  {p.label}
                  {best && (
                    <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                      Best value
                    </span>
                  )}
                </span>
                <span className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums">${p.price}</span>
                  <span className="text-xs text-muted-foreground">{p.cadence}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {best ? `${monthlyEquivalent(p)}/month` : p.interval === "lifetime" ? "Pay once, keep it" : "Cancel anytime"}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {PRO_FEATURE_IDS.map((id) => {
            const { name, icon: Icon } = PRO_FEATURES[id];
            return (
              <li key={id} className={cn("flex min-w-0 items-center gap-2 text-sm", id === feature && "font-medium")}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{name}</span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {status && !status.signedIn ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={signIn}
            >
              Already have Pro? Sign in
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              Checkout opens on nootle.ai
            </span>
          )}
          <Button onClick={buy} className="ml-auto">
            Continue to checkout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
