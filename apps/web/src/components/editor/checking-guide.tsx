/**
 * **How checking a machine-read Tavola goes**, folded away under the Unchecked band. An Editor
 * meeting this page for the first time saw a list of doubts and four kinds of button and nothing
 * saying what any of it was for; one who has checked a dozen does not need telling, so it is
 * asked for rather than shown.
 *
 * The steps are a sequence, so they are numbered. The doubts that come up most are said in
 * the words the band prints them in, with what each usually means and what to do about it.
 */
export function CheckingGuide() {
  return (
    <details className="group mt-3" data-testid="checking-guide">
      <summary className="-my-2 inline-flex min-h-control cursor-pointer items-center text-accent-ink underline underline-offset-4 marker:content-none">
        <span className="group-open:hidden">How to check this Tavola</span>
        <span className="hidden group-open:inline">Hide how to check it</span>
      </summary>

      <div className="mt-4 flex max-w-measure flex-col gap-6 text-pretty">
        <ol className="flex list-decimal flex-col gap-3 pl-5 marker:text-muted">
          <li>
            <span className="font-medium">Go through the doubts.</span> Each is a place the reading
            was not sure of. Select one to go to its number on the drawing and its row below.
          </li>
          <li>
            <span className="font-medium">Put right what is wrong.</span> On the drawing, move, add
            or take off a Mark with the marking tool. In a row, use{' '}
            <span className="font-medium">Correct the part</span>, or switch{' '}
            <span className="font-medium">Drawn</span> off for a part the drawing does not show. For
            a number with no row, use <span className="font-medium">Record a part here</span>.
          </li>
          <li>
            <span className="font-medium">Clear the doubt</span> once you have looked at it.{' '}
            <span className="font-medium">Rewrite</span> it instead if something is still open, so
            the next Editor knows what.
          </li>
          <li>
            <span className="font-medium">Compare the other rows</span> with the factory’s table
            sheet further down: the Catalog Number, the name and how many.
          </li>
          <li>
            <span className="font-medium">Publish</span> when the drawing and its rows agree with
            the sheets. Members see it from then on. Doubts don’t have to be cleared first.
          </li>
        </ol>

        <div>
          <h3 className="text-base">The doubts you will see most</h3>
          <dl className="mt-3 flex flex-col gap-4">
            <div>
              <dt className="text-text">
                “A Mark for 42 is on the drawing, and no row of the table…”
              </dt>
              <dd className="mt-1 text-muted">
                The number is on the drawing, but no row was read for it. Usually its row is on a
                table sheet that was not read, when the run stopped short of the Tavola’s last page.
                Record the part from the sheet, or take the Mark off if it is not a position number.
              </dd>
            </div>
            <div>
              <dt className="text-text">“The quantity: the other Reading has ‘4’”</dt>
              <dd className="mt-1 text-muted">
                Every table sheet is read twice, and the two Readings disagreed about the quantity,
                the Catalog Number or the Position. The row shows one of them; check the sheet, and
                correct the row if it shows the wrong one.
              </dd>
            </div>
            <div>
              <dt className="text-text">
                “Position 7 is in the table, and no Mark for it was found…”
              </dt>
              <dd className="mt-1 text-muted">
                A row was read, but the number was not found on the drawing. Find it there and place
                a Mark. If the factory never drew it, switch the row’s Drawn off.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </details>
  );
}
