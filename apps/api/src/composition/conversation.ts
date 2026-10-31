import type { AppConfig } from '../config/config.js';
import { readBundledDocuments, type BundledDocument } from '../proposals/bundled-documents.js';
import { createClaudeApiConversationMethod } from '../proposals/claude-api-conversation-method.js';
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
  documents: () => BundledDocument[] = readBundledDocuments,
): ConfiguredConversation {
  if (config.environmentMode === 'production') {
    return {
      method: null,
      unavailable: 'Proposals are for practice systems, and this is Production.',
    };
  }

  // Unnamed, the credential names it (issue #155): the key is only ever the conversation's.
  const { apiKey } = config.proposals;
  const kind = config.proposals.method ?? (apiKey === undefined ? undefined : 'api-key');

  switch (kind) {
    case undefined:
      return {
        method: null,
        unavailable:
          'No conversation method is configured. Set PROPOSALS_ANTHROPIC_API_KEY as a secret, ' +
          'or PROPOSALS_METHOD=fake.',
      };
    case 'api-key': {
      if (apiKey === undefined) {
        return {
          method: null,
          unavailable:
            'The API key is configured, and there is no API key. Set ' +
            'PROPOSALS_ANTHROPIC_API_KEY as a secret.',
        };
      }
      // Read once, here, so an image built without them says so rather than a conversation
      // carrying on without the glossary it is meant to hold words against.
      let bundled: BundledDocument[];
      try {
        bundled = documents();
      } catch {
        return {
          method: null,
          unavailable:
            'The glossary, the spec and the ADRs are not where the server reads them from. ' +
            'The image was built without them.',
        };
      }
      return {
        method: createClaudeApiConversationMethod({ apiKey, documents: bundled }),
        unavailable: null,
      };
    }
    case 'fake':
      return { method: createFakeConversationMethod(), unavailable: null };
  }
}
