import type { Tour } from '../tour-steps';
import { onTavola } from '../tour-steps';
/** **Reading a Tavola from the catalogue, showing a drawing to Visitors, and seeing it as one.** */
const steps: Tour['steps'] = [
  {
    part: null,
    title: 'Three new things to try',
    body: (
      <>
        <p>This tour walks you through them on this practice archive, about fifteen minutes:</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Read a Tavola from the factory catalogue, and check it.</li>
          <li>Choose a drawing that Visitors may see.</li>
          <li>See Ricambi as somebody who isn’t a member.</li>
        </ol>
        <p className="mt-3">Each step waits here until you’ve done it on the page.</p>
      </>
    ),
    next: 'Start',
  },
  {
    part: 'read',
    title: 'Start a reading',
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Choose the PDF <b>Iso Rivolta Parts Catalogue Part2</b>.
        </li>
        <li>
          Model <b>Iso Rivolta IR 300</b>, from page <b className="tabular">1</b> to page{' '}
          <b className="tabular">2</b>.
        </li>
        <li>
          Press <b>Estimate the cost</b>, enter <b className="tabular">5</b> as the spending limit,
          then <b>Start reading</b>.
        </li>
      </ol>
    ),
    go: {
      to: '/readings',
      label: 'Go to Readings',
      unless: (where) => where.path === '/readings',
    },
    done: (where) => where.path.startsWith('/readings/runs/'),
  },
  {
    part: 'read',
    title: 'Wait for it to finish',
    body: (
      <p>
        Reading two pages takes a few minutes. You can leave this page; the reading carries on. When
        it says <b>Finished</b>, press <b>Open, Unchecked</b> beside Tavola{' '}
        <b className="tabular">51</b>.
      </p>
    ),
    done: onTavola,
    // A Tavola 51 somebody has already published is not read again, and leaves nothing to check.
    skip: 'Tavola 51 wasn’t loaded',
  },
  {
    part: 'read',
    title: 'Check what was read',
    body: (
      <>
        <p>
          Press <b>How to check this Tavola</b>, then compare the circles on the drawing and the
          rows of Parts with the factory sheet. Point at any button to see what it does.
        </p>
        <p className="mt-3">
          Please don’t press <b>Publish</b>: this Tavola stays Unchecked for the next tester.
        </p>
      </>
    ),
    next: 'I’ve checked it',
  },
  {
    part: 'show',
    title: 'Show a drawing to Visitors',
    body: (
      <>
        <p>
          Visitors are people reading Ricambi without signing in. You may show them a few Published
          drawings, so they can judge the archive before they join.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Open any Published Tavola from the catalogue.</li>
          <li>
            Below the drawing, under <b>Visitors</b>, press <b>Show to Visitors</b>.
          </li>
          <li>Click the one number on the drawing Visitors may read.</li>
        </ol>
      </>
    ),
    go: { to: '/', label: 'Go to the catalogue', unless: onTavola },
    next: 'It’s shown',
  },
  {
    part: 'visit',
    title: 'Sign out',
    body: (
      <p>
        Now see Ricambi as a Visitor does. Sign out with the button at the top; this tour carries
        on.
      </p>
    ),
    done: (where) => where.known && !where.signedIn,
  },
  {
    part: 'visit',
    title: 'What a Visitor sees',
    body: (
      <p>
        Without signing in, this is all of Ricambi: which cars the archive covers and how much of
        each, the drawings you chose, and how to join the Club. Open the drawing you just showed.
      </p>
    ),
    go: { to: '/', label: 'Go to the start page', unless: (where) => where.path === '/' },
    done: (where) => where.known && !where.signedIn && onTavola(where),
  },
  {
    part: 'visit',
    title: 'One number open',
    body: (
      <p>
        A Visitor reads only what the factory printed, and only at the number you opened: the others
        are locked. None of the Club’s notes, photographs or cross-references are shown. A member
        following the same link sees the whole Tavola.
      </p>
    ),
    next: 'Next',
  },
  {
    part: null,
    title: 'That’s all of it',
    body: (
      <p>
        Sign in again to carry on as before. Anything unclear, slow or wrong along the way: reply to
        the e-mail this tour came with.
      </p>
    ),
    go: {
      to: '/sign-in',
      label: 'Sign in',
      unless: (where) => where.signedIn || where.path === '/sign-in',
    },
    next: 'End the tour',
  },
];

export const readingTour: Tour = {
  footer: 'Tour: reading and Visitors',
  parts: [
    { part: 'read', name: 'Read' },
    { part: 'show', name: 'Show' },
    { part: 'visit', name: 'Visit' },
  ],
  steps,
};
