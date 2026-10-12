# PROTOTYPE — catalogue reading trial

Throwaway. Answers one question: can a scanned factory catalogue be read by machine well enough
to propose a Tavola's table, its English names and its Marks for an Editor to check?

Nothing here is wired into the app. Scans and everything read from them stay in `.tmp/`
(gitignored): they are the Club's.

    ./prepare.sh                 cut the trial sheets out of the PDFs in .tmp/, upright
    ./strips.sh                  cut each table sheet into strips a reader can see properly
    python3 find_numbers.py t84  find number-shaped ink on a drawing, lay it out for reading
    python3 build.py             join the readings; writes .tmp/catalogue-reading/index.html
    python3 simulate.py          the whole run with a stand-in for the Claude API, priced

Between `find_numbers` and `build` sits the reading itself, which this trial did with a vision
model given `READ-NUMBERS.md` (once per drawing) and `READ-TABLE.md` (twice per table sheet,
independently, so that a disagreement shows where a reading cannot be trusted). The readers
write `<tavola>-numbers.json` and `<tavola>-table.a.json` / `.b.json` beside the images.

`simulate.py` is for showing the idea to someone deciding whether to pay for it. It assembles
every request the real command would send, estimates its tokens and cost at list prices, and
answers it from the recorded readings. No request is sent and nothing is billed; the costs are
estimates from image sizes and answer lengths, not measurements.
