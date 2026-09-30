import type { DownloadProgress, ModelVariant } from "@/hooks/useModelDownload";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";

/** Radio group for choosing which variant of a model to download. */
export function VariantPicker({
  name,
  variants,
  selected,
  onSelect,
}: {
  name: string;
  variants: ModelVariant[];
  selected: string;
  onSelect: (variantId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {variants.map((variant) => (
        <label key={variant.id} className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={selected === variant.id}
            onChange={() => onSelect(variant.id)}
            className="accent-primary"
          />
          <span className="text-xs text-foreground">{variant.label}</span>
          <span className="text-xs text-muted-foreground">
            ({formatBytes(variant.total_size_bytes)})
          </span>
        </label>
      ))}
    </div>
  );
}

/** Progress bar and status line for a model that is downloading or verifying. */
export function DownloadProgressBar({ progress }: { progress: DownloadProgress }) {
  const percent = Math.round(progress.overall_percent * 100);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {progress.state === "verifying"
            ? "Verifying…"
            : `Downloading ${progress.current_file}`}
        </span>
        <span>{percent}%</span>
      </div>
      <Progress percent={percent} />
    </div>
  );
}
