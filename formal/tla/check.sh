#!/usr/bin/env bash
# Model-checks the TLA+ specs here with TLC. FIXED = TRUE models the code as
# it is now and must pass; FIXED = FALSE models the code before its fix and
# must still find the bug it was written for, which keeps the model honest.
# Needs Java 11+. Downloads tla2tools.jar once, into .tools/.
set -euo pipefail
cd "$(dirname "$0")"

TLA_VERSION=1.8.0
JAR=.tools/tla2tools-$TLA_VERSION.jar
if [[ ! -f $JAR ]]; then
  mkdir -p .tools
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
fi

# Endpointer constants are in frames, scaled down from the real ones (pad 6,
# speech 8, silence 16, split search 125, limit 469) keeping their order and
# 2 * PAD <= SIL. The second set has a pad of 3, which the retain bug needs.
ENDPOINTER="SIL = 5 SPEECH = 3 PAD = 2 MAXF = 9 SEARCH = 6 MAXFRAMES = 14"
ENDPOINTER_PAD="SIL = 6 SPEECH = 4 PAD = 3 MAXF = 10 SEARCH = 7 MAXFRAMES = 15"
REGISTRY="Jobs = {j1, j2, j3} NoJob = NoJob"

# spec | constants | invariant TLC must break before the fix
checks=(
  "Endpointer|$ENDPOINTER|NotInverted"
  "Endpointer|$ENDPOINTER_PAD|RetainHonoured"
  "CancelRegistry|$REGISTRY MODE = \"download\"|CancelReachesRunningJob"
  "CancelRegistry|$REGISTRY MODE = \"summary\"|CancelReachesRunningJob"
)
# FIXED = TRUE checks them all; FIXED = FALSE only the bug at hand, so one
# bug can't hide another.
declare -A invariants=(
  [Endpointer]="TypeOK NotInverted RetainHonoured NoRepeatedAudio"
  [CancelRegistry]="TypeOK CancelReachesRunningJob"
)

failed=0
for check in "${checks[@]}"; do
  IFS='|' read -r spec constants bug <<<"$check"
  for fixed in FALSE TRUE; do
    cfg=.tools/$spec.cfg
    if [[ $fixed == TRUE ]]; then
      checked=${invariants[$spec]} expected="No error has been found"
    else
      checked="TypeOK $bug" expected="Invariant $bug is violated"
    fi
    printf 'CONSTANTS %s FIXED = %s\nSPECIFICATION Spec\nINVARIANTS %s\n' \
      "$constants" "$fixed" "$checked" >"$cfg"
    out=$(java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -deadlock \
      -noGenerateSpecTE -config "$cfg" -metadir .tools/states "$spec.tla" 2>&1 || true)
    if grep -q "$expected" <<<"$out"; then
      echo "ok    $spec FIXED = $fixed ($constants): $expected"
    else
      echo "FAIL  $spec FIXED = $fixed ($constants): expected \"$expected\""
      echo "$out" | tail -40
      failed=1
    fi
  done
done
exit $failed
