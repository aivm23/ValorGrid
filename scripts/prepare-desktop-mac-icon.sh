#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
SOURCE_ICON="$ROOT_DIR/assets/brand/valorgrid-logo.png"
OUTPUT_DIR="$ROOT_DIR/local/artifacts/desktop"
ICONSET_DIR="$OUTPUT_DIR/valorgrid-logo.iconset"
OUTPUT_ICON="$OUTPUT_DIR/valorgrid-logo.icns"

cleanup() {
  rm -rf -- "$ICONSET_DIR"
}

trap cleanup EXIT

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "ERROR: source icon not found: $SOURCE_ICON" >&2
  exit 1
fi

mkdir -p -- "$ICONSET_DIR"

sips -z 16 16 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

mkdir -p -- "$OUTPUT_DIR"
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICON"
echo "Created $OUTPUT_ICON"
