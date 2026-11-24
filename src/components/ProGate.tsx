import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openUpgrade, usePlan } from "@/hooks/usePlan";
import { PRO_FEATURES, type ProFeatureId } from "@/lib/plan";
import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary",
        className,
      )}
    >
      Pro
    </span>
  );
}

/** What a Pro feature does, with Upgrade (and Sign in when signed out), shown in its place. */
export function ProUpsell({
  feature,
  compact = false,
  className,
}: {
  feature: ProFeatureId;
  compact?: boolean;
  className?: string;
}) {
  const { status, signIn } = usePlan();
  const { name, value, icon: Icon } = PRO_FEATURES[feature];
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => openUpgrade(feature)}>
        <Sparkles />
        Upgrade
      </Button>
      {status && !status.signedIn && (
        <Button size="sm" variant="ghost" onClick={() => signIn().catch(() => {})}>
          Sign in
        </Button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-primary/25 bg-primary/[0.03] px-3 py-2.5",
          className,
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 basis-48 text-sm">
          <span className="font-medium">{name}</span> <ProBadge className="ml-1 align-[1px]" />
          <span className="block text-xs text-muted-foreground">{value}</span>
        </p>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-gradient-to-br from-primary/[0.08] via-card to-card p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {name}
            <ProBadge />
          </p>
          <p className="text-sm text-muted-foreground">{value}</p>
        </div>
      </div>
      <div className="mt-4 pl-12">{actions}</div>
    </div>
  );
}

/** Shows `children` with Pro, and the feature's upsell in their place without. */
export function ProGate({
  feature,
  children,
  compact,
  className,
}: {
  feature: ProFeatureId;
  children: ReactNode;
  compact?: boolean;
  /** For the upsell, e.g. to give it the room the feature would have had. */
  className?: string;
}) {
  const { pro } = usePlan();
  if (pro) return <>{children}</>;
  return <ProUpsell feature={feature} compact={compact} className={className} />;
}

/** A toolbar button standing in for a locked Pro menu; it opens the upgrade dialog. */
export function ProLockedButton({ feature, icon: Icon }: { feature: ProFeatureId; icon: LucideIcon }) {
  const { name } = PRO_FEATURES[feature];
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 px-2"
      title={`${name} is part of Nootle Pro`}
      aria-label={`${name} (Pro)`}
      onClick={() => openUpgrade(feature)}
    >
      <Icon className="h-4 w-4" />
      <ProBadge />
    </Button>
  );
}

/**
 * For a Pro feature's on/off switch: `locked` without Pro, and `guard` wraps
 * the setter so turning it on opens the upgrade dialog instead.
 */
export function useProGuard(feature: ProFeatureId) {
  const { pro } = usePlan();
  const guard =
    (set: (on: boolean) => void) =>
    (on: boolean) => {
      if (on && !pro) openUpgrade(feature);
      else set(on);
    };
  return { locked: !pro, guard };
}
