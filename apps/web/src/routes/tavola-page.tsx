import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BelongsWithPanel } from '@/components/editor/belongs-with-panel';
import { ListingPanel } from '@/components/editor/listing-panel';
import { MarkingBar } from '@/components/editor/marking-bar';
import { ScanUpload } from '@/components/editor/scan-upload';
import { PartReading } from '@/components/parts/part-reading';
import { TavolaParts } from '@/components/parts/tavola-parts';
import { BelongsWith } from '@/components/positions/belongs-with';
import { PositionJump } from '@/components/positions/position-jump';
import { PositionList } from '@/components/positions/position-list';
import { WhatIsLeft } from '@/components/progress/what-is-left';
import { Button } from '@/components/ui/button';
import { DrawingViewer, type DrawingView } from '@/components/viewer/drawing-viewer';
import { MarkLayer } from '@/components/viewer/mark-layer';
import { api, type CatalogProvenance, type Mark, type Position } from '@/lib/api';
import { useMarkingTool } from '@/lib/marking';
import { markAfter, markOn, positionMatching, positionsIn } from '@/lib/positions';
import { useSheetProgress } from '@/lib/progress';

/**
 * One drawing, with the numbered circles on it and the Part beside it.
 *
 * **This is the surface the whole product is for**, and the sentence it completes is *choose
 * your car, open the drawing, click the position, read the part.* The last clause of that is
 * why the page is arranged in two columns: what a member reads sits **beside** the sheet and
 * never over or instead of it (story 44), so following a circle to the catalog number
 * beside it never means losing sight of the drawing it came from.
 *
 * **And the sentence reads backwards as well.** The right-hand column is the facing page of a
 * factory catalog — a number to type, the Part being read, then the sheet's own numbered index —
 * so a member who knows what something is called works down the text and is taken to its circle
 * (stories 46–48), exactly as a member who can see the circle is taken to the text.
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
   * **What is being read lives in the address**, and that is the whole of story 52: the link a
   * member sends is the screen they are looking at, with no button needed to mint one.
   *
   * It is the number the factory printed rather than an id — legible in a forum post, and
   * resolved by the same forgiving rule that finds a number somebody types, so `?position=210`
   * opens `210 S`. Replacing rather than pushing, because a member walking a sheet's numbers is
   * reading one screen and should not have to press Back nine times to leave it.
   */
  const { position: linked } = useSearch({ from: '/tavole/$tavolaId' });
  const navigate = useNavigate({ from: '/tavole/$tavolaId' });

  /**
   * Which of a number's circles is being read. Held here rather than in the address because it
   * is where the member has got to in a Position, not what they are looking at — a link to the
   * third circle of `2` and a link to `2` are the same link.
   */
  const [reading, setReading] = useState<{ positionId: string; markId: string } | null>(null);
  /**
   * The Sub-assembly a member has asked to see on the drawing, if any. Held here because it is
   * the *drawing* that answers — the panel asks, and the circles are what light up.
   */
  const [askedToShow, setAskedToShow] = useState<string | null>(null);
  /**
   * And the sheet an Editor has asked to see the gaps on, if any. The same mechanism as above,
   * asked by a different panel — which is why the two are held apart and settled below rather
   * than being one flag.
   *
   * **The Tavola and not a boolean**, for the same reason the Sub-assembly above is an id: this
   * component is not remounted when a member walks from one drawing to the next, so a flag would
   * follow them onto a sheet they never asked anything about.
   */
  const [gapsAskedFor, setGapsAskedFor] = useState<string | null>(null);
  const view = useRef<DrawingView>(null);
  const tool = useMarkingTool(tavolaId);

  const positions = useMemo(() => data?.positions ?? [], [data?.positions]);
  const sheet = useMemo(
    () => ({ positions, subAssemblies: data?.subAssemblies ?? [] }),
    [positions, data?.subAssemblies],
  );
  const selectedPosition = useMemo(
    () => (linked === undefined ? null : positionMatching(positions, linked)),
    [positions, linked],
  );
  const selectedMark = selectedPosition
    ? markOn(selectedPosition, reading?.positionId === selectedPosition.id ? reading.markId : null)
    : null;
  const selected = selectedPosition
    ? { position: selectedPosition, markId: selectedMark?.id ?? null }
    : null;

  /**
   * The circles a shown Sub-assembly holds — **derived rather than remembered**, so that reading
   * a number outside it simply stops showing it. A member who follows a related number out of one
   * has moved on; a drawing still dimmed around a Sub-assembly they are no longer in would be the
   * screen answering a question they stopped asking, and there is no effect to forget to run.
   */
  const shownSubAssembly =
    askedToShow !== null && selectedPosition?.subAssemblyId === askedToShow ? askedToShow : null;

  /**
   * How much of this sheet has been done — **read once, here, because two things need it**: the
   * panel that prints it and the drawing that lights the gaps. It costs no request of its own,
   * being derived from the sheet above and the index the column beside the drawing has already
   * asked for.
   */
  const progress = useSheetProgress(tavolaId, positions);

  /**
   * Whether the drawing is actually lighting the gaps — **derived rather than remembered**, the
   * same way a shown Sub-assembly is, and for a sharper reason than symmetry.
   *
   * The switch lives in the block that lists the gaps, so recording a Part at the last one takes
   * it off the screen. A remembered flag would still be set, every circle on the sheet would go
   * on receding, and the only control that could undo it would be the one that had just gone.
   * There is nothing here to leave behind: no gaps, no question being asked.
   */
  const showingGaps = gapsAskedFor === tavolaId && (progress.tally?.unlisted.length ?? 0) > 0;

  /**
   * **The drawing answers one question at a time.** A Sub-assembly and the numbers with nothing
   * recorded at them use the same mechanism — what was not asked about recedes — so lighting both
   * at once would leave a member with a drawing full of bright circles meaning two different
   * things. Asking either turns the other off, and this is where that is settled rather than in
   * the two panels that ask.
   */
  const lit = useMemo(() => {
    if (showingGaps) {
      return new Set((progress.tally?.unlisted ?? []).map((position) => position.id));
    }
    return shownSubAssembly === null
      ? null
      : new Set(positionsIn(sheet, shownSubAssembly).map((position) => position.id));
  }, [sheet, shownSubAssembly, showingGaps, progress.tally]);

  const showSubAssembly = useCallback((subAssemblyId: string | null) => {
    setGapsAskedFor(null);
    setAskedToShow(subAssemblyId);
  }, []);

  const showGaps = useCallback(
    (showing: boolean) => {
      setAskedToShow(null);
      setGapsAskedFor(showing ? tavolaId : null);
    },
    [tavolaId],
  );

  const open = useCallback(
    (position: Position | null) => {
      void navigate({
        to: '/tavole/$tavolaId',
        params: { tavolaId },
        search: position ? { position: position.number } : {},
        replace: true,
      });
    },
    [navigate, tavolaId],
  );

  /**
   * **The address says the number that is actually being read**, even when it was asked for by
   * a prefix.
   *
   * `?position=210` opens `210 S` — that is the same forgiving rule that finds a number somebody
   * types, and it is what makes a link retyped from a stamped bracket work. But a member who then
   * copies the address must not hand somebody else a number that is on no sheet, and an address
   * bar reading `210` beside a panel reading `210 S` is the screen disagreeing with itself. So
   * the link is corrected to what it opened, once, and every link shared from here is exact.
   */
  useEffect(() => {
    if (selectedPosition && selectedPosition.number !== linked) {
      open(selectedPosition);
    }
  }, [selectedPosition, linked, open]);

  /** A circle pointed at on the sheet: this Position, read at this circle, and nothing moves. */
  const readMark = useCallback(
    (position: Position, mark: Mark) => {
      setReading({ positionId: position.id, markId: mark.id });
      open(position);
    },
    [open],
  );

  /**
   * A number reached from the text — the index beside the drawing, or the field above it.
   *
   * Two things it does that pointing at a circle does not. It **takes the drawing there**, which
   * is story 47 and the reason the viewer has an imperative handle at all; and selecting the same
   * number again **moves on to the next place it is printed** (story 48), which is how a member
   * finds out that the part is fitted in more than one place. A number with no circle simply
   * opens: there is nowhere on the sheet to be taken to, and that is what the panel says.
   */
  const goTo = useCallback(
    (position: Position) => {
      const next =
        position.id === selectedPosition?.id
          ? markAfter(position.marks, selectedMark?.id ?? null)
          : (position.marks[0] ?? null);

      setReading(next ? { positionId: position.id, markId: next.id } : null);
      open(position);
      if (next) {
        view.current?.show(next);
      }
    },
    [open, selectedPosition?.id, selectedMark?.id],
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
       * **The drawing and the text of the sheet, side by side** — which is the whole of story 44
       * and the reason this is a grid rather than one column. The sheet keeps the larger share
       * because it is what the member came for; the column beside it is the catalog's facing
       * page, in the order a hand uses it: the number you already know, then the part you are
       * reading, then the whole sheet to work down when you know neither.
       *
       * Below `lg` there is no beside, and pretending otherwise on a phone would give a drawing
       * too small to read a number off and a column too narrow to read a sentence in. The
       * reading is simply the next thing down, which is where a hand scrolls to anyway.
       */}
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DrawingViewer
          ref={view}
          scan={tavola.scan}
          alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
          overlay={
            <MarkLayer
              positions={positions}
              selectedPositionId={selectedPosition?.id ?? null}
              selectedMarkId={selectedMark?.id ?? null}
              lit={lit}
              onSelect={readMark}
              onMove={tool.on ? tool.moveMark : undefined}
            />
          }
          // The sheet only becomes a tool when an Editor says so. A member's drawing is a
          // drawing, and a stray tap on it records nothing.
          onTapPoint={tool.on ? tool.place : undefined}
        />

        <div className="flex flex-col gap-10">
          {positions.length > 0 && <PositionJump positions={positions} onJump={goTo} />}

          <PartReading
            position={selectedPosition}
            markId={selectedMark?.id ?? null}
            // What the address asked for when it named nothing this sheet has — a link meant for
            // another drawing, or a number typed from a bracket that is not on this one. Saying
            // so beats the neutral invitation to click a circle, which reads as if nothing had
            // been asked for at all.
            unknownNumber={selectedPosition === null ? (linked ?? null) : null}
            tavola={{ number: tavola.number, nameEn: tavola.nameEn, model: tavola.model }}
            belongsWith={
              selectedPosition && (
                <BelongsWith
                  sheet={sheet}
                  position={selectedPosition}
                  showingSubAssembly={shownSubAssembly !== null}
                  onShowSubAssembly={showSubAssembly}
                  // A number in the same Sub-assembly, or one it works with, is reached the way
                  // every other number in the text is: read it, and take the drawing to it.
                  onSelect={goTo}
                />
              )
            }
          />

          <TavolaParts
            tavolaId={tavola.id}
            positions={positions}
            selectedPositionId={selectedPosition?.id ?? null}
            onSelect={goTo}
          />

          {/* Last on the facing page, and beside the drawing rather than below it: the numbers
              it names are numbers to go and work on, and the switch that lights them up has to
              be where a hand can see what it did. */}
          <WhatIsLeft
            progress={progress}
            selectedPositionId={selectedPosition?.id ?? null}
            showingGaps={showingGaps}
            onShowGaps={showGaps}
            onSelect={goTo}
          />
        </div>
      </div>

      {tool.on && (
        <div className="mt-12">
          <MarkingBar
            tool={tool}
            positions={positions}
            selected={selected}
            onDeselect={() => open(null)}
          />
        </div>
      )}

      {/* Reading is beside the drawing; recording is a panel an Editor opened, under it. There
          is nothing to record until a number has been chosen. */}
      {selectedPosition && (
        <div className="mt-12 flex flex-col gap-8">
          <ListingPanel tavolaId={tavola.id} position={selectedPosition} positions={positions} />
          {/* What sits *at* the number, then what goes *with* it — in that order, because a
              number nobody has recorded a Part at is rarely one anybody is grouping yet.
              Keyed by the Position, so a name half-typed at one number, or a link half chosen
              at it, does not follow the Editor to the next one. */}
          <BelongsWithPanel
            key={selectedPosition.id}
            tavolaId={tavola.id}
            sheet={sheet}
            position={selectedPosition}
          />
        </div>
      )}

      <div className="mt-12">
        <PositionList
          positions={positions}
          selectedPositionId={selectedPosition?.id ?? null}
          onSelect={open}
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
