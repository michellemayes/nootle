import { CloudOff, CreditCard, Gift, LogIn, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/CopyButton";
import { toast } from "@/components/Toaster";
import { useBusyAction } from "@/hooks/useBusyAction";
import { openUpgrade, usePlan } from "@/hooks/usePlan";
import { PRO_FEATURE_IDS, PRO_FEATURES, REFERRAL_DISCOUNT_PERCENT, TRIAL_DAYS } from "@/lib/plan";
import { cn, formatDate } from "@/lib/utils";
import type { AccountStatus } from "@/types";

function TrialRing({ left, total }: { left: number; total: number }) {
  const r = 26;
  const length = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${share * length} ${length}`}
          className={share > 0 ? "stroke-primary" : "stroke-transparent"}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-semibold tabular-nums">{left}</span>
        <span className="text-[10px] text-muted-foreground">{left === 1 ? "day" : "days"}</span>
      </span>
    </div>
  );
}

const INTERVAL_LABEL = { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" } as const;

/** The headline, the line under it, and whether a paid plan is behind it. */
function describe(s: AccountStatus): { title: string; detail: string; paid: boolean } {
  const plan = s.plan;
  if (s.source === "plan" && plan) {
    const interval = plan.interval ? INTERVAL_LABEL[plan.interval] : null;
    const title = interval ? `Nootle Pro · ${interval}` : "Nootle Pro";
    if (plan.interval === "lifetime") return { title, detail: "Yours for good", paid: true };
    if (plan.endsAt) return { title, detail: `Canceled · Pro until ${formatDate(plan.endsAt)}`, paid: true };
    if (plan.renewsAt) return { title, detail: `Renews ${formatDate(plan.renewsAt)}`, paid: true };
    return { title, detail: "Active", paid: true };
  }
  if (s.source === "bonus") {
    return { title: "Nootle Pro · from invites", detail: s.proUntil ? `Until ${formatDate(s.proUntil)}` : "Active", paid: false };
  }
  if (s.source === "trial") {
    return { title: "Pro trial", detail: `Ends ${formatDate(s.trialEndsAt)}`, paid: false };
  }
  return { title: "Free", detail: `Your Pro trial ended ${formatDate(s.trialEndsAt)}`, paid: false };
}

function PlanCard({ status }: { status: AccountStatus }) {
  const { signIn, refresh, signOut, openBilling } = usePlan();
  const { busy, run } = useBusyAction();
  const { title, detail, paid } = describe(status);
  const trialTotal = status.trialDaysLeft > TRIAL_DAYS ? 30 : TRIAL_DAYS;
  const fail = (what: string) => (err: unknown) => {
    toast(`Couldn't ${what}: ${err}`);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          {status.source === "trial" ? (
            <TrialRing left={status.trialDaysLeft} total={trialTotal} />
          ) : (
            <span
              className={cn(
                "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
                status.pro ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Sparkles className="h-7 w-7" />
            </span>
          )}
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-lg font-semibold leading-tight">{title}</p>
            <p className="text-sm text-muted-foreground">{detail}</p>
          </div>
          {!paid && (
            <Button onClick={() => openUpgrade()}>
              <Sparkles />
              Upgrade
            </Button>
          )}
        </div>

        {!paid && (
          <div className="flex flex-wrap gap-1.5">
            {PRO_FEATURE_IDS.map((id) => {
              const { name, icon: Icon } = PRO_FEATURES[id];
              return (
                <span
                  key={id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    status.pro ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-3 w-3", status.pro && "text-primary")} />
                  {name}
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {status.signedIn ? (
            <>
              <p className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-sm">
                <span className="truncate">{status.email}</span>
                {status.offline && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Couldn't reach nootle.ai; showing your plan as last seen">
                    <CloudOff className="h-3 w-3" />
                    Offline
                  </span>
                )}
              </p>
              {paid && (
                <Button variant="outline" size="sm" onClick={() => openBilling().catch(fail("open billing"))}>
                  <CreditCard />
                  Manage billing
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                title="Refresh"
                disabled={busy}
                onClick={() => run(() => refresh().catch(fail("refresh")))}
              >
                <RefreshCw className={cn(busy && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut().catch(fail("sign out"))}>
                <LogOut />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 basis-40 text-sm text-muted-foreground">Bought Pro already?</p>
              <Button variant="outline" size="sm" onClick={() => signIn().catch(fail("open sign-in"))}>
                <LogIn />
                Sign in
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 flex-1 basis-20 rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InviteCard({ status }: { status: AccountStatus }) {
  const { signIn } = usePlan();
  const referral = status.referral;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          Invite friends
        </CardTitle>
        <CardDescription>
          Give {REFERRAL_DISCOUNT_PERCENT}% off, get a month of Pro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {referral ? (
          <>
            <div className="flex items-center gap-1">
              <Input
                readOnly
                value={referral.url}
                className="h-8 text-xs"
                onFocus={(e) => e.target.select()}
                aria-label="Your invite link"
              />
              <CopyButton text={referral.url} variant="button" label="Copy link" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Stat value={referral.joined} label="Joined" />
              <Stat value={referral.paid} label="Paid" />
              <Stat value={referral.monthsEarned} label={referral.monthsEarned === 1 ? "Month earned" : "Months earned"} />
            </div>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => signIn().catch(() => {})}>
            <LogIn />
            Sign in for your link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Settings → Plan: the trial or plan, the account, and the invite link. */
export function PlanSettings() {
  const { status } = usePlan();
  if (!status) return null;
  return (
    <>
      <PlanCard status={status} />
      <InviteCard status={status} />
    </>
  );
}
