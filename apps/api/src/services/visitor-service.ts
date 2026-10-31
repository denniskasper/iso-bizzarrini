import type { Landing, VisitorSample, VisitorSampleListed } from '@ricambi/contracts';
import { HttpError, NotFoundError, TooManyAttemptsError } from '../http/errors.js';
import { sampleDrawingUrl } from '../images/image-addresses.js';
import type { Clock } from '../platform/clock.js';
import type { EmailSender } from '../platform/email.js';
import type { Logger } from '../platform/logger.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { VisitorRepository, VisitorSampleRow } from '../repositories/visitor-repository.js';
import type { ClubService } from './club-service.js';

/**
 * **What a Visitor is shown** (issue #128, ADR 0019): the one read of the archive outside the
 * members-only gate, and the one way to ask to join (issue #131).
 *
 * **What this owns is which facts leave.** It builds its own shapes from the rows rather than
 * filtering what a member reads, so a field added to the member's Model, or to the Club's record,
 * never reaches a Visitor by default — the shape built here is the whole of what is sent.
 */
export interface VisitorService {
  /** Which Models the archive covers, how deep it goes for each, and what membership costs. */
  landing(): Promise<Landing>;
  /**
   * A Sample (issue #132): its drawing, every number on it, and the Parts at the one that is open.
   * Refused in the words of a Tavola that does not exist for any Tavola that is not a Sample.
   */
  sample(tavolaId: string): Promise<VisitorSample>;
  /**
   * One letter to the Club office, answered to the Visitor. `from` is the network address the
   * request came from, which is all the limit below counts by.
   */
  askToJoin(request: JoinRequest, from: string): Promise<void>;
}

/** A membership request as the controller has read it: trimmed, with blanks read as absent. */
export interface JoinRequest {
  name: string;
  email: string;
  cars: string | null;
  message: string | null;
}

/**
 * **How often one address may ask.** Enough for a person who sends, notices a typo and sends
 * again; too few for a script to make the office's inbox worthless.
 */
const REQUESTS_PER_WINDOW = 3;
const WINDOW_MS = 60 * 60 * 1000;

/** Refused because the letter would reach nobody. The landing has already said so. */
export class MembershipRequestsUnavailableError extends HttpError {
  constructor() {
    super(
      503,
      'membership_requests_unavailable',
      'Ricambi cannot send a membership request just now. Write to the Club office instead.',
    );
  }
}

/**
 * The letter did not get out. 502, as for an unsent invitation: what failed is somebody else's
 * service, and the Visitor can only try again or write to the office themselves.
 */
export class MembershipRequestNotSentError extends HttpError {
  constructor() {
    super(
      502,
      'membership_request_not_sent',
      'Your request could not be sent just now. Try again shortly, or write to the Club office.',
    );
  }
}

function toListedSample(row: VisitorSampleRow): VisitorSampleListed {
  return {
    tavola: {
      id: row.tavolaId,
      number: row.number,
      nameIt: row.nameIt,
      nameEn: row.nameEn,
      model: {
        brand: row.brand,
        name: row.modelName,
        series: row.series,
        modelYears: row.modelYears,
      },
    },
    drawing: {
      url: sampleDrawingUrl(row.drawingId),
      width: row.drawingWidth,
      height: row.drawingHeight,
    },
  };
}

export function createVisitorService(dependencies: {
  clock: Clock;
  modelRepository: ModelRepository;
  visitorRepository: VisitorRepository;
  clubService: ClubService;
  emailSender: EmailSender;
  logger: Logger;
}): VisitorService {
  const { clock, modelRepository, visitorRepository, clubService, emailSender, logger } =
    dependencies;

  /**
   * When each address last asked, within the window. **In memory and nowhere else**: Ricambi
   * keeps nothing of a request (issue #131), and an address is forgotten an hour after it asked.
   * A restart forgets them all, which costs a script one more burst.
   */
  const asked = new Map<string, number[]>();

  function admit(from: string): void {
    const now = clock.now().getTime();
    for (const [address, times] of asked) {
      const recent = times.filter((time) => now - time < WINDOW_MS);
      if (recent.length === 0) {
        asked.delete(address);
      } else {
        asked.set(address, recent);
      }
    }

    const recent = asked.get(from) ?? [];
    if (recent.length >= REQUESTS_PER_WINDOW) {
      throw new TooManyAttemptsError(
        'Too many requests from here. Wait an hour and try again, or write to the Club office.',
      );
    }
    asked.set(from, [...recent, now]);
  }

  /**
   * Where a letter would go. Only a transport that reaches somebody may carry one: a practice
   * system's log would keep a stranger's message in a file, and the office would never read it.
   */
  function officeToWriteTo(officeEmail: string | null): string | null {
    return emailSender.reachesRealPeople ? officeEmail : null;
  }

  return {
    async landing() {
      const [covered, samples, club] = await Promise.all([
        modelRepository.listCovered(),
        visitorRepository.listSamples(),
        clubService.read(),
      ]);

      return {
        models: covered.map((model) => ({
          brand: model.brand,
          name: model.name,
          series: model.series,
          modelYears: model.modelYears,
          publishedTavole: model.publishedTavole,
        })),
        samples: samples.map(toListedSample),
        fee: club.fee,
        currency: club.currency,
        officeEmail: club.officeEmail,
        requestForm: officeToWriteTo(club.officeEmail) !== null,
      };
    },

    async sample(tavolaId) {
      const row = await visitorRepository.findSample(tavolaId);
      if (!row) {
        throw new NotFoundError('No such Sample.');
      }
      const [positions, listings] = await Promise.all([
        visitorRepository.listPositions(tavolaId),
        visitorRepository.listListings(row.openPositionId),
      ]);

      return {
        ...toListedSample(row),
        positions: positions.map((position) => ({
          number: position.number,
          marks: position.marks,
          open: position.id === row.openPositionId,
        })),
        open: { number: row.openNumber, listings },
      };
    },

    async askToJoin(request, from) {
      const office = officeToWriteTo((await clubService.read()).officeEmail);
      if (office === null) {
        throw new MembershipRequestsUnavailableError();
      }
      admit(from);

      const letter = {
        to: office,
        replyTo: request.email,
        // Nothing of the Visitor in the subject: a refused letter names its subject in the log.
        subject: 'A request for membership, through Ricambi',
        text: [
          `${request.name} asks the Club for membership, through Ricambi.`,
          '',
          `Name: ${request.name}`,
          `E-mail: ${request.email}`,
          `Car(s): ${request.cars ?? 'not given'}`,
          '',
          request.message ?? 'No message.',
          '',
          'Answering this e-mail writes to them. Ricambi has kept nothing of the request:',
          'if the Club accepts, an Administrator adds them to the roster, which invites them.',
        ].join('\n'),
      };

      try {
        await emailSender.send(letter);
      } catch (error) {
        // The error says which operation failed and not to whom: nothing of the Visitor is logged.
        logger.error({ err: error }, 'Could not send a membership request to the Club office');
        throw new MembershipRequestNotSentError();
      }
    },
  };
}
