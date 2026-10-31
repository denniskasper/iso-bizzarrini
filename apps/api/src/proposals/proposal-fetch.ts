import { resolve } from 'node:path';
import type { ProposalSummary } from '@ricambi/contracts';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { proposals, type ProposalRow } from '../db/schema.js';
import { createProposalRepository } from '../repositories/proposal-repository.js';

/**
 * **What the developer's agent reads a Proposal from** (issue #157): the New ones listed, and one
 * printed in full as Markdown — its summary, the author's own words, the conversation, and where
 * on this system's volume each of its screenshots is, so the agent can open them.
 *
 * Only what has been handed over: a Draft is its author's alone, here as on every screen.
 */

/** The New Proposals, the latest handed over first, a line each. */
export async function listNewProposals(db: Db): Promise<string> {
  const listed = await createProposalRepository(db).listHandedOver('new');
  if (listed.length === 0) {
    return 'No New Proposals.\n';
  }
  return (
    listed
      .map(
        ({ proposal }) =>
          `${proposal.id}  ${KIND_NAME[proposal.kind]}  ${day(proposal.handedOverAt)}  ` +
          (proposal.summary?.title ?? ''),
      )
      .join('\n') + '\n'
  );
}

/**
 * One handed-over Proposal in full, or null where there is none by that id or it is a Draft.
 * `storagePath` is the system's file store, which the screenshots' locations are read against.
 */
export async function describeProposal(
  dependencies: { db: Db; storagePath: string },
  proposalId: string,
): Promise<string | null> {
  const { db, storagePath } = dependencies;
  if (!z.uuid().safeParse(proposalId).success) {
    return null;
  }
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), ne(proposals.status, 'draft')))
    .limit(1);
  if (!proposal?.summary) {
    return null;
  }

  const repository = createProposalRepository(db);
  const turns = await repository.listTurns(proposal.id);
  const screenshots = await repository.listScreenshots(proposal.id);
  const sent = screenshots.filter((screenshot) => screenshot.turnId !== null);
  const { summary } = proposal;

  const lines = [
    `# ${summary.title}`,
    '',
    `- Proposal: ${proposal.id}`,
    `- Kind: ${KIND_NAME[proposal.kind]}`,
    `- Status: ${STATUS_NAME[proposal.status]}`,
    ...(proposal.declineReason === null ? [] : [`- Declined because: ${proposal.declineReason}`]),
    `- Handed over: ${day(proposal.handedOverAt)}`,
    `- Page: ${proposal.pageAddress}`,
    `- Version: ${proposal.version}`,
    ...(proposal.modelName === null ? [] : [`- Model: ${proposal.modelName}`]),
    ...(proposal.tavolaNumber === null ? [] : [`- Tavola: ${tavolaOf(proposal)}`]),
    `- Summary written by: ${summary.model}`,
    '',
    ...summaryOf(summary),
    '## The author’s words',
    '',
    ...summary.authorsWords.flatMap((words) => [...quoted(words), '']),
    '## Screenshots',
    '',
    ...(sent.length === 0
      ? ['None.', '']
      : sent.flatMap((screenshot, index) => [
          `${index + 1}. ${resolve(storagePath, screenshot.originalKey)}`,
          ...(screenshot.note === null ? [] : [`   Note: ${screenshot.note}`]),
        ])),
    ...(sent.length === 0 ? [] : ['']),
    '## The conversation',
    '',
    ...turns.flatMap((turn) => {
      const shown = sent.filter((screenshot) => screenshot.turnId === turn.id);
      return [
        `**${turn.speaker === 'author' ? 'Author' : 'Conversation'}:**`,
        '',
        turn.text,
        ...(shown.length === 0
          ? []
          : ['', `(with screenshot ${shown.map((one) => sent.indexOf(one) + 1).join(', ')})`]),
        '',
      ];
    }),
  ];
  return lines.join('\n');
}

function summaryOf(summary: ProposalSummary): string[] {
  if (summary.kind === 'fix') {
    return [
      '## What happened',
      '',
      summary.whatHappened,
      '',
      '## What was expected',
      '',
      summary.whatWasExpected,
      '',
      '## Steps to make it happen',
      '',
      ...listed(summary.steps.map((step, index) => `${index + 1}. ${step}`)),
      '## Where',
      '',
      summary.where,
      '',
    ];
  }
  return [
    '## The problem',
    '',
    summary.problem,
    '',
    '## Who it is for',
    '',
    summary.forWhom.length === 0 ? 'Nobody named.' : summary.forWhom.join(', '),
    '',
    '## What it should do',
    '',
    summary.whatItShouldDo,
    '',
    '## Decisions made',
    '',
    ...listed(summary.decisions.map((decision) => `- ${decision}`)),
    '## Open questions',
    '',
    ...listed(summary.openQuestions.map((question) => `- ${question}`)),
    '## New terms',
    '',
    ...listed(summary.newTerms.map(({ term, meaning }) => `- **${term}**: ${meaning}`)),
  ];
}

/** Items, or a plain "None.", and a blank line after either. */
function listed(items: string[]): string[] {
  return [...(items.length === 0 ? ['None.'] : items), ''];
}

/** Word for word, as a Markdown quotation, blank lines and all. */
function quoted(words: string): string[] {
  return words.split('\n').map((line) => (line === '' ? '>' : `> ${line}`));
}

function tavolaOf(proposal: ProposalRow): string {
  return [proposal.tavolaNumber, proposal.tavolaName].filter((part) => part).join(' — ');
}

function day(at: Date | null): string {
  return at === null ? '' : at.toISOString().slice(0, 10);
}

const KIND_NAME: Record<ProposalRow['kind'], string> = { fix: 'Fix', idea: 'Idea' };

const STATUS_NAME: Record<ProposalRow['status'], string> = {
  draft: 'Draft',
  new: 'New',
  'taken-up': 'Taken up',
  done: 'Done',
  declined: 'Declined',
};
