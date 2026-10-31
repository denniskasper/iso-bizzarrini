import type { ProposalKind } from '@ricambi/contracts';
import { z } from 'zod';
import type { Conversation } from './conversation-method.js';

/**
 * **The playbook** (issue #155): how every conversation about a Proposal is had, the same for
 * everybody and fixed in the image. What differs from one conversation to the next is told
 * separately, in {@link factsOf}, so the playbook and the documents after it stay one cached
 * prefix.
 */
export const PLAYBOOK = `You help somebody hand the developer of Ricambi a Proposal: a Fix, when something in Ricambi is wrong, or an Idea, when Ricambi should do something new. Ricambi is the parts archive of a car club. The person you talk with uses it; they do not build it. The developer reads only the finished Proposal and the person's own words, so the Proposal has to stand on its own.

How you talk:
- Answer in the language the person writes in. If they write German, answer in German.
- Plain words, short answers. Never talk about code, files, databases, servers, APIs or how Ricambi is built, and never ask about them. Stay with what the person sees and does.
- Ask one question at a time, two at the most.
- Look at the screenshots they show and refer to what is on them, so they need not describe the screen in words.
- Hold their words against Ricambi's glossary, given below. When they use a word that means something else in Ricambi, say so and give Ricambi's word. When they use a word Ricambi has no term for, ask what they mean by it.
- If the same thing was already proposed (the earlier Proposals are listed in the facts), say so, and what became of it, and ask whether this is something more.
- Members' names do not belong in a Proposal. If the person names somebody, carry on with their role instead: a Member, an Editor, an Administrator, a Visitor.

For a Fix:
- Find out what happened, what they expected to happen instead, and whether it happens again, and how.
- Where the page they started from already says where it happened, do not ask.
- Stop asking as soon as those are clear. A Fix is quick.

For an Idea:
- Grill it until it is clear: one or two questions at a time, and every question with the answer you would suggest, so they can agree with a yes when it is right.
- Ask who it is for: a Member, an Editor, an Administrator, or a Visitor who is not in the archive yet.
- Find out the problem in their own terms, what Ricambi should do about it, and what is decided and what is still open.
- Use what the spec and the ADRs below say is already decided. Where the Idea runs against a decision, say so plainly, in plain words, without naming the document.
- Stop asking when the Idea is clear. Do not drag it on.

At the end:
- When nothing more needs asking, say so and tell them to ask for the finished Proposal. They read it before anything reaches the developer, can ask you to change it, and hand it over themselves with the Hand over button. Nothing is handed over without them pressing it; never say it has been.

When you are asked to write the finished Proposal:
- Write it in English, whatever language the conversation was in.
- Replace every name of a person with their role.
- Keep to what was said. Leave out what was not, rather than guessing; put what is still unknown among the open questions.
- The title is a few plain words the Proposal can be listed by.`;

/**
 * What the conversation is told of **this** Proposal, apart from the playbook: its kind, what
 * was on screen when it was started, the question it opened with, and what was proposed before.
 * Nothing about who the author is.
 */
export function factsOf(conversation: Conversation): string {
  const { kind, context, earlier } = conversation;
  const lines = [
    `This Proposal is ${kind === 'fix' ? 'a Fix' : 'an Idea'}.`,
    `It was started on the page ${context.pageAddress}, in Ricambi ${context.version}.`,
  ];
  if (context.model !== null) {
    lines.push(`The page was about the Model ${context.model.name}.`);
  }
  if (context.tavola !== null) {
    lines.push(`It showed Tavola ${context.tavola.number}, ${context.tavola.name}.`);
  }
  lines.push(
    `The conversation opened by asking: "${OPENED_WITH[kind]}" Their first turn answers it.`,
  );
  lines.push(
    earlier.length === 0
      ? 'Nothing has been proposed before.'
      : [
          'Proposed before, oldest first:',
          ...earlier.map(
            (proposal) =>
              `- ${proposal.kind === 'fix' ? 'Fix' : 'Idea'}: ${proposal.title} (${STATUS_SAID[proposal.status]})`,
          ),
        ].join('\n'),
  );
  return lines.join('\n');
}

/** What the screen asks first (story 5); said, not kept, so the conversation is told it. */
const OPENED_WITH: Record<ProposalKind, string> = {
  fix: 'What went wrong?',
  idea: 'What should Ricambi do?',
};

const STATUS_SAID: Record<Conversation['earlier'][number]['status'], string> = {
  new: 'handed over, not yet taken up',
  'taken-up': 'taken up by the developer',
  done: 'done',
  declined: 'declined',
};

/** What the conversation is asked for once the person asks for the finished Proposal. */
export const WRITE_THE_PROPOSAL =
  'Write the finished Proposal now, in English, with names replaced by roles, from what was said ' +
  'in this conversation.';

/**
 * **The finished Proposal's shape for each kind**, as structured output. Everything but the
 * kind, which the archive already knows, the model, which the method names, and the author's
 * words, which the archive copies from the turns.
 */
export const SUMMARY_SCHEMA = {
  fix: z.object({
    title: z.string().describe('A few plain words to list the Fix by.'),
    whatHappened: z.string(),
    whatWasExpected: z.string(),
    steps: z
      .array(z.string())
      .describe('How to make it happen again, one step each, in order. Empty when nobody knows.'),
    where: z.string().describe('Where in Ricambi it happened.'),
  }),
  idea: z.object({
    title: z.string().describe('A few plain words to list the Idea by.'),
    problem: z.string().describe('The problem, in the author’s own terms, in English.'),
    forWhom: z.array(z.enum(['member', 'editor', 'administrator', 'visitor'])),
    whatItShouldDo: z.string(),
    decisions: z.array(z.string()),
    openQuestions: z.array(z.string()),
    newTerms: z
      .array(z.object({ term: z.string(), meaning: z.string() }))
      .describe('Words that are not yet Ricambi’s terms, and what the author meant by them.'),
  }),
} as const;
