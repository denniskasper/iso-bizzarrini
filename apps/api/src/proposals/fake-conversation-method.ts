import type { ConversationMethod } from './conversation-method.js';

/**
 * What the fake says to everything: a question of the kind the real conversation asks, so a
 * screen showing it looks like the conversation working, and nothing anybody could mistake for
 * advice.
 */
export const FAKE_ANSWER =
  'Thank you. This is the practice conversation, which answers everybody the same way. ' +
  'What did you expect to happen instead?';

/**
 * **The fake conversation method** (issue #152), for the tests and for a laptop with no
 * credential. It sends nothing anywhere and answers every turn with the same text, a few words
 * at a time, so that the answer streams as a real one would.
 */
export function createFakeConversationMethod(): ConversationMethod {
  return {
    name: 'The fake conversation',
    async *answer() {
      for (const piece of FAKE_ANSWER.match(/\S+\s*/g) ?? []) {
        yield piece;
      }
    },
  };
}
