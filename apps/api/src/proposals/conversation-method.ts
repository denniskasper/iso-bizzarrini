import type { ProposalContext, ProposalKind, ProposalSpeaker } from '@ricambi/contracts';

/**
 * **The one seam between a Proposal and a model** (issue #152), beside the Reading method. A
 * conversation method is given what the author brings — a Fix or an Idea — what was on screen
 * when they started, and every turn so far, and writes the next answer a piece at a time.
 * Everything around it — who may propose, whose Draft is whose, the order turns are kept in — is
 * plain code that never talks to a model, and is tested against a fake one (ADR 0017).
 */
export interface ConversationMethod {
  /** What the conversation is had with, for an operator. Never a credential. */
  readonly name: string;
  /** The next answer, as it is written. Ends when the answer does. */
  answer(conversation: Conversation): AsyncIterable<string>;
}

/** Everything the method is told, and nothing about who the author is. */
export interface Conversation {
  kind: ProposalKind;
  context: ProposalContext;
  /** Oldest first, ending with the author's turn being answered. */
  turns: ConversationTurn[];
}

export interface ConversationTurn {
  speaker: ProposalSpeaker;
  text: string;
}
