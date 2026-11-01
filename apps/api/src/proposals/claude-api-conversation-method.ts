import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { BundledDocument } from './bundled-documents.js';
import {
  ConversationPausedError,
  ConversationUnavailableError,
  type Conversation,
  type ConversationMethod,
  type ConversationTurn,
} from './conversation-method.js';
import { factsOf, PLAYBOOK, SUMMARY_SCHEMA, WRITE_THE_PROPOSAL } from './playbook.js';

/**
 * One model, with no picker (issue #150): Sonnet 5.5, at about half Opus's price, at `high`
 * effort, its own default, named so that it does not move when the default does. Grilling an
 * Idea needs judgment, and at the number of conversations a practice system has, the effort is
 * worth more than the cents it costs.
 */
export const CONVERSATION_MODEL = 'claude-sonnet-5-5';
export const CONVERSATION_EFFORT = 'high';

/** The ceiling on an answer and on a summary, thinking included. */
const MAX_TOKENS = 16000;

/**
 * **Claude, reached with the conversation's own API key** (issue #155): Integration's
 * conversation method, billed to a workspace kept for developing Ricambi, whose monthly limit is
 * what stops it.
 *
 * Every request is the playbook, then the bundled documents, cached together for an hour so that
 * an author who takes their time does not pay to send them again each turn, then the facts of
 * this Proposal, then the turns with their screenshots. The key goes nowhere but the request
 * header.
 *
 * There is **no fallback to another model**: the summary names the model that wrote it, and
 * that has to stay true.
 */
export interface ClaudeApiConversationOptions {
  apiKey: string;
  documents: BundledDocument[];
  /** Only for a test standing in for the API. */
  baseURL?: string;
  maxRetries?: number;
}

export function createClaudeApiConversationMethod(
  options: ClaudeApiConversationOptions,
): ConversationMethod {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: options.maxRetries ?? 2,
  });
  const documents = options.documents
    .map((document) => `<document path="${document.path}">\n${document.text}\n</document>`)
    .join('\n\n');

  function systemFor(conversation: Conversation): Anthropic.TextBlockParam[] {
    return [
      { type: 'text', text: PLAYBOOK },
      {
        type: 'text',
        text: `Ricambi's glossary, product spec and decisions, as of the Version running:\n\n${documents}`,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      { type: 'text', text: factsOf(conversation) },
    ];
  }

  return {
    name: `Claude (${CONVERSATION_MODEL}) with an API key`,

    async *answer(conversation) {
      try {
        const stream = client.messages.stream({
          model: CONVERSATION_MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: CONVERSATION_EFFORT },
          system: systemFor(conversation),
          messages: messagesOf(conversation.turns),
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield event.delta.text;
          }
        }
        const finished = await stream.finalMessage();
        if (finished.stop_reason === 'refusal') {
          throw new ConversationUnavailableError('The model declined to answer.');
        }
      } catch (error) {
        throw classify(error);
      }
    },

    async summarise(conversation) {
      let response;
      try {
        response = await client.messages.parse({
          model: CONVERSATION_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemFor(conversation),
          messages: [
            ...messagesOf(conversation.turns),
            { role: 'user', content: WRITE_THE_PROPOSAL },
          ],
          output_config: {
            effort: CONVERSATION_EFFORT,
            format: zodOutputFormat(SUMMARY_SCHEMA[conversation.kind]),
          },
        });
      } catch (error) {
        throw classify(error);
      }

      if (response.stop_reason === 'refusal') {
        throw new ConversationUnavailableError('The model declined to write the Proposal.');
      }
      if (response.stop_reason === 'max_tokens' || response.parsed_output === null) {
        throw new ConversationUnavailableError(
          'The model’s Proposal was cut short or could not be read.',
        );
      }
      return conversation.kind === 'fix'
        ? {
            kind: 'fix',
            ...SUMMARY_SCHEMA.fix.parse(response.parsed_output),
            model: CONVERSATION_MODEL,
          }
        : {
            kind: 'idea',
            ...SUMMARY_SCHEMA.idea.parse(response.parsed_output),
            model: CONVERSATION_MODEL,
          };
    },
  };
}

/**
 * The turns as the API takes them: the author's as the user's, each screenshot as an image
 * behind its note, and the conversation's own answers as the assistant's. A turn with nothing in
 * it is left out, since the API refuses an empty one.
 */
function messagesOf(turns: ConversationTurn[]): Anthropic.MessageParam[] {
  return turns.flatMap((turn): Anthropic.MessageParam[] => {
    if (turn.speaker === 'conversation') {
      return turn.text === '' ? [] : [{ role: 'assistant', content: turn.text }];
    }
    const content: Anthropic.ContentBlockParam[] = turn.screenshots.flatMap((shot, index) => [
      {
        type: 'text' as const,
        text:
          shot.note === null
            ? `Screenshot ${index + 1}:`
            : `Screenshot ${index + 1}, with the author's note: ${shot.note}`,
      },
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: shot.mediaType,
          data: shot.data.toString('base64'),
        },
      },
    ]);
    if (turn.text !== '') {
      content.push({ type: 'text', text: turn.text });
    }
    return content.length === 0 ? [] : [{ role: 'user', content }];
  });
}

/**
 * **What went wrong, as one of the two things the archive tells an author.** The workspace's
 * monthly limit is the provider refusing a well-formed request with a usage-limit message, until
 * the date it names; everything else is the conversation being unavailable. Never carries the
 * request, and so never the key.
 */
function classify(error: unknown): Error {
  if (error instanceof ConversationUnavailableError) {
    return error;
  }
  if (error instanceof Anthropic.BadRequestError && /usage limits?/i.test(error.message)) {
    return new ConversationPausedError();
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ConversationUnavailableError(
      'The API key was refused. Check PROPOSALS_ANTHROPIC_API_KEY.',
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ConversationUnavailableError('The API is limiting requests.');
  }
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    return new ConversationUnavailableError(`The API answered ${error.status}.`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ConversationUnavailableError('The API could not be reached.');
  }
  return new ConversationUnavailableError('The request to the API failed.');
}
