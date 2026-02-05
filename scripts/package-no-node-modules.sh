#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="$(basename "$ROOT_DIR")"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$ROOT_DIR/dist"
OUT_FILE="$OUT_DIR/${PROJECT_NAME}_src_${STAMP}.tar.gz"

mkdir -p "$OUT_DIR"

# Create a compressed archive of the project excluding node_modules and build artifacts
# Add more exclusions here if needed.
tar \
  --exclude="**/node_modules" \
  --exclude="**/dist" \
  --exclude="**/release" \
  --exclude="**/.git" \
  -czf "$OUT_FILE" \
  -C "$ROOT_DIR" \
  .

echo "Created: $OUT_FILE"
