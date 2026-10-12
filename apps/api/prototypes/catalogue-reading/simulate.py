#!/usr/bin/env python3
"""PROTOTYPE — throwaway.

Runs the reading as the real command would, with a stand-in for the Claude API: every request
the pipeline would send is assembled (instruction + images), sized and priced, and answered
from the readings recorded during the trial. Nothing leaves this machine and nothing is billed.

What it shows a person deciding whether to pay for this: how many requests one Tavola takes,
roughly what they cost, and what that comes to for a whole catalogue.

  simulate.py           replay at a readable pace, then build the viewer
  simulate.py --fast    no pauses
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

import build

HERE = Path(__file__).parent
OUT = build.OUT

# claude-opus-5-5 list prices, USD per million tokens (October 2026). The batch interface is
# half price and fits this job: nobody is waiting for the answer.
MODEL = "claude-opus-5-5"
INPUT_PER_MTOK = 4.00
OUTPUT_PER_MTOK = 20.00
BATCH_DISCOUNT = 0.5

# The three numbers below are assumptions, not measurements. A real run reports its own usage.
PIXELS_PER_IMAGE_TOKEN = 28 * 28  # an image costs about one token per 28x28 patch...
MAX_IMAGE_TOKENS = 4784  # ...up to this ceiling per image
CHARS_PER_TEXT_TOKEN = 3.5
# The model reasons before it answers, and that reasoning is billed as output.
REASONING_PER_ANSWER_TOKEN = 1.0

# A single look per request is the floor. The trial's readers cropped and enlarged whatever they
# could not make out, and used roughly this many times the tokens counted here; a real reader
# given the same freedom would too. The honest figure is a range between the two.
ZOOMING_FACTOR = 3.5

# The whole catalogue as scanned: one drawing per Tavola, and its table sheets.
CATALOGUE = {"tavole": 37, "tableSheets": 55}


def image_tokens(path):
    with Image.open(path) as image:
        return min(MAX_IMAGE_TOKENS, round(image.width * image.height / PIXELS_PER_IMAGE_TOKEN))


def text_tokens(text):
    return round(len(text) / CHARS_PER_TEXT_TOKEN)


class RecordedClaude:
    """Stands where the API client would. Same question in, the trial's answer out."""

    def __init__(self, pause):
        self.pause = pause
        self.calls = []

    def read(self, tavola, step, instruction, images, recorded_answer):
        tokens_in = text_tokens(instruction.read_text()) + sum(image_tokens(i) for i in images)
        answer = text_tokens(json.dumps(recorded_answer, ensure_ascii=False))
        tokens_out = round(answer * (1 + REASONING_PER_ANSWER_TOKEN))
        cost = tokens_in / 1e6 * INPUT_PER_MTOK + tokens_out / 1e6 * OUTPUT_PER_MTOK
        self.calls.append({"tavola": tavola, "step": step, "images": len(images),
                           "tokensIn": tokens_in, "tokensOut": tokens_out, "cost": cost})
        print(f"  → {MODEL}  {step:<34} {len(images)} image{'s' if len(images) != 1 else ' '}"
              f"  {tokens_in:>6} in  {tokens_out:>6} out   ${cost:.3f}")
        time.sleep(self.pause)
        return recorded_answer


def read_drawing(claude, tavola):
    numbers = json.loads((OUT / f"{tavola}-numbers.json").read_text())
    sheets = sorted(OUT.glob(f"{tavola}-candidates-[0-9]*.png")) + sorted(OUT.glob(f"{tavola}-merged-[0-9]*.png"))
    share = max(1, len(sheets))
    for index, sheet in enumerate(sheets, start=1):
        # One request per contact sheet of crops; the recorded answer is split evenly between them.
        part = dict(list(numbers["readings"].items())[index - 1::share])
        claude.read(tavola, f"position numbers, sheet {index}/{len(sheets)}", HERE / "READ-NUMBERS.md", [sheet], part)


def read_tables(claude, tavola):
    for reader in "ab":
        rows = []
        for path in sorted(OUT.glob(f"{tavola}-table*.{reader}.json")):
            rows += json.loads(path.read_text())["rows"]
        for sheet in sorted(OUT.glob(f"{tavola}-table-[0-9].png")):
            number = int(sheet.stem[-1])
            strips = sorted(OUT.glob(f"{sheet.stem}-strip-*.png"))
            answer = [row for row in rows if row.get("sheet") == number]
            claude.read(tavola, f"table sheet {number}, reading {reader.upper()}", HERE / "READ-TABLE.md", strips, answer)


def main():
    pause = 0 if "--fast" in sys.argv else 0.12
    claude = RecordedClaude(pause)
    print("SIMULATED RUN — answers are replayed from the trial; no request is sent, nothing is billed.\n")
    for tavola in build.TAVOLE:
        print(f"Tavola {tavola[1:]}")
        print("  locating number-shaped ink on the drawing (no model)")
        subprocess.run([sys.executable, str(HERE / "find_numbers.py"), tavola], check=True, capture_output=True)
        read_drawing(claude, tavola)
        read_tables(claude, tavola)
        print()

    def total(calls):
        return {"calls": len(calls), "tokensIn": sum(c["tokensIn"] for c in calls),
                "tokensOut": sum(c["tokensOut"] for c in calls), "cost": sum(c["cost"] for c in calls)}

    drawing_calls = [c for c in claude.calls if c["step"].startswith("position")]
    table_calls = [c for c in claude.calls if c["step"].startswith("table")]
    drawings = len(build.TAVOLE)
    table_sheets = len({(c["tavola"], c["step"].split(",")[0]) for c in table_calls})
    per_drawing = total(drawing_calls)["cost"] / drawings
    per_table_sheet = total(table_calls)["cost"] / table_sheets  # both readings of one sheet
    whole = per_drawing * CATALOGUE["tavole"] + per_table_sheet * CATALOGUE["tableSheets"]
    usage = {
        "simulated": True,
        "model": MODEL,
        "prices": {"inputPerMTok": INPUT_PER_MTOK, "outputPerMTok": OUTPUT_PER_MTOK},
        "tavole": {t: total([c for c in claude.calls if c["tavola"] == t]) for t in build.TAVOLE},
        "trial": total(claude.calls),
        "perDrawing": per_drawing,
        "perTableSheet": per_table_sheet,
        "catalogue": {**CATALOGUE, "cost": whole, "costWithZooming": whole * ZOOMING_FACTOR,
                      "batchCost": whole * BATCH_DISCOUNT},
    }
    (OUT / "usage.json").write_text(json.dumps(usage, indent=1))

    trial = usage["trial"]
    print(f"Three Tavole: {trial['calls']} requests, {trial['tokensIn']:,} tokens in, "
          f"{trial['tokensOut']:,} out, about ${trial['cost']:.2f}")
    print(f"Per drawing about ${per_drawing:.2f}; per table sheet (read twice) about ${per_table_sheet:.2f}")
    print(f"Whole catalogue ({CATALOGUE['tavole']} Tavole, {CATALOGUE['tableSheets']} table sheets): "
          f"about ${whole:.0f} if one look per request is enough, up to about ${whole * ZOOMING_FACTOR:.0f} "
          f"if the reader zooms in as the trial's did. The batch interface halves a single-look run.")
    print("Estimates from image sizes and answer lengths at list prices — a real run reports its own.\n")
    build.main()


if __name__ == "__main__":
    main()
