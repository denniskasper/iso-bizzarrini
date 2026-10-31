import type { AppConfig } from '../config/config.js';
import type { ConversationMethod } from '../proposals/conversation-method.js';
import { createFakeConversationMethod } from '../proposals/fake-conversation-method.js';

/**
 * **What a Proposal's conversation is had with** (issue #152), handed to the application as the
 * Reading method is.
 *
 * Where there is none, or this is Production, nobody is shown Propose and the Proposals are
 * closed to everybody; `unavailable` says why. The server still starts: nothing else in the
 * archive depends on it. That Production holds no credential for it is
 * `assertSafeForEnvironment`'s to refuse (ADR 0012, as amended).
 */
export interface ConfiguredConversation {
  /** What answers, where Proposals are open. */
  readonly method: ConversationMethod | null;
  /** Why nobody can propose here, or `null` where they can. Never carries a credential. */
  readonly unavailable: string | null;
}

export function configureConversation(
  config: Pick<AppConfig, 'environmentMode' | 'proposals'>,
): ConfiguredConversation {
  if (config.environmentMode === 'production') {
    return {
      method: null,
      unavailable: 'Proposals are for practice systems, and this is Production.',
    };
  }

  switch (config.proposals.method) {
    case undefined:
      return {
        method: null,
        unavailable: 'No conversation method is configured. Set PROPOSALS_METHOD.',
      };
    case 'fake':
      return { method: createFakeConversationMethod(), unavailable: null };
  }
}
