#!/bin/sh
# Assemble the flat, self-contained demo folder (same weaving files as the repo root) for hosting.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/.." && pwd); OUT=${1:-"$HERE/dist"}
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$HERE/index.html" "$HERE/demo-host.js" "$HERE/demo.css" "$OUT/"
cp "$ROOT/compat.js" "$ROOT/model.js" "$ROOT/time.js" "$ROOT/weaving.js" "$ROOT/weaving-ui.js" "$ROOT/weaving.css" "$ROOT/styles.css" "$OUT/"
cp "$ROOT/global_secondary_panel_v0.1_production_background.png" "$ROOT/global_icon_close_v01.png" "$ROOT/B7_city_khotan_bg_v01_20x9.webp" "$OUT/"
echo "demo assembled → $OUT"; du -sh "$OUT"
