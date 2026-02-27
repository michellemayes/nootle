#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../src-tauri"

echo "=== Rust CI ==="

echo "--- cargo fmt --check ---"
cargo fmt --check

echo "--- cargo clippy ---"
cargo clippy -- -D warnings

echo "--- cargo test ---"
cargo test

echo "=== Rust CI passed ==="
