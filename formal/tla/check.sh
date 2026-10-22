#!/usr/bin/env bash
# Model-checks every TLA+ spec here with TLC. Configs named *_fixed.cfg (or
# with FIXED = TRUE) model the current code and must pass; the others model
# the code before its fix and must still find the bug they were written for.
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

# spec, config, expected result ("pass" or the invariant TLC must break)
checks=(
  "Endpointer Endpointer.cfg NotInverted"
  "Endpointer EndpointerPad.cfg RetainHonoured"
  "Endpointer Endpointer_fixed.cfg pass"
  "Endpointer EndpointerPad_fixed.cfg pass"
  "CancelRegistry CancelRegistry_download_FALSE.cfg CancelReachesRunningJob"
  "CancelRegistry CancelRegistry_download_TRUE.cfg pass"
  "CancelRegistry CancelRegistry_summary_FALSE.cfg CancelReachesRunningJob"
  "CancelRegistry CancelRegistry_summary_TRUE.cfg pass"
)

failed=0
for check in "${checks[@]}"; do
  read -r spec cfg expected <<<"$check"
  out=$(java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -deadlock \
    -config "$cfg" -metadir .tools/states "$spec.tla" 2>&1 || true)
  rm -f ./*_TTrace_*.tla ./*_TTrace_*.bin
  if [[ $expected == pass ]]; then
    grep -q "No error has been found" <<<"$out" && ok=1 || ok=0
  else
    grep -q "Invariant $expected is violated" <<<"$out" && ok=1 || ok=0
  fi
  if ((ok)); then
    echo "ok    $cfg ($expected)"
  else
    echo "FAIL  $cfg (expected $expected)"
    echo "$out" | tail -40
    failed=1
  fi
done
exit $failed
