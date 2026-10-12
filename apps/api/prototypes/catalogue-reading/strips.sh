#!/usr/bin/env bash
# PROTOTYPE — throwaway. Cuts each table sheet into overlapping horizontal strips, small enough
# for a vision model to read at the scan's own resolution rather than a downsized whole page.
set -euo pipefail
out="$(git rev-parse --show-toplevel)/.tmp/catalogue-reading"
for sheet in "$out"/t*-table-[0-9].png; do
  name="$(basename "$sheet" .png)"
  rm -f "$out/$name-strip-"*.png
  read -r width height < <(identify -format '%w %h\n' "$sheet")
  step=560 tall=680
  n=1
  for ((y = 0; y < height - 120; y += step)); do
    convert "$sheet" -crop "${width}x${tall}+0+${y}" +repage -trim +repage -resize '2000x>' \
      "$out/$name-strip-$n.png"
    n=$((n + 1))
  done
  echo "$name: $((n - 1)) strips"
done
