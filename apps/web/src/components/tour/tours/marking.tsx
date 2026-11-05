import type { Tour } from '../tour-steps';
import { onTavola } from '../tour-steps';
/**
 * On the Rivolta's Tavola 51, the one the reading tour reads, which has a table sheet. Its numbers
 * run to the thirties, so the tester jumps to 90 for circles of their own, and those are the ones
 * they remove at the end: the sheet's own numbers stay for the next tester.
 */
const steps: Tour['steps'] = [
  {
    part: null,
    title: 'Something new: marking a drawing',
    body: (where) => (
      <>
        <p>
          Putting numbers on a drawing, and putting them right, is quicker now. About ten minutes,
          on the Rivolta IR 300’s Tavola 51, the one read from the factory catalogue:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Read the drawing beside its list and its table sheet.</li>
          <li>Mark a few numbers, and undo one.</li>
          <li>Type a number over a print nobody can read.</li>
          <li>Remove several numbers at once.</li>
        </ol>
        {where.known && !where.isEditor && (
          <p className="mt-3 font-semibold">
            Marking is for Editors. Sign in as an Editor or an Administrator to walk this tour.
          </p>
        )}
      </>
    ),
    next: 'Start',
  },
  {
    part: 'look',
    title: 'Open Tavola 51',
    body: (
      <p>
        From the catalogue, open <b>Iso Rivolta IR 300</b>, then Tavola{' '}
        <b className="tabular">51</b>, <b>Propeller shaft and wheel half-shafts</b>. Where there is
        no Tavola 51, any Tavola with a table sheet beneath its parts will do.
      </p>
    ),
    go: { to: '/', label: 'Go to the catalogue', unless: onTavola },
    done: onTavola,
  },
  {
    part: 'look',
    title: 'From a circle to its row',
    body: (
      <>
        <p>
          Every number on the drawing, and the marking tool, now sit right under it. On a wide
          screen, where the list stands beside the drawing, click a circle: the page scrolls just
          far enough to show its row. A row already in view stays put.
        </p>
        <p className="mt-3">
          Further down, under the parts, press <b>Sheet 1</b>. The factory’s table sheet opens on
          the page, in the drawing’s own viewer, instead of in a new tab: zoom with the wheel, a
          pinch or a double tap.
        </p>
      </>
    ),
    next: 'Next',
  },
  {
    part: 'mark',
    title: 'Mark three numbers',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Press <b>Mark positions</b>, beside <b>Every number on this drawing</b>.
        </li>
        <li>
          Type <b className="tabular">90</b> over the number it offers, so your circles stay well
          clear of the sheet’s own.
        </li>
        <li>
          Click three empty places on the drawing. They become <b className="tabular">90</b>,{' '}
          <b className="tabular">91</b> and <b className="tabular">92</b>.
        </li>
        <li>Drag one of them somewhere else.</li>
      </ol>
    ),
    next: 'I’ve marked them',
  },
  {
    part: 'mark',
    title: 'Undo',
    body: (
      <>
        <p>
          Press <b>Undo</b>, or Ctrl+Z (⌘Z on a Mac). The move goes back; press again and{' '}
          <b className="tabular">92</b> goes, and is the next number again. Click the drawing to put
          it back.
        </p>
        <p className="mt-3 text-muted">
          Undo takes back only your own steps on this Tavola, and forgets them when you press{' '}
          <b>Done</b>.
        </p>
      </>
    ),
    next: 'Next',
  },
  {
    part: 'correct',
    title: 'A print nobody can read',
    body: (
      <>
        <p>
          Where the factory’s number is too faint or smudged to read, the Club types it in. Click
          circle <b className="tabular">91</b> and tick <b>Print unreadable</b>: it turns into a
          white disc with the number typed inside. The scan itself is not changed.
        </p>
        <p className="mt-3">Untick it again, or press Undo.</p>
      </>
    ),
    next: 'Next',
  },
  {
    part: 'correct',
    title: 'A part read without its number',
    body: (
      <p>
        When the reading could not make out a row’s number, the part lands under{' '}
        <b>Listed without a number</b>, below the parts. Find it on the table sheet and the drawing,
        then choose its number under <b>Put at</b>, which offers the numbers with nothing recorded
        first. The part moves there. Where nothing is listed without a number, read on.
      </p>
    ),
    next: 'Next',
  },
  {
    part: 'remove',
    title: 'Remove several at once',
    body: (
      <>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Press <b>Select numbers</b>.
          </li>
          <li>
            Press <b className="tabular">90</b> under <b>Every number on this drawing</b>, then
            Shift+click <b className="tabular">92</b>. The bar says <b>3 numbers: 90–92</b>. A
            circle on the drawing picks its number too.
          </li>
          <li>
            Press <b>Remove 3 Positions</b>, then <b>Yes, remove them</b>.
          </li>
        </ol>
        <p className="mt-3">
          Please remove only your own three; the sheet’s own numbers stay for the next tester. Undo
          cannot bring removed numbers back, which is why it asks first, and says how many have
          parts recorded.
        </p>
      </>
    ),
    next: 'They’re removed',
  },
  {
    part: null,
    title: 'That’s all of it',
    body: (
      <p>
        Press <b>Done</b> to put the marking tool away. Anything unclear, slow or wrong along the
        way: reply to the e-mail this tour came with.
      </p>
    ),
    next: 'End the tour',
  },
];

export const markingTour: Tour = {
  footer: 'Tour: marking',
  parts: [
    { part: 'look', name: 'Read' },
    { part: 'mark', name: 'Mark' },
    { part: 'correct', name: 'Correct' },
    { part: 'remove', name: 'Remove' },
  ],
  steps,
};
