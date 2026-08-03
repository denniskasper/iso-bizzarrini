import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { ListingPanel } from '@/components/editor/listing-panel';
import { MarkingBar } from '@/components/editor/marking-bar';
import { ScanUpload } from '@/components/editor/scan-upload';
import { PartReading } from '@/components/parts/part-reading';
import { PositionList } from '@/components/positions/position-list';
import { Button } from '@/components/ui/button';
import { DrawingViewer } from '@/components/viewer/drawing-viewer';
import { MarkLayer } from '@/components/viewer/mark-layer';
import { api, type CatalogProvenance, type Position } from '@/lib/api';
import { useMarkingTool } from '@/lib/marking';

/**
 * One drawing, with the numbered circles on it and the Part beside it.
 *
 * **This is the surface the whole product is for**, and the sentence it completes is *choose
 * your car, open the drawing, click the position, read the part.* The last clause of that is
 * why the page is arranged in two columns: what a member reads sits **beside** the sheet and
 * never over or instead of it (story 44), so following a circle to the catalog number
 * beside it never means losing sight of the drawing it came from.
 *
 * Nothing else competes. What the factory printed at the head of the sheet, and everything an
 * Editor does to it, is below the fold of the two columns.
 */
export function TavolaPage() {
  const { tavolaId } = useParams({ from: '/tavole/$tavolaId' });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['tavola', tavolaId],
    queryFn: () => api.tavola(tavolaId),
  });

  /**
   * What is being read: a Position, and which of its circles was pointed at.
   *
   * Held as an id rather than as the Position itself, because the sheet is replaced wholesale
   * every time anything is marked — a copy kept here would be the one that went stale.
   */
  const [selectedId, setSelectedId] = useState<{ position: string; mark: string | null } | null>(
    null,
  );
  const tool = useMarkingTool(tavolaId);

  const positions = useMemo(() => data?.positions ?? [], [data?.positions]);
  const selectedPosition =
    positions.find((position) => position.id === selectedId?.position) ?? null;
  const selected = selectedPosition
    ? { position: selectedPosition, markId: selectedId?.mark ?? null }
    : null;

  const select = useCallback((position: Position, markId: string | null) => {
    setSelectedId({ position: position.id, mark: markId });
  }, []);

  const selectMark = useCallback(
    (position: Position, mark: { id: string }) => select(position, mark.id),
    [select],
  );

  if (isPending) {
    return <p className="text-lg text-muted">Reading the drawing…</p>;
  }

  if (isError) {
    return (
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold">That drawing is not in the archive.</h1>
        <p className="mt-6 max-w-measure text-pretty text-muted">{error.message}</p>
        <Link to="/" className="mt-8 inline-block text-accent-ink underline underline-offset-4">
          Back to the catalog
        </Link>
      </div>
    );
  }

  const { tavola } = data;

  return (
    <div className="animate-rise">
      <Link
        to="/models/$modelId"
        params={{ modelId: tavola.model.id }}
        className="text-2xs text-faint uppercase hover:text-muted"
      >
        {tavola.model.brand} {tavola.model.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="tabular text-3xl text-muted sm:text-4xl">{tavola.number}</span>
        <h1 className="text-3xl font-semibold text-balance sm:text-4xl">{tavola.nameIt}</h1>
      </div>
      <p className="mt-2 text-lg text-muted">
        {tavola.nameEn}
        <span className="ml-4 text-2xs text-faint uppercase">{tavola.category.name}</span>
      </p>

      {/*
       * **The drawing and the Part it points at, side by side** — which is the whole of story 44
       * and the reason this is a grid rather than one column. The sheet keeps the larger share
       * because it is what the member came for; the reading takes a fixed measure beside it and
       * scrolls inside itself, so a long Part never pushes the drawing off the screen.
       *
       * Below `lg` there is no beside, and pretending otherwise on a phone would give a drawing
       * too small to read a number off and a column too narrow to read a sentence in. The
       * reading is simply the next thing down, which is where a hand scrolls to anyway.
       */}
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DrawingViewer
          scan={tavola.scan}
          alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
          overlay={
            <MarkLayer
              positions={positions}
              selectedPositionId={selectedPosition?.id ?? null}
              onSelect={selectMark}
              onMove={tool.on ? tool.moveMark : undefined}
            />
          }
          // The sheet only becomes a tool when an Editor says so. A member's drawing is a
          // drawing, and a stray tap on it records nothing.
          onTapPoint={tool.on ? tool.place : undefined}
        />

        <PartReading
          position={selectedPosition}
          tavola={{ number: tavola.number, nameEn: tavola.nameEn, model: tavola.model }}
        />
      </div>

      {tool.on && (
        <div className="mt-12">
          <MarkingBar
            tool={tool}
            positions={positions}
            selected={selected}
            onDeselect={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Reading is beside the drawing; recording is a panel an Editor opened, under it. There
          is nothing to record until a number has been chosen. */}
      {selectedPosition && (
        <div className="mt-12">
          <ListingPanel tavolaId={tavola.id} position={selectedPosition} />
        </div>
      )}

      <div className="mt-12">
        <PositionList
          positions={positions}
          selectedPositionId={selectedPosition?.id ?? null}
          onSelect={(position) => select(position, null)}
          // A drawing nobody has scanned is not a drawing anybody can click, so the tool that
          // works by clicking it is not offered.
          action={
            tavola.scan && !tool.on ? (
              <Button variant="outline" onClick={() => tool.start(positions.at(-1)?.number)}>
                Mark positions
              </Button>
            ) : null
          }
        />
      </div>

      <div className="mt-16 grid gap-12 sm:grid-cols-2">
        <Provenance provenance={tavola.provenance} />
        <ScanUpload tavolaId={tavola.id} hasScan={tavola.scan !== null} />
      </div>
    </div>
  );
}

/**
 * What the factory printed at the head of the sheet, in the factory's own words.
 *
 * **Evidence, and nothing navigates by it.** It is here so a member can match this screen
 * against a paper catalog, which is why the labels are the Italian words as printed rather than
 * translations of them, and why nothing here is a link. The Category above is what navigation
 * uses.
 */
function Provenance({ provenance }: { provenance: CatalogProvenance }) {
  const entries: [string, string | null][] = [
    ['Sezione', provenance.section],
    ['Gruppo', provenance.group],
    ['Sottogruppo', provenance.subgroup],
  ];

  const recorded = entries.filter(([, value]) => value !== null);

  return (
    <section aria-labelledby="provenance">
      <h2 id="provenance" className="text-2xs text-muted uppercase">
        On the sheet
      </h2>

      {recorded.length === 0 ? (
        <p className="mt-4 max-w-measure text-pretty text-faint">
          The factory's own classification has not been transcribed for this Tavola.
        </p>
      ) : (
        <dl className="mt-4 border-t border-line">
          {recorded.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-6 border-b border-line py-3"
            >
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="tabular text-base">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 max-w-measure text-xs text-pretty text-faint">
        Recorded as the factory wrote it, so this screen can be matched against a paper catalog.
      </p>
    </section>
  );
}
