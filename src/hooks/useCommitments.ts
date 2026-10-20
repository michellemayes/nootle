import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "@/components/Toaster";
import type { Commitment, CommitmentStatus } from "@/types";

/** Commitments (action items with an owner), optionally one person's,
 * kept fresh as meetings are checked. `setStatus` marks one by hand. */
export function useCommitments(owner?: string) {
  const [commitments, setCommitments] = useState<Commitment[] | null>(null);

  const refresh = useCallback(() => {
    invoke<Commitment[]>("list_commitments", { owner: owner ?? null, status: null })
      .then(setCommitments)
      .catch(() => setCommitments([]));
  }, [owner]);

  useEffect(() => {
    refresh();
    const unlisteners = ["commitments-updated", "insights-updated"].map((event) =>
      listen(event, refresh),
    );
    return () => unlisteners.forEach((u) => u.then((fn) => fn()));
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: CommitmentStatus) => {
    try {
      const updated = await invoke<Commitment>("update_commitment", { id, status });
      setCommitments((list) => list?.map((c) => (c.id === id ? updated : c)) ?? null);
    } catch (err) {
      toast(String(err));
    }
  }, []);

  return { commitments, setStatus, refresh };
}
