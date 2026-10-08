import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Refusal, Select, TextArea } from '@/components/ui/field';
import {
  api,
  type Currency,
  type Equivalent,
  type EquivalentKind,
  type EquivalentRequest,
  type Fitment,
  type FitmentRequest,
  type NewSourceRequest,
  type PartInFull,
  type Source,
  type SourceCondition,
} from '@/lib/api';
import {
  CURRENCIES,
  EQUIVALENT_KIND_LABELS,
  SOURCE_CONDITION_LABELS,
  formatObservedOn,
  formatPrice,
  todayInTheBrowser,
} from '@/lib/part-record';
import { useRereadPart } from '@/lib/parts';

/**
 * Recording what fits a Part, what can be bought instead of it, and where it has been available
 * (stories 108–110).
 *
 * **All three belong to the component and not to this drawing**, which is the one thing this
 * panel has to say out loud: an Editor working under Tavola 2 who corrects a fitment corrects it
 * on every sheet the Part is listed on. That is ADR 0001 doing what it is for rather than a side
 * effect, but it is invisible from a screen showing one number, so the panel says it in a
 * sentence before anything can be typed.
 *
 * Each of the three is a list with **no fixed number of slots**, which is the requirement rather
 * than a consequence: a Part with six known cross-references keeps six. Everything is correctable
 * in place, because a Source is seven fields and remove-and-retype is how an evening's work gets
 * lost to a typo in a URL.
 */

export function PartRecordEditor({ part }: { part: PartInFull }) {
  return (
    <div className="mt-6 flex flex-col gap-10 border-t border-line pt-6">
      <p className="max-w-measure text-sm text-pretty text-muted">
        These belong to the part itself, not to this drawing — a change here shows on every sheet{' '}
        <strong className="font-semibold">{part.nameEn ?? part.nameIt}</strong> is listed on.
      </p>

      <Fitments part={part} />
      <Equivalents part={part} />
      <Sources part={part} />
    </div>
  );
}

/**
 * One of the three, with what is already recorded and one form at a time.
 *
 * **One form**, because a section with an add form open *and* a row being corrected is two
 * half-finished statements about the same list and no way to tell which the buttons at the foot
 * belong to. Opening either closes the other.
 */
function Section({
  title,
  note,
  rows,
  form,
  onAdd,
  addLabel,
}: {
  title: string;
  note: string;
  rows: ReactNode;
  form: ReactNode;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section className="flex flex-col">
      <h3 className="label">{title}</h3>
      <p className="mt-2 max-w-measure text-sm text-pretty text-faint">{note}</p>

      <ul className="mt-4 flex flex-col border-t border-line">{rows}</ul>

      {form ?? (
        <div className="mt-4">
          <Button onClick={onAdd}>{addLabel}</Button>
        </div>
      )}
    </section>
  );
}

/** One recorded row, with the two things that can be done to it. */
function Row({
  children,
  busy,
  onCorrect,
  onRemove,
}: {
  children: ReactNode;
  busy: boolean;
  onCorrect: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3">
      <p className="text-pretty">{children}</p>
      <span className="flex items-center gap-1">
        <Button variant="ghost" onClick={onCorrect}>
          Correct
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onRemove}>
          Remove
        </Button>
      </span>
    </li>
  );
}

/** The two actions that close a form, in the order every other form in this archive puts them. */
function FormActions({
  busy,
  submitting,
  onCancel,
}: {
  busy: boolean;
  submitting: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Recording…' : submitting}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * Which cars the Part fits, and in whose words.
 *
 * The Model is chosen and the qualification is typed, and that asymmetry is the whole design: a
 * car is one of the ones the archive holds, and a chassis break is whatever somebody actually
 * knows. The hint says so, because an Editor who thinks the box wants a date range will leave it
 * empty rather than write *"late"* — and *"late"* is the fact.
 */
function Fitments({ part }: { part: PartInFull }) {
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.models() });
  const [editing, setEditing] = useState<Fitment | 'new' | null>(null);
  const reread = useRereadPart();

  const write = useMutation({
    mutationFn: (fitment: FitmentRequest) =>
      editing === 'new' || editing === null
        ? api.addFitment(part.id, fitment)
        : api.correctFitment(editing.id, fitment),
    onSuccess: async () => {
      setEditing(null);
      await reread();
    },
  });
  const remove = useMutation({
    mutationFn: (fitmentId: string) => api.removeFitment(fitmentId),
    onSuccess: () => reread(),
  });

  const [modelId, setModelId] = useState('');
  const [qualifier, setQualifier] = useState('');

  const open = (fitment: Fitment | 'new') => {
    setModelId(fitment === 'new' ? (models.data?.models[0]?.id ?? '') : fitment.model.id);
    setQualifier(fitment === 'new' ? '' : (fitment.qualifier ?? ''));
    write.reset();
    setEditing(fitment);
  };

  return (
    <Section
      title="Fits"
      note="Which cars this part goes on. Write the qualification the way you know it — “from chassis #310”, “late”, “1963–64”. Nothing here is parsed."
      addLabel="Record a car it fits"
      onAdd={() => open('new')}
      rows={part.fitments.map((fitment) => (
        <Row
          key={fitment.id}
          busy={remove.isPending}
          onCorrect={() => open(fitment)}
          onRemove={() => remove.mutate(fitment.id)}
        >
          {fitment.model.brand} {fitment.model.name}
          {fitment.qualifier !== null && <span className="text-muted"> — {fitment.qualifier}</span>}
        </Row>
      ))}
      form={
        editing && (
          <form
            className="mt-6 flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              write.mutate({ modelId, qualifier });
            }}
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <Select
                label="Car"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              >
                {models.data?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.brand} {model.name}
                    {model.series ? ` ${model.series}` : ''}
                  </option>
                ))}
              </Select>
              <Field
                label="Qualification"
                hint="Leave it blank if the part fits the car throughout."
                value={qualifier}
                onChange={(event) => setQualifier(event.target.value)}
              />
            </div>

            {write.isError && <Refusal>{write.error.message}</Refusal>}
            <FormActions
              busy={write.isPending}
              submitting="Record this fitment"
              onCancel={() => setEditing(null)}
            />
          </form>
        )
      }
    />
  );
}

/**
 * What can be bought instead of the original — **the most valuable thing an Editor can type
 * into this archive**, since most of these parts have not been made for fifty years.
 *
 * The kind is chosen from the four and the reference may be left blank, which is not laxity: a
 * donor vehicle usually has no number anybody knows, and refusing the row for want of one would
 * throw away the fact that sends somebody to a scrapyard with something to look for.
 */
function Equivalents({ part }: { part: PartInFull }) {
  const [editing, setEditing] = useState<Equivalent | 'new' | null>(null);
  const reread = useRereadPart();

  const write = useMutation({
    mutationFn: (equivalent: EquivalentRequest) =>
      editing === 'new' || editing === null
        ? api.addEquivalent(part.id, equivalent)
        : api.correctEquivalent(editing.id, equivalent),
    onSuccess: async () => {
      setEditing(null);
      await reread();
    },
  });
  const remove = useMutation({
    mutationFn: (equivalentId: string) => api.removeEquivalent(equivalentId),
    onSuccess: () => reread(),
  });

  const [kind, setKind] = useState<EquivalentKind>('oe-supplier');
  const [maker, setMaker] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const open = (equivalent: Equivalent | 'new') => {
    setKind(equivalent === 'new' ? 'oe-supplier' : equivalent.kind);
    setMaker(equivalent === 'new' ? '' : equivalent.maker);
    setReference(equivalent === 'new' ? '' : (equivalent.reference ?? ''));
    setNote(equivalent === 'new' ? '' : (equivalent.note ?? ''));
    write.reset();
    setEditing(equivalent);
  };

  return (
    <Section
      title="Instead of the original"
      note="Record as many as you know. There are no slots to run out of."
      addLabel="Record an equivalent"
      onAdd={() => open('new')}
      rows={part.equivalents.map((equivalent) => (
        <Row
          key={equivalent.id}
          busy={remove.isPending}
          onCorrect={() => open(equivalent)}
          onRemove={() => remove.mutate(equivalent.id)}
        >
          <span className="tag">{EQUIVALENT_KIND_LABELS[equivalent.kind]}</span> {equivalent.maker}
          {equivalent.reference !== null && (
            <span className="tabular ml-3 text-sm text-muted">{equivalent.reference}</span>
          )}
        </Row>
      ))}
      form={
        editing && (
          <form
            className="mt-6 flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              write.mutate({ kind, maker, reference, note });
            }}
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <Select
                label="Kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as EquivalentKind)}
              >
                {(Object.keys(EQUIVALENT_KIND_LABELS) as EquivalentKind[]).map((option) => (
                  <option key={option} value={option}>
                    {EQUIVALENT_KIND_LABELS[option]}
                  </option>
                ))}
              </Select>
              <Field
                label="Maker, standard or car"
                hint="Girling, SKF, DIN 934 — or the car a donor part comes off."
                value={maker}
                onChange={(event) => setMaker(event.target.value)}
              />
              <Field
                label="Reference"
                mono
                hint="The number to quote. Leave it blank for a donor vehicle nobody has a number for."
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>

            <TextArea label="Note" value={note} onChange={(event) => setNote(event.target.value)} />

            {write.isError && <Refusal>{write.error.message}</Refusal>}
            <FormActions
              busy={write.isPending}
              submitting="Record this equivalent"
              onCancel={() => setEditing(null)}
            />
          </form>
        )
      }
    />
  );
}

/**
 * Where the Part has been available, and what it cost on a stated day.
 *
 * **The price and the date it was seen are one field in two boxes**, and the archive refuses a
 * price without a date rather than storing one and hiding it (story 110). The hint says so before
 * anything is typed, so the refusal is never a surprise — but the refusal is what enforces it,
 * because a hint is not a rule.
 */
function Sources({ part }: { part: PartInFull }) {
  const [editing, setEditing] = useState<Source | 'new' | null>(null);
  const reread = useRereadPart();

  const write = useMutation({
    mutationFn: (source: NewSourceRequest) =>
      editing === 'new' || editing === null
        ? api.addSource(part.id, source)
        : api.correctSource(editing.id, source),
    onSuccess: async () => {
      setEditing(null);
      await reread();
    },
  });
  const remove = useMutation({
    mutationFn: (sourceId: string) => api.removeSource(sourceId),
    onSuccess: () => reread(),
  });

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [condition, setCondition] = useState<SourceCondition | ''>('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [observedOn, setObservedOn] = useState('');
  const [note, setNote] = useState('');

  const open = (source: Source | 'new') => {
    setName(source === 'new' ? '' : source.name);
    setUrl(source === 'new' ? '' : source.url);
    setCondition(source === 'new' ? '' : (source.condition ?? ''));
    setPrice(source === 'new' || source.price === null ? '' : String(source.price.amount / 100));
    setCurrency(source === 'new' || source.price === null ? 'EUR' : source.price.currency);
    setObservedOn(source === 'new' || source.price === null ? '' : source.price.observedOn);
    setNote(source === 'new' ? '' : (source.note ?? ''));
    write.reset();
    setEditing(source);
  };

  return (
    <Section
      title="Seen for sale"
      note="Somewhere this part has actually been available. A price needs the date it was seen — the archive will not take one without the other."
      addLabel="Record a source"
      onAdd={() => open('new')}
      rows={part.sources.map((source) => (
        <Row
          key={source.id}
          busy={remove.isPending}
          onCorrect={() => open(source)}
          onRemove={() => remove.mutate(source.id)}
        >
          {source.name}
          {source.condition !== null && (
            <span className="tag ml-3">{SOURCE_CONDITION_LABELS[source.condition]}</span>
          )}
          {source.price !== null && (
            <span className="ml-3 text-sm text-muted">
              <span className="tabular">{formatPrice(source.price)}</span>{' '}
              {formatObservedOn(source.price.observedOn)}
            </span>
          )}
        </Row>
      ))}
      form={
        editing && (
          <form
            className="mt-6 flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              write.mutate({ name, url, condition, price, currency, observedOn, note });
            }}
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <Field
                label="Whose listing"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Field
                label="Link"
                type="url"
                inputMode="url"
                hint="Where a member can go and look. Anything that is not a link belongs in the note."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Select
                label="Condition"
                hint="The first thing anybody asks. Leave it unstated if the listing does not say."
                value={condition}
                onChange={(event) => setCondition(event.target.value as SourceCondition | '')}
              >
                <option value="">Not stated</option>
                {(Object.keys(SOURCE_CONDITION_LABELS) as SourceCondition[]).map((option) => (
                  <option key={option} value={option}>
                    {SOURCE_CONDITION_LABELS[option]}
                  </option>
                ))}
              </Select>
            </div>

            {/*
             * **Three boxes, one fact.** They are grouped and captioned as one thing because
             * that is what they are: an amount with no day beside it is refused, and the caption
             * is where an Editor finds that out before the refusal does it for them.
             */}
            <fieldset className="grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
              <legend className="label">The price, and the day it was seen</legend>
              <Field
                label="Price"
                mono
                inputMode="decimal"
                hint="Leave blank if no price was on the listing."
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              <Select
                label="Currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as Currency)}
              >
                {CURRENCIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Field
                label="Seen on"
                type="date"
                mono
                max={todayInTheBrowser()}
                hint="Required as soon as there is a price."
                value={observedOn}
                onChange={(event) => setObservedOn(event.target.value)}
              />
            </fieldset>

            <TextArea label="Note" value={note} onChange={(event) => setNote(event.target.value)} />

            {write.isError && <Refusal>{write.error.message}</Refusal>}
            <FormActions
              busy={write.isPending}
              submitting="Record this source"
              onCancel={() => setEditing(null)}
            />
          </form>
        )
      }
    />
  );
}
