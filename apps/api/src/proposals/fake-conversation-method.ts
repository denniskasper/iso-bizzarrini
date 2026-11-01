import type { FixSummary, IdeaSummary } from '@ricambi/contracts';
import type { ConversationMethod, ConversationUsage } from './conversation-method.js';

/**
 * What the fake says to everything: a question of the kind the real conversation asks, so a
 * screen showing it looks like the conversation working, and nothing anybody could mistake for
 * advice.
 */
export const FAKE_ANSWER =
  'Thank you. This is the practice conversation, which answers everybody the same way.\n\n' +
  'Two things, as the real one would ask them:\n\n' +
  '- **What did you expect to happen instead?**\n' +
  '- Where were you when it happened?';

/** The model the fake's summaries say wrote them. */
export const FAKE_MODEL = 'The fake conversation';

/**
 * **The finished Proposal the fake writes** (issue #153), one for each kind, whatever was said:
 * fixed, so a test can say what it expects to read.
 */
export const FAKE_SUMMARY: {
  fix: Omit<FixSummary, 'authorsWords'>;
  idea: Omit<IdeaSummary, 'authorsWords'>;
} = {
  fix: {
    kind: 'fix',
    title: 'A practice Fix',
    whatHappened: 'Something on the page did not work as it should.',
    whatWasExpected: 'It works.',
    steps: ['Open the page the Proposal was started on.', 'Do what the author did.'],
    where: 'The page the Proposal was started on.',
    model: FAKE_MODEL,
  },
  idea: {
    kind: 'idea',
    title: 'A practice Idea',
    problem: 'Something a member wants to do cannot be done yet.',
    forWhom: ['member'],
    whatItShouldDo: 'Let them do it.',
    decisions: ['It is for every Member.'],
    openQuestions: ['Who else would use it?'],
    newTerms: [],
    model: FAKE_MODEL,
  },
};

/**
 * **The fake conversation method** (issue #152), for the tests and for a laptop with no
 * credential. It sends nothing anywhere, answers every turn with the same text, a few words at a
 * time, so that the answer streams as a real one would, and finishes every Proposal with the
 * same summary for its kind.
 */
export function createFakeConversationMethod(): ConversationMethod {
  return {
    name: FAKE_MODEL,
    // Priced, at nothing: so a practice system shows its costs as the real one does, and they
    // are nought.
    priced: true,
    billed: false,
    async *answer(_conversation, used) {
      for (const piece of FAKE_ANSWER.match(/\S+\s*/g) ?? []) {
        yield piece;
      }
      used?.(nothingUsed('answer'));
    },
    async summarise({ kind }, used) {
      used?.(nothingUsed('summary'));
      return structuredClone(FAKE_SUMMARY[kind]);
    },
  };
}

function nothingUsed(request: ConversationUsage['request']): ConversationUsage {
  return {
    request,
    model: FAKE_MODEL,
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
  };
}
