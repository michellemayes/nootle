import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { FloatingCard, FloatingCardRow } from "@/components/FloatingCard";
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
    <FloatingCard show={show} onDismiss={updater.status !== "downloading" ? dismissUpdate : undefined}>
      <BannerBody updater={updater} />
    </FloatingCard>
  );
}

function BannerBody({ updater }: { updater: UpdaterState }) {
  switch (updater.status) {
    case "checking":
      return <FloatingCardRow icon={<Loader2 className="h-4 w-4 animate-spin" />} title="Checking for updates…" />;
    case "upToDate":
      return (
        <FloatingCardRow
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          title="You're up to date"
          detail="You're running the latest version of Nootle."
        />
      );
    case "error":
      return (
        <FloatingCardRow
          icon={<AlertCircle className="h-4 w-4 text-destructive" />}
          title="Couldn't update"
          detail="Check your internet connection and try again."
        >
          <Button size="sm" variant="outline" className="w-full" onClick={() => checkForUpdates(true)}>
            Try again
          </Button>
        </FloatingCardRow>
      );
    case "downloading":
      return (
        <FloatingCardRow
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
          title={`Installing Nootle ${updater.version}`}
          detail={updater.progress === null ? "Downloading…" : `Downloading… ${updater.progress}%`}
        >
          <Progress percent={updater.progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">Nootle will restart when it's done.</p>
        </FloatingCardRow>
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
    <FloatingCardRow
      icon={<Download className="h-4 w-4 text-primary" />}
      title={`Nootle ${version} is available`}
      detail={isRecording ? "Finish your recording to install it." : "Install now — Nootle will restart."}
    >
      <Button size="sm" className="w-full" disabled={isRecording} onClick={installUpdate}>
        Install &amp; Restart
      </Button>
    </FloatingCardRow>
  );
}
