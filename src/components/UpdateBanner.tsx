import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useIsRecording } from "@/hooks/useRecording";
import { checkForUpdates, dismissUpdate, installUpdate, useUpdater, type UpdaterState } from "@/hooks/useUpdater";

function visible(s: UpdaterState): boolean {
  if (s.dismissed) return false;
  if (s.status === "available" || s.status === "downloading") return true;
  // Background checks stay silent unless they find something.
  return s.manual && (s.status === "checking" || s.status === "upToDate" || s.status === "error");
}

/** Bottom-right card offering a one-click install whenever a new version is out. */
export function UpdateBanner() {
  const updater = useUpdater();
  const show = visible(updater);

  useEffect(() => {
    if (!show || updater.status !== "upToDate") return;
    const t = setTimeout(dismissUpdate, 4000);
    return () => clearTimeout(t);
  }, [show, updater.status]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-4 right-4 z-50 w-80"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          <div
            role="status"
            className="flex gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-xl"
          >
            <BannerBody updater={updater} />
            {updater.status !== "downloading" && (
              <button
                type="button"
                onClick={dismissUpdate}
                className="-mr-1 self-start rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BannerBody({ updater }: { updater: UpdaterState }) {
  switch (updater.status) {
    case "checking":
      return <Row icon={<Loader2 className="h-4 w-4 animate-spin" />} title="Checking for updates…" />;
    case "upToDate":
      return (
        <Row
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          title="You're up to date"
          detail="You're running the latest version of Nootle."
        />
      );
    case "error":
      return (
        <Row
          icon={<AlertCircle className="h-4 w-4 text-destructive" />}
          title="Couldn't update"
          detail="Check your internet connection and try again."
        >
          <Button size="sm" variant="outline" className="w-full" onClick={() => checkForUpdates(true)}>
            Try again
          </Button>
        </Row>
      );
    case "downloading":
      return (
        <Row
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
          title={`Installing Nootle ${updater.version}`}
          detail={updater.progress === null ? "Downloading…" : `Downloading… ${updater.progress}%`}
        >
          <Progress percent={updater.progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">Nootle will restart when it's done.</p>
        </Row>
      );
    case "available":
      return <AvailableBody version={updater.version} />;
    default:
      return null;
  }
}

/** Split out so the recording check only runs while an install is on offer. */
function AvailableBody({ version }: { version: string | null }) {
  const isRecording = useIsRecording();
  return (
    <Row
      icon={<Download className="h-4 w-4 text-primary" />}
      title={`Nootle ${version} is available`}
      detail={isRecording ? "Finish your recording to install it." : "Install now — Nootle will restart."}
    >
      <Button size="sm" className="w-full" disabled={isRecording} onClick={installUpdate}>
        Install &amp; Restart
      </Button>
    </Row>
  );
}

function Row({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
