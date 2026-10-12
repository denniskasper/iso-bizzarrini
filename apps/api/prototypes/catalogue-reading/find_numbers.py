#!/usr/bin/env python3
"""PROTOTYPE — throwaway.

Finds everything on a drawing that is the size and shape of a printed position number, and
lays the candidates out on numbered contact sheets for a vision model to read.

The split is the point of the trial: *where* a number is comes from pixel geometry, which is
exact; *what* it says comes from the model, which is good at reading and poor at coordinates.

  find_numbers.py <tavola>     e.g. find_numbers.py t84
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()) / ".tmp/catalogue-reading"

# A digit on these 200 dpi sheets, in pixels.
GLYPH_HEIGHT = (15, 34)
GLYPH_WIDTH = (3, 26)
CELL = 150
# Digits of one number stand closer than this fraction of their height; "81 82 83" printed in a
# row are further apart, and must come out as three candidates rather than one.
DIGIT_GAP = 0.3
COLUMNS = 8
ROWS = 6


def components(image_path):
    text = subprocess.check_output(
        ["convert", str(image_path), "-threshold", "55%",
         "-define", "connected-components:verbose=true", "-connected-components", "8", "null:"],
        text=True,
    )
    for line in text.splitlines():
        match = re.match(r"\s*\d+: (\d+)x(\d+)\+(\d+)\+(\d+) \S+ (\d+) gray\(0\)", line)
        if match:
            w, h, x, y, area = map(int, match.groups())
            yield {"x": x, "y": y, "w": w, "h": h, "area": area}


def glyphs(image_path):
    for c in components(image_path):
        if not GLYPH_HEIGHT[0] <= c["h"] <= GLYPH_HEIGHT[1]:
            continue
        if not GLYPH_WIDTH[0] <= c["w"] <= GLYPH_WIDTH[1]:
            continue
        # A digit is mostly stroke; a washer drawn as a thin ring is mostly hole.
        if c["area"] < 0.18 * c["w"] * c["h"]:
            continue
        yield c


def group(found):
    """Joins glyphs standing side by side on one line into one candidate number."""
    found = sorted(found, key=lambda g: g["x"])
    groups = []
    for g in found:
        for members in groups:
            last = members[-1]
            overlap = min(last["y"] + last["h"], g["y"] + g["h"]) - max(last["y"], g["y"])
            gap = g["x"] - (last["x"] + last["w"])
            alike = abs(last["h"] - g["h"]) <= 6
            if alike and overlap > 0.7 * min(last["h"], g["h"]) and -2 <= gap <= DIGIT_GAP * last["h"]:
                members.append(g)
                break
        else:
            groups.append([g])
    for members in groups:
        if len(members) > 3:
            continue
        x0 = min(g["x"] for g in members)
        y0 = min(g["y"] for g in members)
        x1 = max(g["x"] + g["w"] for g in members)
        y1 = max(g["y"] + g["h"] for g in members)
        yield {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "glyphs": len(members)}


def merged_numbers(image_path, taken):
    """Two or three digits printed so close that their ink touches: one blob, not one glyph."""
    for c in components(image_path):
        if not GLYPH_HEIGHT[0] <= c["h"] <= GLYPH_HEIGHT[1]:
            continue
        if not GLYPH_WIDTH[1] < c["w"] <= 2.6 * c["h"]:
            continue
        if c["area"] < 0.25 * c["w"] * c["h"]:
            continue
        inside = any(t["x"] <= c["x"] + c["w"] and c["x"] <= t["x"] + t["w"]
                     and t["y"] <= c["y"] + c["h"] and c["y"] <= t["y"] + t["h"] for t in taken)
        if not inside:
            yield {"x": c["x"], "y": c["y"], "w": c["w"], "h": c["h"], "glyphs": 0}


def contact_sheets(tavola, drawing, candidates, name="candidates"):
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    per_sheet = COLUMNS * ROWS
    for start in range(0, len(candidates), per_sheet):
        sheet = Image.new("RGB", (COLUMNS * CELL, ROWS * CELL), "white")
        draw = ImageDraw.Draw(sheet)
        for slot, candidate in enumerate(candidates[start:start + per_sheet]):
            # Context around the candidate, so a "1" can be told from a bolt shank.
            pad = 22
            box = (candidate["x"] - pad, candidate["y"] - pad,
                   candidate["x"] + candidate["w"] + pad, candidate["y"] + candidate["h"] + pad)
            crop = drawing.crop(box).convert("RGB")
            marked = ImageDraw.Draw(crop)
            marked.rectangle((pad - 4, pad - 4, pad + candidate["w"] + 3, pad + candidate["h"] + 3),
                             outline=(220, 60, 40))
            scale = min((CELL - 10) / crop.width, (CELL - 38) / crop.height)
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
            cx, cy = (slot % COLUMNS) * CELL, (slot // COLUMNS) * CELL
            sheet.paste(crop, (cx + 5, cy + 30))
            draw.rectangle((cx, cy, cx + CELL - 1, cy + CELL - 1), outline=(170, 170, 170))
            draw.text((cx + 5, cy + 4), f"#{candidate['id']}", fill=(0, 70, 200), font=font)
        sheet.save(OUT / f"{tavola}-{name}-{start // per_sheet + 1}.png")


def main():
    tavola = sys.argv[1]
    path = OUT / f"{tavola}-drawing.png"
    drawing = Image.open(path)
    candidates = sorted(group(glyphs(path)), key=lambda c: (c["y"] // 60, c["x"]))
    for index, candidate in enumerate(candidates, start=1):
        candidate["id"] = index
    # Numbered after the rest, so adding this pass did not renumber what had already been read.
    merged = sorted(merged_numbers(path, candidates), key=lambda c: (c["y"] // 60, c["x"]))
    for index, candidate in enumerate(merged, start=len(candidates) + 1):
        candidate["id"] = index
    contact_sheets(tavola, drawing, merged, name="merged")
    contact_sheets(tavola, drawing, candidates)
    candidates += merged
    (OUT / f"{tavola}-candidates.json").write_text(json.dumps(
        {"width": drawing.width, "height": drawing.height, "candidates": candidates}, indent=1))
    print(f"{tavola}: {len(candidates)} candidates, {len(merged)} of them merged digits")


if __name__ == "__main__":
    main()
