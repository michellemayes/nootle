---------------------------- MODULE Endpointer ----------------------------
(***************************************************************************)
(* Model of `vad::Endpointer` (src-tauri/src/vad.rs) together with the way *)
(* `pipeline::LiveTranscriber::push` trims its audio buffer to             *)
(* `Endpointer::retain_from()`.                                            *)
(*                                                                         *)
(* Everything is measured in 32 ms frames. Speech probabilities are        *)
(* abstracted to four ordered levels:                                      *)
(*   0, 1  below END_THRESHOLD (silence; 0 is quieter than 1)              *)
(*   2     at least END_THRESHOLD but below START_THRESHOLD                *)
(*   3     at least START_THRESHOLD (speech)                               *)
(* The millisecond constants become frame counts, scaled down so TLC can   *)
(* explore every probability sequence up to MAXFRAMES frames.             *)
(***************************************************************************)
EXTENDS Integers, Sequences

CONSTANTS
    SIL,       \* MIN_SILENCE_MS in frames: a pause this long ends an utterance
    SPEECH,    \* MIN_SPEECH_MS in frames: shorter bursts are dropped
    PAD,       \* PAD_MS in frames
    MAXF,      \* MAX_UTTERANCE_MS in frames
    SEARCH,    \* SPLIT_SEARCH_MS in frames
    MAXFRAMES, \* length of the probability streams explored
    FIXED      \* model the corrected code (see `floor` below)

START == 3
END == 2
NONE == -1
\* "No utterance" for `out`, so it is always a record.
NoUtt == [ok |-> FALSE, start |-> 0, end |-> 0]
Levels == 0..3

Max(a, b) == IF a > b THEN a ELSE b
Min(a, b) == IF a < b THEN a ELSE b

VARIABLES
    seen,     \* Endpointer.frames_seen
    start,    \* Endpointer.speech_start (NONE for None)
    last,     \* Endpointer.last_speech
    probs,    \* Endpointer.probs
    cont,     \* Endpointer.continues_split
    flushed,  \* the stream has ended and flush() ran
    base,     \* LiveTranscriber.base: audio before this frame is dropped
    out,      \* utterance emitted by the last step, or NoUtt
    prevEnd,  \* end of the previously emitted utterance
    promised, \* highest retain_from() the pipeline has been told
    floor     \* FIXED only: Endpointer.floor, end of the last utterance

vars == <<seen, start, last, probs, cont, flushed, base, out, prevEnd, promised, floor>>

\* Endpointer::span, with `fs` the already-incremented frames_seen. The fix
\* stops start padding at the end of the previous utterance.
Span(s, e, padS, padE, fs) ==
    [ok    |-> TRUE,
     start |-> IF padS
                 THEN IF FIXED THEN Max(Max(s - PAD, 0), floor) ELSE Max(s - PAD, 0)
                 ELSE s,
     end   |-> Min(IF padE THEN e + PAD ELSE e, fs)]

\* Endpointer::retain_from
RetainAsWritten ==
    IF start # NONE /\ cont THEN start
    ELSE IF start # NONE THEN Max(start - PAD, 0)
    ELSE Max(seen - PAD, 0)

Retain == IF FIXED THEN Max(RetainAsWritten, floor) ELSE RetainAsWritten

\* First index (0-based) of the minimum of s[from+1..Len(s)], like
\* Iterator::min_by, which returns the first of equal minima.
MinIdx(s, from) ==
    CHOOSE i \in from..(Len(s) - 1) :
        \A j \in from..(Len(s) - 1) :
            s[i + 1] < s[j + 1] \/ (s[i + 1] = s[j + 1] /\ i <= j)

Emit(u) == /\ out' = u
           /\ prevEnd' = IF ~out.ok THEN prevEnd ELSE out.end
           /\ floor' = IF FIXED THEN u.end ELSE floor

NoEmit == /\ out' = NoUtt
          /\ prevEnd' = IF ~out.ok THEN prevEnd ELSE out.end
          /\ UNCHANGED floor

\* Endpointer::finish: whether an utterance is handed out. The fix drops a
\* piece that is all silence after a cut (end <= start).
Finishes(s, e, c) ==
    /\ FIXED => e > s
    /\ c \/ (e - s) >= SPEECH

Init ==
    /\ seen = 0 /\ start = NONE /\ last = 0 /\ probs = <<>>
    /\ cont = FALSE /\ flushed = FALSE /\ base = 0
    /\ out = NoUtt /\ prevEnd = 0 /\ promised = 0 /\ floor = 0

\* Endpointer::push(p)
Push(p) ==
    LET frame == seen
        fs == seen + 1
    IN
    /\ ~flushed
    /\ seen < MAXFRAMES
    /\ seen' = fs
    /\ UNCHANGED <<flushed, base, promised>>
    /\ IF start = NONE THEN
          /\ IF p >= START
               THEN /\ start' = frame /\ last' = frame
                    /\ probs' = <<p>> /\ cont' = FALSE
               ELSE UNCHANGED <<start, last, probs, cont>>
          /\ NoEmit
       ELSE
          LET ps == Append(probs, p)
              ls == IF p >= END THEN frame ELSE last
          IN
          /\ last' = ls
          /\ IF frame - ls >= SIL THEN
                \* finish(start, last_speech + 1); `||` short-circuits on cont
                /\ start' = NONE /\ probs' = <<>> /\ cont' = cont
                /\ IF Finishes(start, ls + 1, cont)
                     THEN Emit(Span(start, ls + 1, ~cont, TRUE, fs))
                     ELSE NoEmit
             ELSE IF frame + 1 - start >= MAXF THEN
                LET search == Min(SEARCH, Len(ps) - 1)
                    from == Len(ps) - search
                    split == MinIdx(ps, from)
                    e == start + split
                IN
                /\ probs' = SubSeq(ps, split + 1, Len(ps))
                /\ start' = e
                /\ cont' = TRUE
                /\ Emit(Span(start, e, ~cont, FALSE, fs))
             ELSE
                /\ probs' = ps
                /\ UNCHANGED <<start, cont>>
                /\ NoEmit

\* LiveTranscriber::push at the end of a chunk (any frame can end a chunk):
\* drop audio before min(retain_from(), scored).
Trim ==
    /\ ~flushed
    /\ base' = Max(base, Min(Retain, seen))
    /\ promised' = Max(promised, Retain)
    /\ NoEmit
    /\ UNCHANGED <<seen, start, last, probs, cont, flushed>>

\* Endpointer::flush at the end of the stream.
Flush ==
    /\ ~flushed
    /\ flushed' = TRUE
    /\ start' = NONE
    /\ probs' = <<>>
    /\ UNCHANGED <<seen, last, cont, base, promised>>
    /\ IF start = NONE THEN NoEmit
       ELSE IF Finishes(start, last + 1, cont)
            THEN Emit(Span(start, last + 1, ~cont, TRUE, seen))
            ELSE NoEmit

Next == (\E p \in Levels : Push(p)) \/ Trim \/ Flush

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties the pipeline relies on.                                      *)

\* An utterance is a forward range of audio.
NotInverted == out.ok => out.end >= out.start

\* retain_from() documents: "Audio before it will never be needed again".
\* No utterance may start before a value it already promised.
RetainHonoured == out.ok /\ out.end > out.start => out.start >= promised

\* ...so the transcriber never receives an utterance whose audio was dropped.
NoClippedAudio == out.ok /\ out.end > out.start => out.start >= base

\* Consecutive utterances never repeat audio.
NoRepeatedAudio == out.ok /\ out.end > out.start => out.start >= prevEnd

TypeOK ==
    /\ seen \in 0..MAXFRAMES
    /\ start \in {NONE} \cup 0..MAXFRAMES
    /\ cont \in BOOLEAN
=============================================================================
