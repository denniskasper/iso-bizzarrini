import type { AppConfig } from '../config/config.js';
import { readBundledDocuments, type BundledDocument } from '../proposals/bundled-documents.js';
import { createClaudeApiConversationMethod } from '../proposals/claude-api-conversation-method.js';
import {
  createClaudeSubscriptionConversationMethod,
  machineLoginAvailable,
} from '../proposals/claude-subscription-conversation-method.js';
import type { ConversationMethod, ConversationUsage } from '../proposals/conversation-method.js';
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

export interface ConversationCredentials {
  /**
   * Whether Claude Code on this machine is signed in with a Claude subscription, found by
   * {@link findMachineLogin}. A token in the environment never counts.
   */
  machineLogin?: boolean;
  /** The glossary, spec and ADRs, unless a test stands in for the image. */
  documents?: () => BundledDocument[];
  /**
   * Told what each request to the API used, and its price, for the server's log. The
   * subscription is not billed by the request, so it tells nothing.
   */
  onUsage?: (usage: ConversationUsage) => void;
}

/**
 * **Whether this machine's own Claude Code login is there to talk with** (issue #156). Not asked
 * in Production, which has no conversation, nor where the fake one is named.
 */
export async function findMachineLogin(
  config: Pick<AppConfig, 'environmentMode' | 'proposals'>,
): Promise<boolean> {
  if (config.environmentMode === 'production' || config.proposals.method === 'fake') {
    return false;
  }
  return machineLoginAvailable();
}

/** Why a token handed in is not the subscription's credential (ADR 0012, as amended). */
const TOKEN_REFUSED =
  'CLAUDE_CODE_OAUTH_TOKEN is not accepted for Proposals: the subscription conversation runs ' +
  'only on the Claude Code login already on this machine, so that nobody’s subscription is ' +
  'handed to a server.';

export function configureConversation(
  config: Pick<AppConfig, 'environmentMode' | 'proposals'>,
  { machineLogin = false, documents = readBundledDocuments, onUsage }: ConversationCredentials = {},
): ConfiguredConversation {
  if (config.environmentMode === 'production') {
    return {
      method: null,
      unavailable: 'Proposals are for practice systems, and this is Production.',
    };
  }
  if (config.proposals.method === 'fake') {
    return { method: createFakeConversationMethod(), unavailable: null };
  }

  const { apiKey, tokenInEnvironment } = config.proposals;
  // Exactly one credential, so which one pays is never a guess (issue #156).
  if (apiKey !== undefined && machineLogin) {
    return {
      method: null,
      unavailable:
        'There are both PROPOSALS_ANTHROPIC_API_KEY and a Claude Code login on this machine. ' +
        'Remove the one that is not meant to pay for Proposals: the key, or the login with ' +
        '`claude auth logout`.',
    };
  }

  // Unnamed, the credential names it (issues #155, #156).
  const kind =
    config.proposals.method ??
    (apiKey !== undefined ? 'api-key' : machineLogin ? 'subscription' : undefined);

  switch (kind) {
    case undefined:
      return {
        method: null,
        unavailable:
          'No conversation method is configured. Set PROPOSALS_ANTHROPIC_API_KEY as a secret, ' +
          'sign in to Claude Code on this machine with `claude auth login`, or set ' +
          'PROPOSALS_METHOD=fake.' +
          (tokenInEnvironment ? ` ${TOKEN_REFUSED}` : ''),
      };
    case 'api-key': {
      if (apiKey === undefined) {
        return {
          method: null,
          unavailable:
            'PROPOSALS_METHOD is api-key, and there is no API key. Set ' +
            'PROPOSALS_ANTHROPIC_API_KEY as a secret.',
        };
      }
      const bundled = bundledOrWhy(documents);
      return typeof bundled === 'string'
        ? { method: null, unavailable: bundled }
        : {
            method: createClaudeApiConversationMethod({ apiKey, documents: bundled, onUsage }),
            unavailable: null,
          };
    }
    case 'subscription': {
      if (tokenInEnvironment) {
        return { method: null, unavailable: TOKEN_REFUSED };
      }
      if (!machineLogin) {
        return {
          method: null,
          unavailable:
            'PROPOSALS_METHOD is subscription, and Claude Code is not signed in on this machine ' +
            'with a Claude subscription. Sign in with `claude auth login`.',
        };
      }
      const bundled = bundledOrWhy(documents);
      return typeof bundled === 'string'
        ? { method: null, unavailable: bundled }
        : {
            method: createClaudeSubscriptionConversationMethod({ documents: bundled }),
            unavailable: null,
          };
    }
  }
}

/**
 * Read once, here, so an image built without them says so rather than a conversation carrying on
 * without the glossary it is meant to hold words against.
 */
function bundledOrWhy(documents: () => BundledDocument[]): BundledDocument[] | string {
  try {
    return documents();
  } catch {
    return (
      'The glossary, the spec and the ADRs are not where the server reads them from. ' +
      'The image was built without them.'
    );
  }
}
