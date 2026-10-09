import type { LegalNotice } from '@ricambi/contracts';
import type { ReactNode } from 'react';
import { AsWritten, Mail, ReadingPage, Section, Unreadable } from '@/components/legal/reading';
import { useLegalNotice } from '@/lib/legal';

/**
 * Who is behind Ricambi (issue #9) — what German law calls an *Impressum*, under the name an
 * English page gives it.
 *
 * **Nothing on this page is written in this file.** Every fact on it is the association's and is
 * kept on the Club's screen, because the board changes at an annual meeting and that is not a
 * deployment — and because the association's name and address are exactly what this repository
 * must not contain.
 *
 * Outside the gate, like the privacy statement: it is addressed to whoever lands here, and most
 * of them are not members.
 */
export function LegalNoticePage() {
  const notice = useLegalNotice();

  if (notice.isPending) {
    return null;
  }

  if (notice.isError) {
    return <Unreadable>The legal notice could not be read just now.</Unreadable>;
  }

  return <Notice notice={notice.data.legalNotice} />;
}

function Notice({ notice }: { notice: LegalNotice }) {
  const registered = notice.registerCourt !== null || notice.registerNumber !== null;

  return (
    <ReadingPage title="Legal notice" lead="Who is behind Ricambi, and how to reach them.">
      {/*
        An association nobody has described yet has no legal notice, and the page says that
        rather than showing a row of empty headings — or, worse, a made-up address that looks
        finished. True of a practice system; never true of one real members use.
      */}
      {notice.name === null ? (
        <p className="mt-14 text-pretty text-text" data-testid="legal-notice-unwritten">
          The Club has not yet published its details here.
          {notice.email !== null && (
            <>
              {' '}
              Until it has, write to <Mail address={notice.email} />.
            </>
          )}
        </p>
      ) : (
        <>
          <Section title="Ricambi is run by">
            <address className="text-lg not-italic">
              <p className="font-semibold">{notice.name}</p>
              {notice.postalAddress !== null && (
                <p className="whitespace-pre-line">{notice.postalAddress}</p>
              )}
            </address>
            {notice.representedBy !== null && (
              <Fact label="Represented by">{notice.representedBy}</Fact>
            )}
          </Section>

          {(notice.email !== null || notice.phone !== null) && (
            <Section title="Contact">
              {notice.email !== null && (
                <Fact label="E-mail">
                  <Mail address={notice.email} />
                </Fact>
              )}
              {notice.phone !== null && <Fact label="Telephone">{notice.phone}</Fact>}
            </Section>
          )}

          {(registered || notice.vatId !== null) && (
            <Section title="Registration">
              {registered && (
                <Fact label="Register of associations">
                  {[notice.registerCourt, notice.registerNumber]
                    .filter((part) => part !== null)
                    .join(', ')}
                </Fact>
              )}
              {notice.vatId !== null && (
                <Fact label="VAT identification number">{notice.vatId}</Fact>
              )}
            </Section>
          )}

          {notice.further !== null && (
            <Section title="Further information">
              <AsWritten text={notice.further} />
            </Section>
          )}
        </>
      )}
    </ReadingPage>
  );
}

/** One thing the association states about itself, under the name of what it is. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 whitespace-pre-line">{children}</p>
    </div>
  );
}
