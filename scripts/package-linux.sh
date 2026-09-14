#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist-release"
ARCHIVE_NAME="nexio-ide-linux-beta"

mkdir -p "$OUT_DIR"

cd "$ROOT_DIR"

npm run build

mkdir -p "$OUT_DIR/$ARCHIVE_NAME"
cp -R src "$OUT_DIR/$ARCHIVE_NAME/"
cp package.json "$OUT_DIR/$ARCHIVE_NAME/"
cp README.md "$OUT_DIR/$ARCHIVE_NAME/"
cp roadmap.md "$OUT_DIR/$ARCHIVE_NAME/"
cp qa_checklist.md "$OUT_DIR/$ARCHIVE_NAME/"
cp start-desktop.sh "$OUT_DIR/$ARCHIVE_NAME/"
chmod +x "$OUT_DIR/$ARCHIVE_NAME/start-desktop.sh"

if command -v tar >/dev/null 2>&1; then
  tar -czf "$OUT_DIR/${ARCHIVE_NAME}.tar.gz" -C "$OUT_DIR" "$ARCHIVE_NAME"
else
  echo "tar no está disponible; el artefacto se dejó en $OUT_DIR/$ARCHIVE_NAME" >&2
fi

echo "Empaque beta listo en: $OUT_DIR"
