import { randomUUID } from 'node:crypto';
import type { Contribution, ContributionTarget, Photograph } from '@ricambi/contracts';
import type { ContributionPhotographRow } from '../db/schema.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import { contributionPhotographImageUrl, type ImageVariant } from '../images/image-addresses.js';
import { preparePhotograph } from '../images/photograph-ingest.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type {
  ContributionRepository,
  ContributionWithAuthor,
  PhotographReader,
} from '../repositories/contribution-repository.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import { photographKeyPrefix, type FileStore } from '../storage/file-store.js';
import { discardImageFiles, openStoredImage, storeImageFiles } from '../storage/stored-images.js';

/**
 * Contributions — **what a member knows, offered in their own words and checked before anybody
 * else sees it** (stories 83–91).
 *
 * This is the half a member does. What an Editor does with what arrives — publishing it,
 * discarding it, folding a correction into the Part — is `contribution-review-service.ts`, and
 * nothing here decides anything: every Contribution this file writes is `waiting`.
 *
 * **Everything takes the person asking**, because every answer depends on them. The same address
 * returns a waiting Contribution to the member who wrote it and nothing to the member beside
 * them, and a service that could be asked without saying who was asking would be one call away
 * from publishing by accident.
 */

/**
 * Far more than anybody types on a phone in a garage, and far less than a pasted document. A
 * Contribution is what one person knows about one thing; something this long is a file, and an
 * Editor is who a member sends a file to.
 */
const MAX_TEXT_LENGTH = 10_000;

/**
 * Enough to show a part from every side and its stamping twice. A ninth is somebody's whole
 * camera roll, and every one of these is a picture an Editor has to look at.
 */
const MAX_PHOTOGRAPHS = 8;

export interface ContributionService {
  write(
    authorId: string,
    target: ContributionTarget,
    written: { text: string; correction: boolean },
  ): Promise<Contribution>;

  /** What this reader may see about a number and every Part listed at it. */
  readAtPosition(readerId: string, positionId: string): Promise<Contribution[]>;

  /**
   * One photograph onto a Contribution: **its author's to do, and only while it waits.** What an
   * Editor checked is what is published, so nothing is added behind their back afterwards.
   */
  attachPhotograph(authorId: string, contributionId: string, upload: Buffer): Promise<Contribution>;

  /** `null` when there is no such photograph *for this reader*, so the route answers 404. */
  openImage(
    reader: PhotographReader,
    photographId: string,
    variant: ImageVariant,
  ): Promise<StoredImage | null>;
}

export function createContributionService(dependencies: {
  contributionRepository: ContributionRepository;
  partRepository: PartRepository;
  positionRepository: PositionRepository;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): ContributionService {
  const { contributionRepository, partRepository, positionRepository, fileStore, clock, logger } =
    dependencies;

  const withPhotographs = (rows: ContributionWithAuthor[], readerId: string) =>
    contributionsWithPhotographs(contributionRepository, rows, readerId);

  /** The Contribution as its reader sees it, re-read — which is what every write answers with. */
  async function readWhole(readerId: string, id: string): Promise<Contribution> {
    const row = await contributionRepository.findReadableBy(readerId, id);
    if (!row) {
      throw new NotFoundError('No such Contribution.');
    }
    const [contribution] = await withPhotographs([row], readerId);
    if (!contribution) {
      throw new Error('A Contribution that was read came back as nothing.');
    }
    return contribution;
  }

  /** Nothing is written about, or read at, something the archive does not hold. */
  async function targetThatExists(target: ContributionTarget): Promise<void> {
    if (target.kind === 'part') {
      if (!(await partRepository.findPart(target.partId))) {
        throw new NotFoundError('No such Part.');
      }
    } else if (!(await positionRepository.findById(target.positionId))) {
      throw new NotFoundError('No such Position.');
    }
  }

  return {
    async write(authorId, target, written) {
      // Trimmed at the ends and nowhere else: the line breaks inside are the member's.
      const text = written.text.trim();
      if (text === '') {
        throw new ValidationError('Write what you know before sending it.');
      }
      if (text.length > MAX_TEXT_LENGTH) {
        throw new ValidationError(
          'That is longer than a Contribution can be. Send the part that matters, or send it in two.',
        );
      }
      if (written.correction && target.kind !== 'part') {
        // Refused by the table too. A bare number has no record to be wrong; what a member has
        // to say there is what sits at it, which is an ordinary Contribution.
        throw new ValidationError('Only a Part’s record can be reported as wrong.');
      }

      await targetThatExists(target);

      const added = await contributionRepository.add({
        partId: target.kind === 'part' ? target.partId : null,
        positionId: target.kind === 'position' ? target.positionId : null,
        authorId,
        body: text,
        correction: written.correction,
        writtenAt: clock.now(),
      });

      return readWhole(authorId, added.id);
    },

    async readAtPosition(readerId, positionId) {
      await targetThatExists({ kind: 'position', positionId });

      const listed = await partRepository.listAtPosition(positionId);

      const rows = await contributionRepository.listReadableBy(readerId, {
        positionId,
        partIds: listed.map((listing) => listing.partId),
      });
      return withPhotographs(rows, readerId);
    },

    async attachPhotograph(authorId, contributionId, upload) {
      // Read under the rule, so a Contribution this person may not see is one that is not there.
      const contribution = await contributionRepository.findReadableBy(authorId, contributionId);
      if (!contribution) {
        throw new NotFoundError('No such Contribution.');
      }
      if (contribution.authorId !== authorId) {
        throw new ForbiddenError('Only the member who wrote a Contribution can add to it.');
      }
      if (contribution.state !== 'waiting') {
        throw decided();
      }

      const prepared = await preparePhotograph(upload);

      // Minted here, because the files are written before the row is, and under it. The prefix
      // is the one a Part's photographs use: the id is the whole of the path, so the day an
      // Editor moves this picture onto the Part (story 119) nothing on disk is renamed.
      const id = randomUUID();
      const prefix = photographKeyPrefix(id);
      const stored = await storeImageFiles(fileStore, prefix, upload, prepared);

      let added: Awaited<ReturnType<ContributionRepository['addPhotograph']>>;
      try {
        added = await contributionRepository.addPhotograph(
          { id, contributionId, ...stored, uploadedAt: clock.now() },
          MAX_PHOTOGRAPHS,
        );
      } catch (error) {
        // Files with no row are litter nothing will ever look at again. Take them back.
        await discardImageFiles(fileStore, prefix);
        throw error;
      }
      if (added === 'decided' || added === 'full') {
        await discardImageFiles(fileStore, prefix);
        // Asked again under the row's lock, because ingest takes long enough for an Editor to
        // have decided in the meantime — and what they checked is what is published.
        throw added === 'decided'
          ? decided()
          : new ConflictError(
              'A Contribution carries at most eight photographs. Send the rest with another.',
            );
      }

      return readWhole(authorId, contributionId);
    },

    async openImage(reader, photographId, variant) {
      const photograph = await contributionRepository.findPhotographReadableBy(
        reader,
        photographId,
      );
      return photograph ? openStoredImage({ fileStore, logger }, photograph, variant) : null;
    },
  };
}

/**
 * Several Contributions and their photographs, in two reads however many there are. Shared with
 * the Editor's half (`contribution-review-service.ts`), so one is the same shape in the queue as
 * it is beside a Part.
 */
export async function contributionsWithPhotographs(
  contributionRepository: ContributionRepository,
  rows: ContributionWithAuthor[],
  readerId: string,
): Promise<Contribution[]> {
  const photographs = await contributionRepository.listPhotographs(rows.map((row) => row.id));
  return rows.map((row) =>
    toContribution(
      row,
      readerId,
      photographs.filter((photograph) => photograph.contributionId === row.id),
    ),
  );
}

function toContribution(
  row: ContributionWithAuthor,
  readerId: string,
  photographs: ContributionPhotographRow[],
): Contribution {
  return {
    id: row.id,
    target: targetOf(row),
    text: row.body,
    correction: row.correction,
    authorName: row.authorName,
    writtenAt: row.writtenAt.toISOString(),
    // Nothing discarded is ever read on anybody's behalf, so what is left is one of two.
    state: row.state === 'published' ? 'published' : 'waiting',
    mine: row.authorId === readerId,
    photographs: photographs.map(toPhotograph),
  };
}

function decided(): ConflictError {
  return new ConflictError(
    'This Contribution has been checked and can no longer be added to. Write a new one.',
  );
}

/** Addressed the way a Part's photograph is, at the address that asks who is reading. */
function toPhotograph(row: ContributionPhotographRow): Photograph {
  return {
    id: row.id,
    width: row.displayWidth,
    height: row.displayHeight,
    displayUrl: contributionPhotographImageUrl(row.id, 'display'),
    previewUrl: contributionPhotographImageUrl(row.id, 'preview'),
  };
}

function targetOf(row: { partId: string | null; positionId: string | null }): ContributionTarget {
  if (row.partId !== null) {
    return { kind: 'part', partId: row.partId };
  }
  if (row.positionId !== null) {
    return { kind: 'position', positionId: row.positionId };
  }
  // The table's own check constraint is what makes this unreachable.
  throw new Error('A Contribution with no target was read.');
}
