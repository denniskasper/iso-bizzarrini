import type {
  FixSummary,
  IdeaSummary,
  ProposalContext,
  ProposalKind,
  ProposalSpeaker,
  ProposalStatus,
} from '@ricambi/contracts';

/**
 * **The one seam between a Proposal and a model** (issue #152), beside the Reading method. A
 * conversation method is given what the author brings — a Fix or an Idea — what was on screen
 * when they started, what was proposed before, and every turn so far; it writes the next answer a
 * piece at a time, or the finished Proposal (issue #153). Everything around it — who may propose,
 * whose Draft is whose, the order turns are kept in — is plain code that never talks to a model,
 * and is tested against a fake one (ADR 0017).
 */
export interface ConversationMethod {
  /** What the conversation is had with, for an operator. Never a credential. */
  readonly name: string;
  /** The next answer, as it is written. Ends when the answer does. */
  answer(conversation: Conversation): AsyncIterable<string>;
  /**
   * **The finished Proposal**, as structured output in the fixed shape for the conversation's
   * kind, naming the model that wrote it. The author's own words are not the method's to write:
   * the archive copies them from the turns, so they stay verbatim.
   */
  summarise(conversation: Conversation): Promise<WrittenSummary>;
}

/** What the method writes of a finished Proposal: everything but the author's own words. */
export type WrittenSummary = Omit<FixSummary, 'authorsWords'> | Omit<IdeaSummary, 'authorsWords'>;

/** Everything the method is told, and nothing about who the author is. */
export interface Conversation {
  kind: ProposalKind;
  context: ProposalContext;
  /**
   * Every Proposal handed over before, by its title and where it stands (issue #153), so the
   * conversation can say when something was already raised and what became of it. Oldest first.
   */
  earlier: EarlierProposal[];
  /** Oldest first, ending with the author's turn being answered. */
  turns: ConversationTurn[];
}

export interface EarlierProposal {
  kind: ProposalKind;
  title: string;
  status: Exclude<ProposalStatus, 'draft'>;
}

export interface ConversationTurn {
  speaker: ProposalSpeaker;
  text: string;
  /** What the author showed with the turn (issue #154), in the order they added it. */
  screenshots: ConversationScreenshot[];
}

/** A screenshot as the conversation is shown it: the picture itself, and the author's note. */
export interface ConversationScreenshot {
  note: string | null;
  mediaType: 'image/webp';
  data: Buffer;
}

/**
 * **This month's spending limit is reached** (issue #155): the provider refuses every request
 * until the month turns. Told to the author as Proposals being paused, which is what it is, and
 * kept apart from {@link ConversationUnavailableError}, which is something to tell the developer.
 */
export class ConversationPausedError extends Error {
  constructor() {
    super('The conversation’s spending limit for this month is reached.');
    this.name = 'ConversationPausedError';
  }
}

/**
 * **The conversation could not be had**, for any reason but the spending limit: the provider
 * refused the key, could not be reached, or declined to answer. The message is for the log and
 * never carries the request, and so never the credential.
 */
export class ConversationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationUnavailableError';
  }
}
