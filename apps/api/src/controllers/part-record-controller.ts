import type { PartInFull, PartRecordResponse } from '@ricambi/contracts';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { CURRENCIES, EQUIVALENT_KINDS, SOURCE_CONDITIONS } from '../db/schema.js';
import type { PartRecordService } from '../services/part-record-service.js';
import { blankToNull, required } from './fields.js';

/**
 * Recording what fits a Part, what replaces it, and where it has been available.
 *
 * **The three fixed sets are read from the schema**, which is also where the check constraints
 * that enforce them are written. A fifth kind of Equivalent accepted here and refused by the
 * database — or the other way about — would be an Editor losing an evening's typing to a 500,
 * so there is exactly one list of each and both ends read it.
 *
 * Everything else is the wire convention this API already has: plain strings, and blank meaning
 * "not recorded" rather than a value. The one exception is a price, which is refused rather than
 * accepted-and-emptied when its date is missing — see `part-record-service`.
 */

const partIdParams = z.object({ partId: z.uuid('That is not a Part id.') });
const fitmentIdParams = z.object({ fitmentId: z.uuid('That is not a Fitment id.') });
const equivalentIdParams = z.object({ equivalentId: z.uuid('That is not an Equivalent id.') });
const sourceIdParams = z.object({ sourceId: z.uuid('That is not a Source id.') });

/**
 * Reads `FitmentRequest` from `@ricambi/contracts`.
 *
 * **The qualifier is validated as text and nothing more**, which is the requirement rather than
 * an omission: *"from chassis #310"*, *"late"* and *"1963–64"* are all somebody's honest answer,
 * and a rule that made one of them fit a shape would throw the other two away (story 71).
 */
const fitmentBody = z.object({
  modelId: z.uuid('That is not a Model id.'),
  qualifier: blankToNull(),
});

const equivalentBody = z.object({
  kind: z.enum(EQUIVALENT_KINDS, {
    error: 'An equivalent is an OE supplier, an OEM, an industry standard or a donor vehicle.',
  }),
  maker: required('Name the supplier, manufacturer, standard or car this is an equivalent from.'),
  // Absent is ordinary, and for a Donor Vehicle it is the usual case: often nobody knows what the
  // other manufacturer called it, and the car alone is the useful fact.
  reference: blankToNull(),
  note: blankToNull(),
});

const sourceBody = z.object({
  name: required('A Source needs a name — whose listing this was.'),
  // A link a member follows, so it has to be one. "Ask in the forum" belongs in the note.
  url: z.url('That is not a link a member could follow. Put anything else in the note.'),
  // A form's empty option, which means the offer did not say what it was offering — a state the
  // archive prints plainly rather than guessing at (ADR 0001's habit, applied to a shop listing).
  condition: z
    .enum(SOURCE_CONDITIONS, { error: 'An offer is new old stock, used, or a reproduction.' })
    .or(z.literal(''))
    .nullish()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  /** What was typed. The service turns it into minor units, and refuses one without a date. */
  price: blankToNull(),
  currency: z.enum(CURRENCIES),
  observedOn: blankToNull(),
  note: blankToNull(),
});

export interface PartRecordController {
  addFitment: RequestHandler;
  correctFitment: RequestHandler;
  removeFitment: RequestHandler;
  addEquivalent: RequestHandler;
  correctEquivalent: RequestHandler;
  removeEquivalent: RequestHandler;
  addSource: RequestHandler;
  correctSource: RequestHandler;
  removeSource: RequestHandler;
}

export function createPartRecordController(dependencies: {
  partRecordService: PartRecordService;
}): PartRecordController {
  const { partRecordService } = dependencies;

  /**
   * Every one of these answers with the whole Part, re-read; only the status differs. Written
   * once rather than nine times, because nine copies of a response body is nine chances for one
   * of them to answer with something else.
   */
  const answering =
    (status: number, work: (request: Request) => Promise<PartInFull>): RequestHandler =>
    async (request, response) => {
      const body: PartRecordResponse = { part: await work(request) };
      response.status(status).json(body);
    };

  return {
    addFitment: answering(201, async (request) => {
      const { partId } = partIdParams.parse(request.params);
      return partRecordService.addFitment(partId, fitmentBody.parse(request.body));
    }),

    correctFitment: answering(200, async (request) => {
      const { fitmentId } = fitmentIdParams.parse(request.params);
      return partRecordService.correctFitment(fitmentId, fitmentBody.parse(request.body));
    }),

    removeFitment: answering(200, async (request) => {
      const { fitmentId } = fitmentIdParams.parse(request.params);
      return partRecordService.removeFitment(fitmentId);
    }),

    addEquivalent: answering(201, async (request) => {
      const { partId } = partIdParams.parse(request.params);
      return partRecordService.addEquivalent(partId, equivalentBody.parse(request.body));
    }),

    correctEquivalent: answering(200, async (request) => {
      const { equivalentId } = equivalentIdParams.parse(request.params);
      return partRecordService.correctEquivalent(equivalentId, equivalentBody.parse(request.body));
    }),

    removeEquivalent: answering(200, async (request) => {
      const { equivalentId } = equivalentIdParams.parse(request.params);
      return partRecordService.removeEquivalent(equivalentId);
    }),

    addSource: answering(201, async (request) => {
      const { partId } = partIdParams.parse(request.params);
      return partRecordService.addSource(partId, sourceBody.parse(request.body));
    }),

    correctSource: answering(200, async (request) => {
      const { sourceId } = sourceIdParams.parse(request.params);
      return partRecordService.correctSource(sourceId, sourceBody.parse(request.body));
    }),

    removeSource: answering(200, async (request) => {
      const { sourceId } = sourceIdParams.parse(request.params);
      return partRecordService.removeSource(sourceId);
    }),
  };
}
