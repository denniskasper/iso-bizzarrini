#!/usr/bin/env python3
"""PROTOTYPE — throwaway.

Joins what the readers wrote into one page a person can judge: each trial Tavola's drawing with
its proposed Marks, the table in Italian and English, and every place the reading is in doubt.

  build.py        writes .tmp/catalogue-reading/index.html (open it in a browser)
"""
import difflib
import json
import re
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
OUT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()) / ".tmp/catalogue-reading"
TAVOLE = ["t51", "t52", "t84"]
# Sheets that were cut out with a Tavola and turned out, once read, to belong to another one.
NOT_ITS_OWN = {"t84": [3]}


def squash(value):
    return re.sub(r"[\s.]", "", str(value or "")).upper()


def letters(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def numbers_of(row):
    return [squash(n.get("number")) for n in row.get("numbers") or [] if squash(n.get("number"))]


def pair_rows(a_rows, b_rows):
    """Lines the two readers' rows up, so a row one of them missed does not shift the rest."""
    def key(row):
        return squash(row.get("position")) or "·"

    matcher = difflib.SequenceMatcher(a=[key(r) for r in a_rows], b=[key(r) for r in b_rows], autojunk=False)
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == "equal" or (tag == "replace" and a1 - a0 == b1 - b0):
            for offset in range(a1 - a0):
                yield a_rows[a0 + offset], b_rows[b0 + offset]
        else:
            for row in a_rows[a0:a1]:
                yield row, None
            for row in b_rows[b0:b1]:
                yield None, row


def positions_of(printed, previous):
    """What a Pos cell means: its own number, a range, or the Position of the row above."""
    printed = str(printed or "").strip().replace("–", "-").replace("—", "-")
    if printed in ("", "-"):
        return previous, True
    found = [int(n) for n in re.findall(r"\d+", printed)]
    if len(found) == 2 and 0 < found[1] - found[0] <= 4:
        return [str(n) for n in range(found[0], found[1] + 1)], False
    return [str(n) for n in found], False


def read_table(tavola, reader):
    """One reader's account of a Tavola; continuation sheets read separately are appended."""
    table = json.loads((OUT / f"{tavola}-table.{reader}.json").read_text())
    for more in sorted(OUT.glob(f"{tavola}-table[0-9].{reader}.json")):
        extra = json.loads(more.read_text())
        table["rows"] += extra["rows"]
        table["sheets"] = table.get("sheets", []) + extra.get("sheets", [])
    strays = NOT_ITS_OWN.get(tavola, [])
    table["rows"] = [r for r in table["rows"] if r.get("sheet") not in strays]
    table["sheets"] = [s for s in table.get("sheets", []) if s.get("sheet") not in strays]
    if table.get("layout") == "catalogue":
        # The catalogue's form has 1 to 50 pre-printed down its edge; a number with nothing
        # typed beside it is the form, not a Position.
        table["rows"] = [r for r in table["rows"] if r.get("nameIt") or r.get("numbers")]
    return table


def merge_table(tavola):
    a, b = (read_table(tavola, reader) for reader in "ab")
    rows, previous = [], []
    compared = {"numbers": [0, 0], "quantity": [0, 0], "position": [0, 0], "nameIt": [0, 0]}
    for row_a, row_b in pair_rows(a["rows"], b["rows"]):
        row = dict(row_a or row_b)
        doubts = []
        if row_a is None or row_b is None:
            doubts.append("Only one of the two readers saw this row")
        else:
            checks = {
                "numbers": (numbers_of(row_a), numbers_of(row_b)),
                "quantity": (squash(row_a.get("quantity")), squash(row_b.get("quantity"))),
                "position": (squash(row_a.get("position")), squash(row_b.get("position"))),
                "nameIt": (letters(row_a.get("nameIt")), letters(row_b.get("nameIt"))),
            }
            labels = {"numbers": "Catalog Number", "quantity": "Quantity", "position": "Position", "nameIt": "Italian name"}
            for field, (left, right) in checks.items():
                if not left and not right:
                    continue
                compared[field][1] += 1
                if left == right:
                    compared[field][0] += 1
                else:
                    shown = lambda v: ", ".join(v) if isinstance(v, list) else v
                    other = row_b.get("nameIt") if field == "nameIt" else shown(right)
                    doubts.append(f"{labels[field]}: the other reader has “{other or 'nothing'}”")
        for field in (row_a or {}).get("unsure") or []:
            doubts.append(f"Reader was unsure of {field}")
        for number in numbers_of(row):
            if not re.fullmatch(r"\d{5,6}(/[A-Z0-9]+)?", number):
                doubts.append(f"“{number}” is not shaped like a Catalog Number")
        row["positions"], row["inherits"] = positions_of(row.get("position"), previous)
        previous = row["positions"]
        row["doubts"] = list(dict.fromkeys(doubts))
        row.pop("unsure", None)
        rows.append(row)
    header = {k: a.get(k, "") for k in ("layout", "titleIt", "titleEn", "sezione", "gruppo", "sottogruppo", "tavola", "sheets")}
    return header, rows, compared


def marks_of(tavola):
    found = json.loads((OUT / f"{tavola}-candidates.json").read_text())
    read = json.loads((OUT / f"{tavola}-numbers.json").read_text())
    extra = OUT / f"{tavola}-numbers-merged.json"
    if extra.exists():
        more = json.loads(extra.read_text())
        read["readings"].update(more["readings"])
        for key in ("unsure", "partial"):
            read[key] = read.get(key, []) + more.get(key, [])
    unsure = {str(i) for i in read.get("unsure", [])}
    # A box that caught half a number would put a Mark for the wrong Position on the sheet.
    partial = {str(i) for i in read.get("partial", [])}
    marks = []
    # Two halves standing side by side are one number the finder split: put it back together.
    halves = sorted((c for c in found["candidates"] if str(c["id"]) in partial and read["readings"].get(str(c["id"]))),
                    key=lambda c: c["x"])
    runs = []
    for piece in halves:
        for run in runs:
            last = run[-1]
            gap = piece["x"] - (last["x"] + last["w"])
            if -2 <= gap <= 0.6 * last["h"] and abs(last["y"] - piece["y"]) <= 0.4 * last["h"]:
                run.append(piece)
                break
        else:
            runs.append([piece])
    for run in runs:
        if len(run) < 2:
            continue
        number = "".join(re.findall(r"\d", "".join(str(read["readings"][str(c["id"])]) for c in run)))
        marks.append({
            "id": run[0]["id"], "number": number, "unsure": True,
            "x": (run[0]["x"] + run[-1]["x"] + run[-1]["w"]) / 2 / found["width"],
            "y": (run[0]["y"] + run[0]["h"] / 2) / found["height"],
        })
    for candidate in found["candidates"]:
        reading = read["readings"].get(str(candidate["id"]))
        if not reading or str(candidate["id"]) in partial:
            continue
        parts = re.findall(r"\d+", str(reading))
        for index, number in enumerate(parts):
            marks.append({
                "id": candidate["id"],
                "number": number,
                "x": (candidate["x"] + candidate["w"] * (index + 0.5) / len(parts)) / found["width"],
                "y": (candidate["y"] + candidate["h"] / 2) / found["height"],
                "unsure": str(candidate["id"]) in unsure,
            })
    return marks, found["width"], found["height"], len(found["candidates"])


def main():
    data = []
    for tavola in TAVOLE:
        needed = [f"{tavola}-table.a.json", f"{tavola}-table.b.json", f"{tavola}-numbers.json"]
        if not all((OUT / name).exists() for name in needed):
            print(f"{tavola}: not read yet, left out")
            continue
        header, rows, compared = merge_table(tavola)
        marks, width, height, candidates = marks_of(tavola)
        listed = {p for row in rows for p in row["positions"]}
        marked = {m["number"] for m in marks}
        natural = lambda values: sorted(values, key=int)
        sheets = sorted(p.name for p in OUT.glob(f"{tavola}-table-[0-9].png")
                        if int(p.stem[-1]) not in NOT_ITS_OWN.get(tavola, []))
        data.append({
            "id": tavola, **header, "rows": rows, "marks": marks,
            "width": width, "height": height, "drawing": f"{tavola}-drawing.png", "sheetImages": sheets,
            "report": {
                "candidates": candidates,
                "marks": len(marks),
                "positionsListed": len(listed),
                "listedNotMarked": natural(listed - marked),
                "markedNotListed": natural(marked - listed),
                "agreement": compared,
                "rowsInDoubt": sum(1 for row in rows if row["doubts"]),
            },
        })
        report = data[-1]["report"]
        agree = ", ".join(f"{field} {ok}/{total}" for field, (ok, total) in compared.items())
        print(f"{tavola}: {len(rows)} rows, {len(marks)} marks for {len(listed)} listed positions")
        print(f"   two readers agree — {agree}")
        print(f"   listed, no mark: {report['listedNotMarked']}")
        print(f"   marked, not listed: {report['markedNotListed']}")
    page = (HERE / "viewer.html").read_text().replace("/*DATA*/", "const TAVOLE = " + json.dumps(data) + ";")
    (OUT / "index.html").write_text(page)
    print(f"\nopen {OUT / 'index.html'}")


if __name__ == "__main__":
    main()
