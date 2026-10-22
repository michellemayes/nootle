# Formal models

TLA+ models of the parts of the backend where an interleaving or an odd
input sequence can break a promise the rest of the code relies on. TLC
checks every behaviour up to a bound, and each bug it found has a Rust unit
test that reproduces it with the real code and constants.

```bash
formal/tla/check.sh   # needs Java 11+; fetches tla2tools.jar on first run
```

Each spec has a `FIXED` constant. `check.sh` runs both: `FIXED = TRUE`
models the code as it is now and must pass; `FALSE` models the code before
its fix and must still find the bug, which keeps the models honest (a model
that can't find a known bug proves little about the fix). It writes the
TLC configs itself, from the constants at its top.

## `tla/Endpointer.tla`: speech endpointing and the live audio buffer

Models `vad::Endpointer` frame by frame (speech probabilities abstracted to
four ordered levels) together with `pipeline::LiveTranscriber`, which drops
audio before `retain_from()` at the end of every chunk. Invariants:

| Invariant | Meaning |
|---|---|
| `NotInverted` | every utterance handed out ends after it starts |
| `RetainHonoured` | no utterance starts before a `retain_from()` already returned, so the transcriber still holds all its audio |
| `NoRepeatedAudio` | consecutive utterances never share audio |

**Found:** when an utterance reaches the 15 s limit inside a pause, the cut
lands in the silence after the speech. When that pause then ends the
utterance, the endpointer:

1. handed out a backwards utterance (end before start), which the
   transcriber happened to skip, and
2. moved `retain_from()` back by up to 4 frames, so the next utterance's
   192 ms lead-in reached into audio the transcriber had already dropped,
   and was cut to 64 ms. It takes a cut 12–15 frames into the pause and a
   chunk boundary in the few frames after it, so it is rare, but it can
   clip the first sound of the next sentence.

Tests: `vad::tests::a_cut_followed_only_by_silence_is_not_an_utterance`,
`vad::tests::retain_from_never_takes_back_audio_it_released`.
Fix: a cut that lands after the last speech now ends the utterance, as the
pause would have, instead of carrying on with a piece of silence. And the
endpointer remembers where its last utterance ended and never pads (or
lets `retain_from()` reach) back past it.

The constants are scaled down from the real ones (in frames: pad 6, minimum
speech 8, silence 16, split search 125, limit 469) keeping their order. The
ratios matter: with a pad of 2 frames TLC finds the backwards utterance but
can't show the retain bug, which needs a pad of 3 or more, so `check.sh`
runs both. The model also showed that, before the fix, the code relied on
`2 * PAD_MS <= MIN_SILENCE_MS`: with a longer pad, neighbouring utterances
would repeat audio. Padding now stops at the previous utterance instead.

## `tla/CancelRegistry.tla`: cancellable jobs

The "one cancellable job per slot" pattern behind `download_model` /
`cancel_download` (`model_download::DownloadManager`, `MODE = "download"`)
and `generate_summary` / `cancel_summary` (`commands::SummaryJobsState`,
`MODE = "summary"`). Invariant `CancelReachesRunningJob`: a running job that
hasn't been cancelled is the one the Cancel button reaches.

**Found:**

- *Download:* starting a second model's download cancels the first, which
  then returns and clears the slot, taking the second download's token with
  it. Cancel then does nothing until the second download ends.
  Test: `model_download::tests::a_replaced_download_finishing_keeps_the_new_one_cancellable`.
- *Summary:* `finish` checked `is_cancelled()` before taking the lock, so a
  summary started in that gap was dropped from the registry and Stop no
  longer reached it.
  Test: `commands::tests::a_finishing_summary_keeps_its_replacement_cancellable`.

Fix for both: a job gives the slot back only if its own token wasn't
cancelled, checked under the registry's lock. Every token that leaves the
slot is cancelled under that lock, so an uncancelled token is still the one
in the slot.
