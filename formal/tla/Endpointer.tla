---------------------------- MODULE Endpointer ----------------------------
(***************************************************************************)
(* Model of `vad::Endpointer` (src-tauri/src/vad.rs) together with the way *)
(* `pipeline::LiveTranscriber::push` drops audio before                    *)
(* `Endpointer::retain_from()` at the end of every chunk.                  *)
(*                                                                         *)
(* Everything is measured in 32 ms frames. Speech probabilities are        *)
(* abstracted to four ordered levels:                                      *)
(*   0, 1  below END_THRESHOLD (silence; 0 is quieter than 1)              *)
(*   2     at least END_THRESHOLD but below START_THRESHOLD                *)
(*   3     at least START_THRESHOLD (speech)                               *)
(* The millisecond constants become frame counts, scaled down so TLC can   *)
(* explore every probability sequence up to MAXFRAMES frames.             *)
(*                                                                         *)
(* FIXED = FALSE is the code before the fix; FIXED = TRUE the code now:    *)
(* a cut that lands after the last speech ends the utterance, and `floor`  *)
(* (the end of the last utterance) bounds start padding and retain_from(). *)
(***************************************************************************)
EXTENDS Integers, Sequences

CONSTANTS
    SIL,       \* MIN_SILENCE_MS in frames: a pause this long ends an utterance
    SPEECH,    \* MIN_SPEECH_MS in frames: shorter bursts are dropped
    PAD,       \* PAD_MS in frames
    MAXF,      \* MAX_UTTERANCE_MS in frames
    SEARCH,    \* SPLIT_SEARCH_MS in frames
    MAXFRAMES, \* length of the probability streams explored
    FIXED

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
    floor,    \* Endpointer.floor (FIXED only)
    flushed,  \* the stream has ended and flush() ran
    out,      \* utterance emitted by the last step, or NoUtt
    prevEnd,  \* end of the previously emitted utterance
    promised  \* highest retain_from() the pipeline has dropped audio up to

vars == <<seen, start, last, probs, cont, floor, flushed, out, prevEnd, promised>>

\* Endpointer::span, with `fs` the already-incremented frames_seen. Before
\* the fix a side was padded unless it was cut mid-speech; now the start is
\* always padded, back to `floor` at most.
Span(s, e, padS, padE, fs) ==
    [ok    |-> TRUE,
     start |-> IF FIXED THEN Max(s - PAD, floor)
               ELSE IF padS THEN Max(s - PAD, 0) ELSE s,
     end   |-> Min(IF padE THEN e + PAD ELSE e, fs)]

\* Endpointer::retain_from
Retain ==
    IF FIXED THEN Max((IF start # NONE THEN start ELSE seen) - PAD, floor)
    ELSE IF start # NONE /\ cont THEN start
    ELSE IF start # NONE THEN Max(start - PAD, 0)
    ELSE Max(seen - PAD, 0)

\* First index (0-based) of the minimum of s[from+1..Len(s)], like
\* Iterator::min_by, which returns the first of equal minima.
MinIdx(s, from) ==
    CHOOSE i \in from..(Len(s) - 1) :
        \A j \in from..(Len(s) - 1) :
            s[i + 1] < s[j + 1] \/ (s[i + 1] = s[j + 1] /\ i <= j)

\* Every step moves the last output into prevEnd.
Output(u) == /\ out' = u
             /\ prevEnd' = IF out.ok THEN out.end ELSE prevEnd

Emit(u) == Output(u) /\ floor' = IF FIXED THEN u.end ELSE floor
NoEmit == Output(NoUtt) /\ UNCHANGED floor

\* Endpointer::finish(s, e): the utterance ends; short bursts are dropped
\* unless they continue a cut (`||` short-circuits on cont).
Finish(s, e, fs) ==
    /\ start' = NONE /\ probs' = <<>> /\ cont' = cont
    /\ IF cont \/ (e - s) >= SPEECH
         THEN Emit(Span(s, e, ~cont, TRUE, fs))
         ELSE NoEmit

Init ==
    /\ seen = 0 /\ start = NONE /\ last = 0 /\ probs = <<>>
    /\ cont = FALSE /\ floor = 0 /\ flushed = FALSE
    /\ out = NoUtt /\ prevEnd = 0 /\ promised = 0

\* Endpointer::push(p)
Push(p) ==
    LET frame == seen
        fs == seen + 1
    IN
    /\ ~flushed
    /\ seen < MAXFRAMES
    /\ seen' = fs
    /\ UNCHANGED <<flushed, promised>>
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
          /\ IF frame - ls >= SIL THEN Finish(start, ls + 1, fs)
             ELSE IF frame + 1 - start >= MAXF THEN
                LET search == Min(SEARCH, Len(ps) - 1)
                    split == MinIdx(ps, Len(ps) - search)
                    e == start + split
                IN
                IF FIXED /\ e > ls THEN Finish(start, ls + 1, fs)
                ELSE
                /\ probs' = SubSeq(ps, split + 1, Len(ps))
                /\ start' = e
                /\ cont' = TRUE
                /\ Emit(Span(start, e, ~cont, FALSE, fs))
             ELSE
                /\ probs' = ps
                /\ UNCHANGED <<start, cont>>
                /\ NoEmit

\* The end of a chunk (any frame can end one): the pipeline drops audio
\* before retain_from(). (It takes min(retain_from(), scored), but
\* retain_from() never exceeds the frames scored.)
Trim ==
    /\ ~flushed
    /\ promised' = Max(promised, Retain)
    /\ NoEmit
    /\ UNCHANGED <<seen, start, last, probs, cont, flushed>>

\* Endpointer::flush at the end of the stream.
Flush ==
    /\ ~flushed
    /\ flushed' = TRUE
    /\ UNCHANGED <<seen, last, promised>>
    /\ IF start = NONE
         THEN NoEmit /\ UNCHANGED <<start, probs, cont>>
         ELSE Finish(start, last + 1, seen)

Next == (\E p \in Levels : Push(p)) \/ Trim \/ Flush

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties the pipeline relies on.                                      *)

\* An utterance is a forward range of audio.
NotInverted == out.ok => out.end >= out.start

\* retain_from() documents: "Audio before it will never be needed again".
\* The pipeline has dropped audio before `promised`, so no utterance may
\* start before it.
RetainHonoured == out.ok /\ out.end > out.start => out.start >= promised

\* Consecutive utterances never repeat audio.
NoRepeatedAudio == out.ok /\ out.end > out.start => out.start >= prevEnd

TypeOK ==
    /\ seen \in 0..MAXFRAMES
    /\ start \in {NONE} \cup 0..MAXFRAMES
    /\ cont \in BOOLEAN
=============================================================================
