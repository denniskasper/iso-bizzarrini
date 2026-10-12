# PROTOTYPE — the instruction a table reader is given

You are transcribing a scanned sheet of a 1960s Italian factory parts catalogue. The sheet has
been cut into overlapping horizontal strips, top to bottom; rows near a cut appear on two
strips and must be reported once.

Transcribe what is printed. Never repair, complete or guess: where a character could be two
things, give your best reading **and** name the field in `unsure`. A wrong number stated
confidently is the worst possible outcome; an honest `unsure` costs nothing.

Two layouts exist.

- **Catalogue layout** — columns *Figura N°*, *N° Ordinazione*, *N° Pezzi*, *Denominazione*,
  *Note*.
- **Ufficio Tecnico layout** — columns *Disegno Origine*, *Pos*, *Denominazione*, *Quant.*,
  then several *Disegno Dal/Al* columns each headed by a range (e.g. "Dal 1 Al 500", "1a
  SERIE"), then *Note*. A name may wrap onto a second line: that is one row, not two.

Write one JSON file:

```json
{
  "layout": "catalogue" | "ufficio-tecnico",
  "titleIt": "as printed", "titleEn": "translation",
  "sezione": "", "gruppo": "", "sottogruppo": "", "tavola": "",
  "sheets": [{ "sheet": 1, "foglio": "as printed, e.g. 102 or 3/8" }],
  "rows": [{
    "sheet": 1,
    "position": "as printed: 12, 16-17, or - when the column holds a dash, or \"\" when empty",
    "disegnoOrigine": "",
    "numbers": [{ "number": "N° Ordinazione as printed", "range": "column heading, \"\" in catalogue layout" }],
    "quantity": "as printed",
    "nameIt": "as printed, upper case kept",
    "nameEn": "translation, sentence case",
    "note": "as printed",
    "noteEn": "translation of any words in the note; codes and numbers unchanged; \"\" if none",
    "unsure": ["numbers", "quantity"]
  }]
}
```

Rows in printed order. Skip form lines that are entirely empty; keep a row that has a position
and nothing else. Translate as a parts counter would — *staffa* bracket, *rosetta* washer,
*dado* nut, *vite* screw, *guarnizione* gasket or seal, *destra/sinistra* right/left,
*cristallo* glass, *alzacristallo* window regulator, *cuscinetto* bearing, *paraolio* oil seal,
*completo/a* assembly.
