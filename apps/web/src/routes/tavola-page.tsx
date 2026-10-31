import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BelongsWithPanel } from '@/components/editor/belongs-with-panel';
import { BulkPaste } from '@/components/editor/bulk-paste';
import {
  CheckingSheets,
  ReadingDoubts,
  ScanTurn,
  TableSheets,
  useTavolaChecking,
} from '@/components/editor/checking';
import { FileUnder } from '@/components/editor/file-under';
import { ListingPanel } from '@/components/editor/listing-panel';
import { MarkingBar } from '@/components/editor/marking-bar';
import { OutlinePanel } from '@/components/editor/outline-panel';
import { PublishedBy, UncheckedBand } from '@/components/editor/publication';
import { ScanUpload } from '@/components/editor/scan-upload';
import { ShowToVisitors, useShowToVisitors } from '@/components/editor/show-to-visitors';
import { ReadAgain } from '@/components/readings/read-again';
import { RemoveTavola } from '@/components/readings/remove-tavola';
import { ConfirmEnglish, MachineTranslationTag } from '@/components/machine-translation';
import { PartReading } from '@/components/parts/part-reading';
import { TavolaParts } from '@/components/parts/tavola-parts';
import { BelongsWith } from '@/components/positions/belongs-with';
import { PositionJump } from '@/components/positions/position-jump';
import { PositionList } from '@/components/positions/position-list';
import { SubAssemblyList } from '@/components/positions/sub-assembly-list';
import { WhatIsLeft } from '@/components/progress/what-is-left';
import { Button } from '@/components/ui/button';
import { DrawingViewer, type DrawingView } from '@/components/viewer/drawing-viewer';
import { MarkCard, PositionCard, useBeside } from '@/components/viewer/mark-card';
import { MarkLayer, type Pointed } from '@/components/viewer/mark-layer';
import { OutlineLayer, outlineAt } from '@/components/viewer/outline-layer';
import {
  api,
  type CatalogProvenance,
  type Mark,
  type Position,
  type ReadingDoubt,
} from '@/lib/api';
import { useMarkingTool } from '@/lib/marking';
import { outsideTheirOutlines } from '@/lib/outline-geometry';
import { useOutlineTool } from '@/lib/outlining';
import { useTavolaListings } from '@/lib/parts';
import { markAfter, markOn, positionMatching, positionsIn } from '@/lib/positions';
import { useSheetProgress } from '@/lib/progress';
import { useSession } from '@/lib/session';

/** How long a pointer rests on a circle before the card takes over the column. */
const POINTER_SETTLES_MS = 120;
/** How long the card stays after the pointer leaves, so the next circle does not blank it. */
const POINTER_LINGERS_MS = 120;

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
  const { isEditor, isAdministrator } = useSession();
  const queryClient = useQueryClient();

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
  /**
   * **An Administrator choosing the number Visitors may read** (ADR 0019), by pressing its circle.
   * Keyed by the Tavola like everything else held here, so it never follows them onto the next
   * sheet; and only an Administrator is ever picking.
   */
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const picking = isAdministrator && pickingFor === tavolaId;
  const visitors = useShowToVisitors(tavolaId, () => setPickingFor(null));
  const tool = useMarkingTool(tavolaId);
  const outlining = useOutlineTool(tavolaId);
  /**
   * **Which Sub-assembly's outline the drawing shows** (issue #113), asked for in three ways.
   * A name pointed at beside the drawing, for as long as the pointer rests there; a Sub-assembly
   * selected from that list, until a number is selected instead; and the Sub-assembly the number
   * being read is in. Keyed by the Tavola, so neither follows a member onto the next sheet.
   */
  const [outlinePointed, setOutlinePointed] = useState<{ tavolaId: string; id: string } | null>(
    null,
  );
  const [outlineSelected, setOutlineSelected] = useState<{ tavolaId: string; id: string } | null>(
    null,
  );

  /**
   * The circle a pointer is resting on, or keyboard focus is at, and the card says what is there
   * (issue #35). Keyed by the Tavola like everything else held here, so a card never follows a
   * member onto the next sheet. What it shows comes from the sheet's index, which the column
   * beside the drawing reads anyway: hovering costs no request.
   *
   * **Calm, because the card now takes over the column.** A pointer crossing the sheet on its
   * way somewhere does not flick the reading over and back: the card waits for the pointer to
   * settle on a circle, and stays a moment after it leaves, so moving from one circle to the next
   * changes the card without blanking it in between.
   */
  const [pointedAt, setPointedAt] = useState<(Pointed & { tavolaId: string }) | null>(null);
  const pointing = useRef<{ timer?: number; shown: boolean }>({ shown: false });
  const point = useCallback(
    (pointed: Pointed | null) => {
      const now = pointing.current;
      window.clearTimeout(now.timer);
      if (pointed) {
        const show = () => {
          now.shown = true;
          setPointedAt({ ...pointed, tavolaId });
        };
        if (now.shown) {
          show();
        } else {
          now.timer = window.setTimeout(show, POINTER_SETTLES_MS);
        }
      } else {
        now.timer = window.setTimeout(() => {
          now.shown = false;
          setPointedAt(null);
        }, POINTER_LINGERS_MS);
      }
    },
    [tavolaId],
  );
  useEffect(() => () => window.clearTimeout(pointing.current.timer), []);
  const pointed = pointedAt?.tavolaId === tavolaId ? pointedAt : null;
  /** Where the column keeps the card, once the column is on the page. */
  const [besideHost, setBesideHost] = useState<HTMLDivElement | null>(null);
  const beside = useBeside();
  const index = useTavolaListings(tavolaId);

  /**
   * **Checking what the machine read** (issue #34): asked only while an Editor has an Unchecked
   * Tavola open, because a Member is never told what read it. `followed` is the row a doubt was
   * followed to, keyed by the Tavola so it does not follow the Editor onto the next sheet.
   */
  const checkingOpen = isEditor && data?.tavola.state === 'unchecked';
  const checking = useTavolaChecking(tavolaId, checkingOpen);
  const [followed, setFollowed] = useState<{ tavolaId: string; listingId: string } | null>(null);

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
  // Beside the drawing, the column is already reading the selected number: a card for it would
  // only cover the same words with themselves.
  const described =
    pointed && !(beside && pointed.position.id === selectedPosition?.id) ? pointed : null;

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
        // The same page, another Position: the reader stays where they were on it.
        resetScroll: false,
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
      // Selecting a number is selecting something else, so a Sub-assembly selected to be shown
      // stops being shown — the number's own Sub-assembly, if it has one, takes its place.
      setOutlineSelected(null);
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
      setOutlineSelected(null);
      open(position);
      if (next) {
        view.current?.show(next);
      }
    },
    [open, selectedPosition?.id, selectedMark?.id],
  );

  /**
   * A doubt leads to the row it is about, beside the sheet it was read from, with its number
   * opened so the drawing is already there when the Editor looks back up. A doubt about a number
   * alone takes the drawing to it.
   */
  const followDoubt = (doubt: ReadingDoubt) => {
    const position = positions.find((candidate) => candidate.id === doubt.positionId) ?? null;
    if (doubt.listingId !== null) {
      setFollowed({ tavolaId, listingId: doubt.listingId });
      if (position) {
        open(position);
      }
    } else if (position) {
      goTo(position);
    }
  };

  /** Drawing or reshaping: a press on the sheet is about the outline, and not a circle. */
  const outlineInHand = outlining.drawing || outlining.reshaping;
  const outlinedId = outlineInHand
    ? null
    : ((outlinePointed?.tavolaId === tavolaId ? outlinePointed.id : null) ??
      (outlineSelected?.tavolaId === tavolaId ? outlineSelected.id : null) ??
      selectedPosition?.subAssemblyId ??
      null);
  const outlined =
    sheet.subAssemblies.find(
      (subAssembly) => subAssembly.id === outlinedId && subAssembly.outline,
    ) ?? null;

  /** Pointing at a name: shown while the pointer rests on it, gone as it leaves. */
  const pointAtOutline = useCallback(
    (id: string | null) => setOutlinePointed(id === null ? null : { tavolaId, id }),
    [tavolaId],
  );

  /**
   * Selecting one from the list, which is how a finger asks — and the drawing is taken to it,
   * because a member on a phone selecting from the list below has the drawing above them.
   */
  const selectOutline = (id: string | null) => {
    setOutlineSelected(id === null ? null : { tavolaId, id });
    const corners = sheet.subAssemblies.find((subAssembly) => subAssembly.id === id)?.outline;
    if (corners && corners.length > 0) {
      const middle = corners.reduce(
        (sum, corner) => ({
          x: sum.x + corner.x / corners.length,
          y: sum.y + corner.y / corners.length,
        }),
        { x: 0, y: 0 },
      );
      view.current?.show(middle);
    }
  };

  /** A tap inside an outline, away from any circle, opens that Sub-assembly. */
  const tapDrawing = (on: Element | null) => {
    const subAssemblyId = outlineAt(on);
    if (subAssemblyId) {
      void navigate({
        to: '/tavole/$tavolaId/sub-assemblies/$subAssemblyId',
        params: { tavolaId, subAssemblyId },
      });
    }
  };

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
      {/* Where this sheet sits, on one line: the car it belongs to, its number, its Category. */}
      <p className="flex flex-wrap items-baseline gap-x-4 text-lg text-muted">
        <Link
          to="/models/$modelId"
          params={{ modelId: tavola.model.id }}
          className="-my-2 flex min-h-control items-center hover:text-text"
        >
          {tavola.model.brand} {tavola.model.name}
        </Link>
        <span aria-hidden className="text-line-strong">
          /
        </span>
        <span>
          Tavola <span className="tabular text-text">{tavola.number}</span>
        </span>
        {/* The way from one drawing to the same system on every other car (story 36). */}
        {tavola.category && (
          <Link
            to="/categories/$slug"
            params={{ slug: tavola.category.slug }}
            className="-my-2 flex min-h-control items-center underline-offset-4 hover:text-text hover:underline"
            data-testid="tavola-category"
          >
            {tavola.category.name}
          </Link>
        )}
      </p>

      <h1 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">{tavola.nameIt}</h1>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-lg text-muted">
        <span>{tavola.nameEn}</span>
        {tavola.nameEnMachineTranslated && <MachineTranslationTag />}
      </p>
      {isEditor && tavola.nameEnMachineTranslated && (
        <ConfirmEnglish
          confirm={async () => {
            await api.nameTavolaInEnglish(tavola.id, tavola.nameEn);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['tavola', tavola.id] }),
              queryClient.invalidateQueries({ queryKey: ['model', tavola.model.id] }),
            ]);
          }}
        />
      )}
      {/* Who checked it is the Editors' business; a Member is simply shown the drawing. */}
      {isEditor && tavola.publication && (
        <div className="mt-3">
          <PublishedBy publication={tavola.publication} />
        </div>
      )}

      {tavola.state === 'unchecked' && (
        <div className="mt-8">
          <UncheckedBand tavolaId={tavola.id} modelId={tavola.model.id}>
            {checking.data && (
              <ReadingDoubts
                tavolaId={tavola.id}
                checking={checking.data}
                positions={positions}
                onDoubt={followDoubt}
              />
            )}
          </UncheckedBand>
          {isAdministrator && (
            <div className="mt-4 flex flex-col gap-4">
              <ReadAgain tavolaId={tavola.id} />
              <RemoveTavola tavolaId={tavola.id} />
            </div>
          )}
        </div>
      )}

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
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_var(--width-part-panel)]">
        {/* The drawing and the tools that change the sheet itself — its scan, which way up it
            is — travel together, so turning a sheet shows what it did without scrolling to it. */}
        <div className="drawing-column">
          <DrawingViewer
            ref={view}
            className="drawing-beside"
            scan={tavola.scan}
            alt={`Tavola ${tavola.number} — ${tavola.nameEn}`}
            overlay={
              <MarkLayer
                positions={positions}
                selectedPositionId={selectedPosition?.id ?? null}
                selectedMarkId={selectedMark?.id ?? null}
                lit={lit}
                onSelect={
                  picking ? (position: Position) => visitors.show.mutate(position.id) : readMark
                }
                onPoint={point}
                pointedMarkId={described?.mark.id ?? null}
                onMove={tool.on && !outlineInHand && !picking ? tool.moveMark : undefined}
                quiet={outlineInHand}
              />
            }
            underlay={
              tavola.scan && (
                <OutlineLayer
                  size={tavola.scan}
                  shown={outlined}
                  draft={outlining.drawing ? outlining.corners : null}
                  reshaping={
                    outlining.reshaping
                      ? {
                          corners: outlining.corners,
                          selected: outlining.selectedCorner,
                          onSelect: outlining.selectCorner,
                          onMove: outlining.moveCorner,
                        }
                      : null
                  }
                />
              )
            }
            onTap={tapDrawing}
            card={
              described && (
                <MarkCard anchor={described.element} beside={besideHost}>
                  <PositionCard
                    position={described.position}
                    listings={
                      index.data?.listings.filter(
                        (listing) => listing.positionId === described.position.id,
                      ) ?? null
                    }
                  />
                </MarkCard>
              )
            }
            // The sheet only becomes a tool when an Editor says so. A member's drawing is a
            // drawing, and a stray tap on it records nothing.
            onTapPoint={
              picking
                ? undefined
                : outlining.drawing
                  ? outlining.add
                  : outlining.reshaping
                    ? outlining.tapWhileReshaping
                    : tool.on
                      ? tool.place
                      : undefined
            }
            tapHint={
              outlining.drawing
                ? 'Click to add a corner to the outline.'
                : outlining.reshaping
                  ? 'Click a side of the outline to add a corner there.'
                  : undefined
            }
          />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            {/* A sheet scanned on its side is turned here, its Marks with it (issue #34). */}
            {isEditor && tavola.scan ? <ScanTurn tavolaId={tavola.id} /> : <span />}
            <ScanUpload tavolaId={tavola.id} hasScan={tavola.scan !== null} />
          </div>
        </div>

        <div className="relative flex flex-col gap-10" data-testid="part-panel">
          {/* Where the card for a pointed-at circle is shown, over the top of this column and
              level with the sheet, so the drawing itself is never covered. */}
          <div ref={setBesideHost} className="absolute inset-x-0 top-0 z-5 h-0" />
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
                  tavolaId={tavola.id}
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

          <SubAssemblyList
            tavolaId={tavola.id}
            sheet={sheet}
            selectedId={outlineSelected?.tavolaId === tavolaId ? outlineSelected.id : null}
            onPoint={pointAtOutline}
            onSelect={selectOutline}
            outside={isEditor ? outsideTheirOutlines(sheet) : null}
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

      {/* Only for a Published drawing with something to copy, or one already shown: a Sample is
          the factory's drawing, and an Administrator alone is told whether it is one. Under the
          drawing, as every tool here is, so the drawing is still the first thing on a phone. */}
      {isAdministrator &&
        tavola.state === 'published' &&
        tavola.sample !== undefined &&
        (tavola.scan || tavola.sample) && (
          <div className="mt-12">
            <ShowToVisitors
              sample={tavola.sample}
              picking={picking}
              onPick={() => {
                visitors.show.reset();
                setPickingFor(tavolaId);
              }}
              onCancel={() => setPickingFor(null)}
              actions={visitors}
            />
          </div>
        )}

      {checkingOpen && checking.data && (
        <div className="mt-16">
          <CheckingSheets
            tavolaId={tavola.id}
            tableSheets={tavola.tableSheets}
            checking={checking.data}
            positions={positions}
            highlighted={followed?.tavolaId === tavola.id ? followed : null}
          />
        </div>
      )}
      {!checkingOpen && tavola.tableSheets.length > 0 && (
        <div className="mt-12">
          <TableSheets tableSheets={tavola.tableSheets} />
        </div>
      )}

      {tool.on && (
        <div className="mt-12 flex flex-col gap-8">
          {/* Drawing or reshaping an outline is the tool's other mode, and while it is on, a
              click on the drawing is about the outline — so the panel that says a click places
              a Mark stands aside. */}
          {!outlineInHand && (
            <MarkingBar
              tool={tool}
              positions={positions}
              selected={selected}
              onDeselect={() => open(null)}
            />
          )}
          <OutlinePanel tool={outlining} subAssemblies={sheet.subAssemblies} />
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
          onSelect={(position) => {
            setOutlineSelected(null);
            open(position);
          }}
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

      {/* An evening's transcription, rather than one number's. It is below the sheet's own list
          of numbers because it is what an Editor turns to when working from a catalog page
          instead of from the drawing — and it is a panel per sheet, deliberately, since what it
          takes is one drawing's worth of rows and nothing wider (ADR 0005). */}
      <div className="mt-12">
        <BulkPaste tavolaId={tavola.id} />
      </div>

      <div className="mt-16 grid gap-12 sm:grid-cols-2">
        <Provenance provenance={tavola.provenance} />
        <FileUnder tavolaId={tavola.id} modelId={tavola.model.id} category={tavola.category} />
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
 * uses, and it is the link.
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
      <h2 id="provenance" className="label">
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
