import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { MarkingBar } from '@/components/editor/marking-bar';
import { ScanUpload } from '@/components/editor/scan-upload';
import { PositionList } from '@/components/positions/position-list';
import { PositionPanel } from '@/components/positions/position-panel';
import { Button } from '@/components/ui/button';
import { DrawingViewer } from '@/components/viewer/drawing-viewer';
import { MarkLayer } from '@/components/viewer/mark-layer';
import { api, type CatalogProvenance, type Position } from '@/lib/api';
import { useMarkingTool } from '@/lib/marking';

/**
 * One drawing, as large as the screen will allow, with the numbered circles on it.
 *
 * This is the surface the whole product is for, and it stays almost empty: the sheet, what it is
 * called, and what the factory printed at the top of it. Everything about a Position is *below*
 * the drawing rather than over it — which is also where the Part goes at ticket 06, so that
 * reading one never means losing sight of the other.
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

      {/* The drawing, and nothing beside it. It gets the full measure of the page. */}
      <DrawingViewer
        scan={tavola.scan}
        alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
        className="mt-10"
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

      {tool.on && (
        <div className="mt-8">
          <MarkingBar
            tool={tool}
            positions={positions}
            selected={selected}
            onDeselect={() => setSelectedId(null)}
          />
        </div>
      )}

      <div className="mt-12 border-t border-line pt-10">
        <PositionPanel position={selectedPosition} />
      </div>

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
