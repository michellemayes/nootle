import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ModelFile {
  local_name: string;
  url: string;
  size_bytes: number;
  sha256: string;
}

export interface ModelVariant {
  id: string;
  name: string;
  label: string;
  files: ModelFile[];
  total_size_bytes: number;
}

export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  category: "Transcription" | "Diarization" | "Embedding";
  dir_name: string;
  variants: ModelVariant[];
}

export interface ModelOnDiskStatus {
  model_id: string;
  name: string;
  description: string;
  category: string;
  downloaded: boolean;
  /** The variant in use. */
  variant_id: string | null;
  /** Everything in the model's folder, leftovers included. */
  size_on_disk: number;
  installed: InstalledVariant[];
  /** Variants that can be downloaded alongside the installed ones. */
  downloadable: string[];
}

export interface InstalledVariant {
  variant_id: string;
  /** What deleting this variant frees. */
  size_on_disk: number;
}

export interface StorageUsage {
  models_bytes: number;
  recordings_bytes: number;
  logs_bytes: number;
  model_leftover_bytes: number;
  orphaned_recording_bytes: number;
  old_log_bytes: number;
}

export interface DownloadProgress {
  model_id: string;
  state:
    | "downloading"
    | "verifying"
    | "complete"
    | { error: { message: string } }
    | "cancelled";
  current_file: string;
  file_bytes_downloaded: number;
  file_total_bytes: number;
  overall_percent: number;
}

export function useModelDownload() {
  const [registry, setRegistry] = useState<ModelDefinition[]>([]);
  const [diskStatus, setDiskStatus] = useState<ModelOnDiskStatus[]>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [models, status] = await Promise.all([
        invoke<ModelDefinition[]>("get_available_models"),
        invoke<ModelOnDiskStatus[]>("get_downloaded_models"),
      ]);
      setRegistry(models);
      setDiskStatus(status);
    } catch (e) {
      console.error("Failed to load model info:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for download progress events
  useEffect(() => {
    const unlistenPromise = listen<DownloadProgress>("model-download-progress", (event) => {
      setProgress(event.payload);

      // Auto-refresh disk status when download completes
      if (event.payload.state === "complete") {
        refresh();
        // Clear progress after a short delay
        setTimeout(() => setProgress(null), 1500);
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [refresh]);

  const downloadModel = useCallback(
    async (modelId: string, variantId: string) => {
      await invoke("download_model", {
        modelId,
        variantId,
      });
    },
    []
  );

  const cancelDownload = useCallback(async () => {
    await invoke("cancel_download");
    setProgress(null);
  }, []);

  const deleteModel = useCallback(
    async (modelId: string, variantId: string) => {
      await invoke("delete_model", { modelId, variantId });
      await refresh();
    },
    [refresh]
  );

  return {
    registry,
    diskStatus,
    progress,
    loading,
    refresh,
    downloadModel,
    cancelDownload,
    deleteModel,
  };
}
