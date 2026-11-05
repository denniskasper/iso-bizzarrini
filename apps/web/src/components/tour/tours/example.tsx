import type { Tour } from '../tour-steps';

/**
 * **Not a tour for anybody**: the one the browser suite walks to prove the panel works, with
 * steps that wait on what never changes (a public page, signing out), so rewording or retiring a
 * real tour never touches a test. Started only by `?tour=example`, and not offered in the footer.
 */
export const exampleTour: Tour = {
  footer: null,
  parts: [
    { part: 'go', name: 'Go' },
    { part: 'leave', name: 'Leave' },
  ],
  steps: [
    { part: null, title: 'An example tour', body: <p>It walks nothing new.</p>, next: 'Start' },
    {
      part: 'go',
      title: 'Open the privacy page',
      body: <p>It moves on by itself once the page is open.</p>,
      go: {
        to: '/privacy',
        label: 'Go to Privacy',
        unless: (where) => where.path === '/privacy',
      },
      done: (where) => where.path === '/privacy',
      skip: 'Skip to leaving',
    },
    {
      part: 'leave',
      title: 'Sign out',
      body: <p>It moves on by itself once signed out.</p>,
      done: (where) => where.known && !where.signedIn,
    },
    { part: null, title: 'The end', body: <p>That is all.</p>, next: 'End the tour' },
  ],
};
