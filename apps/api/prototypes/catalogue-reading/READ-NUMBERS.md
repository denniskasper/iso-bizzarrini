# PROTOTYPE — the instruction a number reader is given

Each contact sheet is a grid of small crops from one factory exploded-view drawing. A crop is
labelled `#id` and has a red box round one candidate. Some candidates are printed position
numbers (1 to 3 digits, upright); most of the rest are bits of drawing — a bolt, a washer, a
leader line, a letter.

For every `#id` say what the red box holds: the number as a string, or `null` when it is not a
position number. Read only what is inside the red box, even when a neighbouring digit shows
that the box caught part of a longer number — then give the part and add the id to `partial`.
When you cannot tell (6 or 8, 1 or a line), give your best reading and add the id to `unsure`.

Write one JSON file: `{"readings": {"1": "150", "2": null}, "partial": [], "unsure": []}`
with an entry for every id on every sheet.
