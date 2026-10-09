import type {
  LegalNotice,
  NameProcessorRequest,
  PrivacyResponse,
  ProcessorRecord,
  ProcessorRole,
  RetentionTerms,
} from '@ricambi/contracts';
import { PROCESSOR_ROLES, type ProcessorRow } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import type { ProcessorRepository } from '../repositories/processor-repository.js';
import type { ClubService } from './club-service.js';
import { readDay } from './days.js';

/**
 * The platform's own legal pages (issue #9): who is behind it, what it does with what it knows
 * about people, and who else handles that for the association.
 *
 * **What this owns is which facts the public is shown.** The association's identity lives on the
 * Club's record, which an Administrator keeps and which also carries the bank details; a
 * processor's row also says whether its agreement is signed. So "read the record and send it" is
 * not an answer for either page, and the two shapes built here are the whole of what leaves.
 *
 * The sentences themselves are not here. They describe what the software does and are written
 * where it is shown; what is served is everything in them that is a fact about the association
 * or the running system, so those can change without a deployment and cannot be mistyped into a
 * page.
 */
export interface LegalService {
  /** Who the association is. Open to anybody, and null wherever nobody has written it. */
  legalNotice(): Promise<LegalNotice>;
  /** The facts the privacy statement quotes. Open to anybody. */
  privacy(): Promise<PrivacyResponse>;
  /** The association's own record of its processors, agreements included. */
  processors(): Promise<ProcessorRecord[]>;
  /** Names who does this for the association, replacing whoever did before. */
  nameProcessor(role: ProcessorRole, fields: NameProcessorRequest): Promise<ProcessorRecord>;
  removeProcessor(role: ProcessorRole): Promise<void>;
}

export function createLegalService(dependencies: {
  retention: RetentionTerms;
  clock: Clock;
  clubService: ClubService;
  processorRepository: ProcessorRepository;
}): LegalService {
  const { retention, clock, clubService, processorRepository } = dependencies;

  /**
   * In the order of `PROCESSOR_ROLES` and not the order of the table, so the statement reads the
   * same way every time it is opened: where the data sits first, then where it travels.
   */
  async function processors(): Promise<ProcessorRecord[]> {
    const rows = await processorRepository.list();
    return rows
      .toSorted((a, b) => PROCESSOR_ROLES.indexOf(a.role) - PROCESSOR_ROLES.indexOf(b.role))
      .map(toProcessorRecord);
  }

  return {
    processors,

    async legalNotice() {
      const club = await clubService.read();

      return {
        name: club.legalName,
        postalAddress: club.postalAddress,
        representedBy: club.representedBy,
        registerCourt: club.registerCourt,
        registerNumber: club.registerNumber,
        vatId: club.vatId,
        email: club.officeEmail,
        phone: club.phone,
        further: club.legalNoticeFurther,
      };
    },

    async privacy() {
      const [club, named] = await Promise.all([clubService.read(), processors()]);

      return {
        retention,
        controller: {
          name: club.legalName,
          postalAddress: club.postalAddress,
          email: club.officeEmail,
        },
        dataProtectionContact: {
          name: club.dataProtectionContact,
          email: club.dataProtectionEmail,
        },
        supervisoryAuthority: club.supervisoryAuthority,
        processors: named.map(({ role, name, location }) => ({ role, name, location })),
        further: club.privacyFurther,
      };
    },

    async nameProcessor(role, fields) {
      const signedOn = fields.agreementSignedOn?.trim();

      return toProcessorRecord(
        await processorRepository.save({
          role,
          name: fields.name,
          location: fields.location,
          agreementSignedOn: signedOn ? readDay(signedOn, 'a date the agreement was signed') : null,
          updatedAt: clock.now(),
        }),
      );
    },

    removeProcessor(role) {
      return processorRepository.remove(role);
    },
  };
}

function toProcessorRecord(row: ProcessorRow): ProcessorRecord {
  return {
    role: row.role,
    name: row.name,
    location: row.location,
    agreementSignedOn: row.agreementSignedOn,
  };
}
