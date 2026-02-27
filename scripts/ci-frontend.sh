#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Frontend CI ==="

echo "--- pnpm install ---"
pnpm install --frozen-lockfile

echo "--- tsc --noEmit ---"
pnpm exec tsc --noEmit

echo "=== Frontend CI passed ==="
