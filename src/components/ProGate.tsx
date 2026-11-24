import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

export function ProUpsell({
  feature,
  compact = false,
  className,
}: {
  feature: ProFeatureId;
  compact?: boolean;
  className?: string;
}) {
  const {
    status,
    actions: { signIn },
  } = usePlan();
  const { name, value, icon: Icon } = PRO_FEATURES[feature];
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => openUpgrade(feature)}>
        <Sparkles />
        Upgrade
      </Button>
      {status && !status.signedIn && (
        <Button size="sm" variant="ghost" onClick={signIn}>
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

/** `children` with Pro; without, `fallback` or the feature's upsell. `locked` overrides the plan check. */
export function ProGate({
  feature,
  children,
  locked,
  fallback,
  compact,
  className,
}: {
  feature: ProFeatureId;
  children: ReactNode;
  locked?: boolean;
  fallback?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { pro } = usePlan();
  if (!(locked ?? !pro)) return <>{children}</>;
  return fallback ?? <ProUpsell feature={feature} compact={compact} className={className} />;
}

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

/** A settings row for a Pro feature's switch, from `useProSetting`; `extra` shows while it's on. */
export function ProSwitch({
  label,
  setting: [on, setOn, locked],
  extra,
  children,
}: {
  label: string;
  setting: readonly [boolean, (on: boolean) => void, boolean];
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          {label}
          {locked && <ProBadge />}
        </p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {on && extra}
        <Switch checked={on} onCheckedChange={setOn} aria-label={label} />
      </div>
    </div>
  );
}
