import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { MachineTranslationTag } from '@/components/machine-translation';
import { SearchField } from '@/components/search/search-field';
import { Refusal } from '@/components/ui/field';
import { api, type Equivalent, type SearchListing, type SearchMatch } from '@/lib/api';

/**
 * **Searching — the way into the archive that does not start at the car.**
 *
 * Every other screen here begins with a Model: choose your car, open the drawing, click the
 * number. Half the time a restorer begins holding a bracket with something stamped on it and no
 * idea which car it came off, and this is that half.
 *
 * The results are set as a **printed parts index**, which is not decoration but the thing being
 * done: the factory prints its number in the first column and the description beside it, and a
 * member comparing a stamping against a screen is reading down that column. So the number leads,
 * in the mono face every identifier in this archive wears, and the names follow.
 *
 * What a member does next is the whole point of the screen, so it is the plainest thing on it:
 * every place the Part is listed is a link that opens that drawing at that circle.
 */
export function SearchPage() {
  const { q } = useSearch({ from: '/search' });
  const asked = q ?? '';

  const found = useQuery({
    queryKey: ['search', asked],
    queryFn: () => api.search(asked),
    enabled: asked !== '',
  });

  return (
    <div className="animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">Search</h1>
      <p className="mt-6 max-w-measure text-lg text-pretty text-muted">
        Start from the part rather than the car — a number stamped on it, a number quoted in a
        letter, or the number on the modern part that replaces it.
      </p>

      <div className="mt-12 max-w-measure">
        {/* Keyed on what is being searched for, so following a link back into a previous search
            puts that query in the box rather than leaving the last one there. */}
        <SearchField key={asked} query={asked} autoFocus={asked === ''} />
      </div>

      <div className="mt-14" aria-live="polite">
        {asked === '' && <WhatIsSearched />}
        {found.isPending && asked !== '' && <p className="text-lg text-muted">Searching…</p>}
        {found.isError && (
          <Refusal>The archive could not be searched. {found.error.message}</Refusal>
        )}
        {found.isSuccess && (
          <Results asked={asked} matches={found.data.matches} more={found.data.more} />
        )}
      </div>
    </div>
  );
}

/**
 * What the archive will and will not look at — said **before** anything is typed rather than
 * after nothing was found.
 *
 * The limits are real and narrow, and a member who does not know them reads an empty answer as
 * "the archive has not got it". Nothing searches the prose: a Note is what the club has worked
 * out and a Catalog Note is the factory's own words, and matching a word inside either would be
 * the free-text search this archive deliberately does not have.
 *
 * Set as quiet prose under the field and not in a panel. Nothing is empty here — the member has
 * simply not typed yet — and a ruled box would make the one thing on the screen that is not the
 * field into the largest thing on it.
 */
function WhatIsSearched() {
  return (
    <div className="max-w-measure">
      <h2 className="label">What is searched</h2>
      <ul className="mt-4 space-y-3 text-pretty text-muted">
        <li>
          The <strong className="font-semibold text-text">Catalog Number</strong> and the{' '}
          <strong className="font-semibold text-text">Disegno Origine</strong>, from the beginning
          and however they are spaced — <span className="tabular">260 03 150</span> is found by
          typing <span className="tabular">26003150</span>.
        </li>
        <li>
          An <strong className="font-semibold text-text">Equivalent’s reference</strong> — an
          original supplier’s number, another manufacturer’s, or an industry standard. This is the
          question backwards: what does the bearing marked <span className="tabular">6205</span>{' '}
          replace?
        </li>
        <li>
          The beginning of the <strong className="font-semibold text-text">name</strong>, in English
          or in Italian.
        </li>
      </ul>
      <p className="mt-6 text-sm text-pretty text-faint">
        Notes, catalog notes and descriptions are not searched.
      </p>
    </div>
  );
}

function Results({
  asked,
  matches,
  more,
}: {
  asked: string;
  matches: SearchMatch[];
  more: boolean;
}) {
  if (matches.length === 0) {
    return (
      <div data-testid="search-results">
        <p className="max-w-measure text-lg text-pretty text-muted">
          Nothing in the archive matches <span className="tabular">{asked}</span>.
        </p>
        <p className="mt-3 max-w-measure text-pretty text-faint">
          Numbers and names are matched from their beginning, so try less of one rather than more.
          Notes and descriptions are not searched.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="search-results">
      <div className="flex items-baseline gap-4">
        <h2 className="label">{matches.length === 1 ? 'One part' : `${matches.length} parts`}</h2>
        <span className="h-px flex-1 bg-line" />
      </div>

      <ul className="border-b border-line">
        {matches.map((match) => (
          <Found key={match.part.id} match={match} />
        ))}
      </ul>

      {/* A capped list must never read as a complete one: a member told "nothing else matches"
          goes looking somewhere else for a part this archive has. */}
      {more && (
        <p className="mt-6 max-w-measure text-sm text-pretty text-faint">
          More matched than are shown. Type more of the number, or more of the name.
        </p>
      )}
    </div>
  );
}

/**
 * One entry of the index.
 *
 * The number sits in a column of its own on a wide screen, exactly where the factory prints it,
 * so a member reading down the list is comparing a column of numbers against the one in their
 * hand. A Part with **no** Catalog Number says so in words rather than showing a blank or an
 * invented placeholder — "this part has no factory number" is a legitimate answer, and a gap
 * would send somebody hunting for a number that does not exist (story 58).
 */
function Found({ match }: { match: SearchMatch }) {
  const { part, matchedEquivalents, listings } = match;

  return (
    <li className="grid gap-x-8 gap-y-4 border-t border-line py-6 sm:grid-cols-[11rem_1fr]">
      <div data-testid="found-number">
        {part.catalogNumber === null ? (
          <p className="text-sm text-faint">No factory number</p>
        ) : (
          <p className="tabular text-lg">{part.catalogNumber}</p>
        )}
        {part.disegnoOrigine !== null && (
          <p className="mt-1 text-xs text-faint">
            Disegno <span className="tabular">{part.disegnoOrigine}</span>
          </p>
        )}
      </div>

      <div>
        <p className="max-w-measure text-xl text-pretty">
          {part.nameEn ?? part.nameIt}
          {part.nameEnMachineTranslated && (
            <>
              {' '}
              <MachineTranslationTag />
            </>
          )}
        </p>
        {/* Both names when there are both, because a member matching a screen against an Italian
            factory document is reading the Italian one (story 55). */}
        {part.nameEn !== null && part.nameIt !== null && (
          <p className="mt-1 max-w-measure text-sm text-pretty text-muted">{part.nameIt}</p>
        )}

        {matchedEquivalents.length > 0 && <WhyItMatched equivalents={matchedEquivalents} />}

        <WhereItIs listings={listings} />
      </div>
    </li>
  );
}

/**
 * **Why this Part is on the screen**, for the one case where the answer is not on the Part.
 *
 * A member typed a number moulded into a modern bearing and got back a name they have never
 * heard. Without the reference that matched, they have nothing to hold the bearing up against —
 * so the supplier and their number are printed, in the face every identifier here wears.
 */
function WhyItMatched({ equivalents }: { equivalents: Equivalent[] }) {
  return (
    <p className="mt-3 max-w-measure text-sm text-pretty text-muted" data-testid="matched-because">
      Replaced by{' '}
      {equivalents.map((equivalent, index) => (
        <span key={equivalent.id}>
          {index > 0 && ', '}
          {equivalent.maker}
          {equivalent.reference !== null && (
            <>
              {' '}
              <span className="tabular">{equivalent.reference}</span>
            </>
          )}
        </span>
      ))}
    </p>
  );
}

/**
 * **Where to go and look at it**, which is what the whole result is for.
 *
 * One link per place the Part is listed rather than one per sheet: a washer at three numbers on
 * one drawing is three circles, and the member wants the one that is theirs. Each is a full-height
 * target because the hand pressing it is cold, and each names the car first, since in a list
 * reached from a number rather than from a garage that is the first thing to read (story 82).
 */
function WhereItIs({ listings }: { listings: SearchListing[] }) {
  if (listings.length === 0) {
    return (
      <p className="mt-4 text-sm text-faint">
        Recorded, but listed on no drawing — so there is nothing to open yet.
      </p>
    );
  }

  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Link
            to="/tavole/$tavolaId"
            params={{ tavolaId: listing.tavolaId }}
            search={listing.positionNumber === null ? {} : { position: listing.positionNumber }}
            data-testid="search-result-link"
            // The whole sentence for anyone who is not reading the layout: a chip of three
            // fragments is legible on a screen and is three unrelated words read aloud.
            aria-label={whereItLeads(listing)}
            className="flex h-control items-center gap-3 rounded-md border border-line-strong bg-surface-raised px-4 text-sm transition-colors duration-150 ease-[var(--ease-out-quick)] hover:bg-surface-sunken"
          >
            <span>
              {listing.model.brand} {listing.model.name}
            </span>
            <span className="tabular text-muted">Tavola {listing.tavolaNumber}</span>
            {/* The number is spelled out rather than left bare: on a drawing a number needs no
                introduction, but in a chip beside two others it is one integer among three. */}
            {listing.positionNumber !== null && (
              <span className="text-accent-ink">
                position <span className="tabular">{listing.positionNumber}</span>
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Where one of those links goes, said as a sentence rather than as a row of fragments. */
function whereItLeads(listing: SearchListing): string {
  // A Machine translation is never shown without the Italian, and never passes for anyone's word.
  const name = listing.nameEnMachineTranslated
    ? `${listing.nameEn} (${listing.nameIt}, machine translation)`
    : listing.nameEn;
  const sheet = `${listing.model.brand} ${listing.model.name}, Tavola ${listing.tavolaNumber} — ${name}`;
  return listing.positionNumber === null
    ? sheet
    : `${sheet}, at position ${listing.positionNumber}`;
}
