--------------------------- MODULE CancelRegistry ---------------------------
(***************************************************************************)
(* The "one cancellable job per slot" pattern used twice in the backend:   *)
(*                                                                         *)
(*  MODE = "download": `model_download::DownloadManager` behind the        *)
(*    `download_model` / `cancel_download` commands. One slot for the      *)
(*    whole app; starting a download cancels the one in flight.            *)
(*                                                                         *)
(*  MODE = "summary": `commands::SummaryJobsState` behind                  *)
(*    `generate_summary` / `cancel_summary`, for one meeting's slot.       *)
(*                                                                         *)
(* Each step is one critical section of the real code. Starting a job      *)
(* (`new_token` / `start`) cancels the token in the slot and stores its    *)
(* own, atomically. The user's Cancel (`cancel` / `cancel_summary`) takes  *)
(* the token out of the slot and cancels it. When the job's future ends,   *)
(* it gives the slot back:                                                 *)
(*   download: `clear_token()` empties the slot unconditionally.           *)
(*   summary:  `finish()` reads `token.is_cancelled()`, then takes the     *)
(*             lock to remove the slot: two steps.                         *)
(* FIXED models the corrected code: the job empties the slot only if its   *)
(* own token is not cancelled, checked under the same lock.                *)
(***************************************************************************)
CONSTANTS Jobs, MODE, FIXED, NoJob

VARIABLES
    slot,       \* whose token the registry holds
    cancelled,  \* tokens that have been cancelled
    pc          \* each job's progress

vars == <<slot, cancelled, pc>>

Init ==
    /\ slot = NoJob
    /\ cancelled = {}
    /\ pc = [j \in Jobs |-> "idle"]

Cancel(t) == cancelled' = IF t = NoJob THEN cancelled ELSE cancelled \cup {t}

\* new_token() / SummaryJobsState::start: cancel the old job, register ours.
Start(j) ==
    /\ pc[j] = "idle"
    /\ Cancel(slot)
    /\ slot' = j
    /\ pc' = [pc EXCEPT ![j] = "running"]

\* cancel_download / cancel_summary.
UserCancel ==
    /\ slot # NoJob
    /\ Cancel(slot)
    /\ slot' = NoJob
    /\ UNCHANGED pc

\* The job's future returns (finished or cancelled) and it gives the slot
\* back in one critical section.
FinishAtomic(j) ==
    /\ pc[j] = "running"
    /\ IF MODE = "download" /\ ~FIXED
         THEN slot' = NoJob                           \* clear_token()
         ELSE slot' = IF j \in cancelled THEN slot ELSE NoJob
    /\ pc' = [pc EXCEPT ![j] = "done"]
    /\ UNCHANGED cancelled

\* SummaryJobsState::finish as written: `if !token.is_cancelled()` runs
\* before `self.jobs()` takes the lock.
CheckCancelled(j) ==
    /\ pc[j] = "running"
    /\ pc' = [pc EXCEPT ![j] = IF j \in cancelled THEN "done" ELSE "checked"]
    /\ UNCHANGED <<slot, cancelled>>

RemoveSlot(j) ==
    /\ pc[j] = "checked"
    /\ slot' = NoJob
    /\ pc' = [pc EXCEPT ![j] = "done"]
    /\ UNCHANGED cancelled

Finish(j) ==
    IF MODE = "summary" /\ ~FIXED
      THEN CheckCancelled(j) \/ RemoveSlot(j)
      ELSE FinishAtomic(j)

Next == UserCancel \/ \E j \in Jobs : Start(j) \/ Finish(j)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
\* A job that is still running and hasn't been cancelled can be stopped by
\* the Cancel button: its token is the one in the slot.
CancelReachesRunningJob ==
    \A j \in Jobs :
        pc[j] \in {"running", "checked"} /\ j \notin cancelled => slot = j

TypeOK ==
    /\ slot \in Jobs \cup {NoJob}
    /\ cancelled \subseteq Jobs
    /\ pc \in [Jobs -> {"idle", "running", "checked", "done"}]
=============================================================================
