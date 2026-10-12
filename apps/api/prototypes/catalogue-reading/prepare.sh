#!/usr/bin/env bash
# PROTOTYPE — throwaway. Cuts the trial Tavole out of the scanned catalogue PDFs as upright
# PNGs. Output goes to .tmp/ (gitignored): the scans are the Club's and never enter the repo.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
src="$root/.tmp"
out="$root/.tmp/catalogue-reading"
mkdir -p "$out"

# name | pdf | page | degrees clockwise to make it upright. For a drawing, upright is the way
# its position numbers read, which is not always the way its title block reads.
pages=(
  "t51-drawing|Iso Rivolta Parts Catalogue Part2.pdf|1|180"
  "t51-table-1|Iso Rivolta Parts Catalogue Part2.pdf|2|90"
  "t52-drawing|Iso Rivolta Parts Catalogue Part2.pdf|3|180"
  "t52-table-1|Iso Rivolta Parts Catalogue Part2.pdf|4|90"
  "t52-table-2|Iso Rivolta Parts Catalogue Part2.pdf|5|90"
  "t84-drawing|Iso Rivolta Parts Catalogue.pdf|9|0"
  "t84-table-1|Iso Rivolta Parts Catalogue.pdf|10|0"
  "t84-table-2|Iso Rivolta Parts Catalogue.pdf|11|0"
  "t84-table-3|Iso Rivolta Parts Catalogue.pdf|12|0"
  "t84-table-4|Iso Rivolta Parts Catalogue.pdf|13|0"
  "t84-table-5|Iso Rivolta Parts Catalogue.pdf|14|0"
  "t84-table-6|Iso Rivolta Parts Catalogue.pdf|15|0"
  "t84-table-7|Iso Rivolta Parts Catalogue.pdf|16|0"
  "t84-table-8|Iso Rivolta Parts Catalogue.pdf|17|0"
  "t84-table-9|Iso Rivolta Parts Catalogue.pdf|18|0"
)
for entry in "${pages[@]}"; do
  IFS='|' read -r name pdf page turn <<<"$entry"
  pdftoppm -r 200 -gray -png -f "$page" -l "$page" -singlefile "$src/$pdf" "$out/$name.raw"
  convert "$out/$name.raw.png" -rotate "$turn" +repage "$out/$name.png"
  rm "$out/$name.raw.png"
  echo "$name $(identify -format '%wx%h' "$out/$name.png")"
done
