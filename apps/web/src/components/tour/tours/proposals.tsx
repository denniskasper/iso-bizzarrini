import type { Tour } from '../tour-steps';
import { onProposals } from '../tour-steps';
/** **Proposals**: a Fix with a screenshot, an Idea worked out with Claude, and following both. */
const steps: Tour['steps'] = [
  {
    part: null,
    title: 'Something new: Proposals',
    body: (where) => (
      <>
        <p>
          You can now hand the developer a <b>Fix</b> or an <b>Idea</b> from inside Ricambi. You
          talk it through with Claude, who asks until it is clear, and you hand it over when it is.
          About twenty minutes:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Propose a Fix, with a screenshot.</li>
          <li>Work out an Idea.</li>
          <li>Follow what becomes of them.</li>
        </ol>
        <p className="mt-3">Propose is only here, on the practice archive.</p>
        {where.known && !where.mayPropose && (
          <p className="mt-3 font-semibold">
            You don’t see Propose at the top yet. Ask the developer to let you propose, then reload
            this page.
          </p>
        )}
      </>
    ),
    next: 'Start',
  },
  {
    part: 'fix',
    title: 'Propose a Fix',
    body: (
      <>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Open a page where something is wrong, unclear or slow: a Tavola, the search, anything.
          </li>
          <li>
            Press <b>Propose</b> at the top, and choose <b>Fix</b>.
          </li>
          <li>Say what is wrong, in your own words, and answer what Claude asks.</li>
        </ol>
        <p className="mt-3">
          On a phone the conversation fills the screen and this tour waits behind it. Press{' '}
          <b>Close</b> to come back: what you wrote is kept.
        </p>
      </>
    ),
    go: { to: '/', label: 'Go to the catalogue', unless: (where) => where.path !== '/proposals' },
    next: 'I’ve started it',
  },
  {
    part: 'fix',
    title: 'Show a screenshot',
    body: (
      <p>
        Take a screenshot of what you mean and paste it into the answer box, or press{' '}
        <b>Add screenshots</b>. Write a note beside it saying what to look at. It is sent with your
        next answer.
      </p>
    ),
    next: 'It’s sent',
  },
  {
    part: 'fix',
    title: 'Finish and hand over',
    body: (
      <p>
        When you have said it all, press <b>Finish</b>. Claude writes the Fix out the way the
        developer reads it, with your own words kept beneath. If something is not right, say so and
        it is written again. Then press <b>Hand over</b>.
      </p>
    ),
    next: 'It’s handed over',
  },
  {
    part: 'idea',
    title: 'Work out an Idea',
    body: (
      <>
        <p>
          Press <b>Propose</b> again and choose <b>Idea</b>: something Ricambi could do, or do
          differently. Claude asks it through with you: who it is for, what happens today, what it
          would change, and where it clashes with how Ricambi works. Push back where it is wrong.
        </p>
        <p className="mt-3">
          Stop whenever you like: <b>Close</b> keeps it under <b>Your drafts</b> to carry on later.
          Finish and hand it over as before.
        </p>
      </>
    ),
    next: 'It’s handed over',
  },
  {
    part: 'follow',
    title: 'Follow what becomes of them',
    body: (
      <p>
        <b>Proposals</b> lists what you have handed over. Each is <b>New</b> until the developer
        takes it up, then <b>Taken up</b>, and in the end <b>Done</b>, or <b>Declined</b> with the
        reason. Open one to read it as the developer does.
      </p>
    ),
    go: { to: '/proposals', label: 'Go to Proposals', unless: onProposals },
    done: (where) => where.path.startsWith('/proposals/'),
  },
  {
    part: null,
    title: 'That’s all of it',
    body: (
      <p>
        Propose stays at the top of every page. Use it whenever something bothers you or an idea
        comes: there is no wrong one, and the developer reads them all. Anything about this tour
        itself: reply to the e-mail it came with.
      </p>
    ),
    next: 'End the tour',
  },
];

export const proposalsTour: Tour = {
  footer: 'Tour: Proposals',
  parts: [
    { part: 'fix', name: 'Fix' },
    { part: 'idea', name: 'Idea' },
    { part: 'follow', name: 'Follow' },
  ],
  steps,
};
