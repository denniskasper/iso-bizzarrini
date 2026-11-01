import { useMutation, useQuery } from '@tanstack/react-query';
import type { Landing, VisitorModel } from '@ricambi/contracts';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Mail } from '@/components/legal/reading';
import { SampleShelf } from '@/components/samples/sample-shelf';
import { SignInLink } from '@/components/sign-in-link';
import { Button } from '@/components/ui/button';
import { Field, Refusal, TextArea } from '@/components/ui/field';
import { api, refusalText } from '@/lib/api';
import chooseACar from '@/assets/landing/choose-a-car.webp?url';
import openTheDrawing from '@/assets/landing/open-the-drawing.webp?url';
import readThePart from '@/assets/landing/read-the-part.webp?url';

/**
 * **What a Visitor is shown** (issue #128, ADR 0019): what Ricambi is, which cars it covers and
 * how deep it goes for each, what a member gets, and what that costs.
 *
 * The depth and none of the content. The counts come from the one read outside the gate, and
 * the screenshots are of the invented practice archive, so nothing here is the Club's own
 * material. **Signing in stays the one dominant action**: it is the first thing under the name,
 * as it was on the bare members-only screen this replaces, because most people who arrive here
 * signed out are members who have not signed in yet.
 */
export function VisitorLanding() {
  const { data, isPending, isError } = useQuery({ queryKey: ['landing'], queryFn: api.landing });
  const hash = useRouterState({ select: (state) => state.location.hash });

  /**
   * A locked number on a Sample leads here, to the way in (issue #132). The section is only on the
   * page once the landing has been read, which is after the router has tried to scroll to it.
   */
  useEffect(() => {
    if (data && hash !== '') {
      document.getElementById(hash)?.scrollIntoView();
    }
  }, [data, hash]);

  return (
    <div className="animate-rise">
      {/*
        On a desk the words that say what Ricambi is sit beside the cars it covers, the way the
        members' catalog index sits beside its own opening words; on a phone they are the next
        thing down.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-x-16">
        <header className="max-w-measure">
          <h1 className="display text-display">Ricambi</h1>
          <p className="mt-6 text-xl text-pretty">
            The Club’s parts archive for Iso and Bizzarrini cars, keyed to the factory parts
            catalogues: each drawing the factory printed, each numbered position on it, and the
            parts listed there.
          </p>
          <Button asChild variant="primary" size="lg" className="mt-10">
            <SignInLink>Sign in</SignInLink>
          </Button>
        </header>

        <section aria-labelledby="covered" className="mt-24 lg:mt-0">
          <h2 id="covered" className="text-3xl text-balance">
            The cars it covers
          </h2>
          <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
            Counted in drawings the Club has checked against the factory’s pages. The archive grows
            as each one is checked.
          </p>
          <div className="mt-10">
            {isPending && <p className="text-muted">Counting the drawings…</p>}
            {isError && (
              <p className="text-alarm">The archive could not be reached. Try again shortly.</p>
            )}
            {data && <CoveredModels models={data.landing.models} />}
          </div>
        </section>
      </div>

      {data && data.landing.samples.length > 0 && (
        <section aria-labelledby="samples" className="mt-24 border-t border-line pt-16">
          <h2 id="samples" className="text-3xl text-balance">
            Drawings from the archive
          </h2>
          <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
            A few of the factory’s drawings, shown as members see them, with one number on each open
            to read.
          </p>
          <div className="mt-10">
            <SampleShelf samples={data.landing.samples} />
          </div>
        </section>
      )}

      <section aria-labelledby="members-only" className="mt-24 border-t border-line pt-16">
        <h2 id="members-only" className="text-3xl text-balance">
          The archive is members-only.
        </h2>
        <p className="mt-4 max-w-measure text-lg text-pretty text-muted">
          The scanned drawings, and everything the Club has worked out about the parts on them, are
          the Club’s. Members contribute what they know on the understanding that only members can
          see it.
        </p>

        <h3 className="mt-16 text-xl">How a member finds a part</h3>
        <ol className="mt-10 space-y-16">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <figure className="lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start lg:gap-x-16">
                <figcaption>
                  <span className="tabular text-muted">{index + 1}</span>
                  <span className="ml-3 text-xl font-semibold">{step.title}</span>
                  <p className="mt-2 max-w-measure text-pretty text-muted">{step.detail}</p>
                </figcaption>
                <img
                  src={step.screenshot}
                  alt={step.alt}
                  width={1280}
                  height={800}
                  loading="lazy"
                  className="mt-6 w-full rounded-lg border border-line lg:mt-0"
                />
              </figure>
            </li>
          ))}
        </ol>

        <h3 className="mt-20 text-xl">What a member reads</h3>
        <dl className="mt-8 grid max-w-4xl gap-x-12 sm:grid-cols-2">
          {DETAIL.map((row) => (
            <div key={row.term} className="border-t border-line py-5">
              <dt className="font-semibold">{row.term}</dt>
              <dd className="mt-1 text-pretty text-muted">{row.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="fee" className="mt-24 border-t border-line pt-16">
        <h2 id="fee" className="text-3xl text-balance">
          What membership costs
        </h2>
        {data && <Fee fee={data.landing.fee} currency={data.landing.currency} />}
        <p className="mt-6 max-w-measure text-pretty text-muted">
          Membership is the Club’s, and the Club adds its members to Ricambi. There is no sign-up
          here.
        </p>
      </section>

      {data && <AskToJoin landing={data.landing} />}
    </div>
  );
}

/**
 * **The way in for somebody who is not a member yet** (issue #131): a request to the Club office,
 * which answers it and, if the Club accepts, adds them to the roster as it adds everybody.
 *
 * On a desk the words sit beside the form on the same grid as the opening, so what happens to a
 * request is read before anything is typed. The form is offered only where a letter would reach
 * the office; otherwise the office's own address takes its place, and without one there is no way
 * in to offer beyond what the page has already said.
 */
function AskToJoin({ landing }: { landing: Landing }) {
  const { officeEmail, requestForm } = landing;
  if (!requestForm && officeEmail === null) {
    return null;
  }

  return (
    <section
      aria-labelledby="ask-to-join"
      className="mt-24 border-t border-line pt-16 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-x-16"
    >
      <div className="max-w-measure">
        <h2 id="ask-to-join" className="text-3xl text-balance">
          Ask the Club to join
        </h2>
        <p className="mt-4 text-lg text-pretty text-muted">
          The Club office reads every request and answers it by e-mail. If the Club takes you on, an
          Administrator adds you to Ricambi and you are sent a link to choose your password.
        </p>
      </div>
      <div className="mt-10 lg:mt-0">
        {requestForm ? (
          <RequestForm />
        ) : (
          <p className="max-w-measure text-lg text-pretty" data-testid="office-address">
            Write to the Club office at <Mail address={officeEmail ?? ''} />, with your name and the
            car or cars you have.
          </p>
        )}
      </div>
    </section>
  );
}

function RequestForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cars, setCars] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  // The field a person never sees. A script fills in whatever it finds, and is refused for it.
  const [website, setWebsite] = useState('');
  const ask = useMutation({ mutationFn: api.askToJoin });

  if (ask.isSuccess) {
    return (
      <div role="status" className="max-w-measure animate-rise" data-testid="request-sent">
        <p className="text-3xl font-semibold text-balance">Request sent to the Club office.</p>
        <p className="mt-4 text-lg text-pretty text-muted">
          The office answers by e-mail, to <span className="tabular">{email}</span>. Ricambi has
          kept no copy of it.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        ask.mutate({ name, email, cars, message, consent, website });
      }}
    >
      <Field
        label="Your name"
        autoComplete="name"
        required
        maxLength={200}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Field
        label="E-mail address"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        hint="The office answers you here."
      />
      <Field
        label="Your car or cars"
        maxLength={500}
        value={cars}
        onChange={(event) => setCars(event.target.value)}
        hint="Optional. Model, series and year, if you know them."
      />
      <TextArea
        label="Message"
        rows={4}
        maxLength={5000}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        hint="Optional."
      />
      <div aria-hidden="true" className="sr-only">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
      </div>
      <label className="flex items-start gap-3 text-pretty">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <span>
          Send these details to the Club office, which uses them only to answer me. The{' '}
          <Link to="/privacy" className="text-accent-ink underline underline-offset-4">
            privacy statement
          </Link>{' '}
          says what happens to them.
        </span>
      </label>

      {ask.isError && <Refusal>{refusalText(ask.error)}</Refusal>}

      <div>
        <Button type="submit" variant="primary" size="lg" disabled={ask.isPending}>
          {ask.isPending ? 'Sending…' : 'Send the request'}
        </Button>
      </div>
    </form>
  );
}

/**
 * The fee exactly as the Renewal states it. An unconfigured Club reads `0.00` because nobody has
 * said what it charges, and telling a Visitor membership is free would be a promise the Club never
 * made — so that is said as what it is.
 */
function Fee({ fee, currency }: { fee: string; currency: string }) {
  if (Number(fee) === 0) {
    return (
      <p className="mt-6 max-w-measure text-lg text-pretty" data-testid="landing-fee">
        The Club has not published its yearly fee yet.
      </p>
    );
  }

  return (
    <p className="mt-6 text-lg" data-testid="landing-fee">
      <span className="tabular text-3xl">{fee}</span>{' '}
      <span className="tabular text-xl text-muted">{currency}</span>{' '}
      <span className="text-muted">a year</span>
    </p>
  );
}

function CoveredModels({ models }: { models: VisitorModel[] }) {
  if (models.length === 0) {
    return <p className="text-lg text-pretty">The Club is checking the first drawings now.</p>;
  }

  return (
    <div className="space-y-12">
      {groupByBrand(models).map(([brand, brandModels]) => (
        <section key={brand} aria-labelledby={`covered-${brand}`}>
          <h3 id={`covered-${brand}`} className="text-lg text-muted">
            {brand}
          </h3>
          <ul className="mt-3 border-b border-line">
            {brandModels.map((model) => (
              <li
                key={`${model.name} ${model.series ?? ''}`}
                data-testid="visitor-model-row"
                className="grid grid-cols-[1fr_auto] items-end gap-x-6 border-t border-line py-5"
              >
                <span>
                  <span className="display block text-4xl text-balance">{model.name}</span>
                  <span className="tabular mt-1 block text-muted">
                    {[model.series, model.modelYears].filter(Boolean).join(', ')}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block text-2xl">{model.publishedTavole}</span>
                  <span className="block text-muted">
                    {model.publishedTavole === 1 ? 'drawing' : 'drawings'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByBrand(models: VisitorModel[]): [string, VisitorModel[]][] {
  const brands = new Map<string, VisitorModel[]>();
  for (const model of models) {
    brands.set(model.brand, [...(brands.get(model.brand) ?? []), model]);
  }
  return [...brands];
}

/**
 * The way members already work at the bench, in the order they do it. Numbered because it is a
 * sequence. The screenshots are of the invented practice archive, taken signed in as a Member, so
 * nothing in them is the Club's own material.
 */
const STEPS = [
  {
    title: 'Choose the car',
    detail: 'Every covered Model, by brand, with its series and years as the factory wrote them.',
    screenshot: chooseACar,
    alt: 'The list of covered cars, one car per band, grouped by brand.',
  },
  {
    title: 'Open the drawing',
    detail: 'The factory’s own drawing, sharp enough to zoom into, with every position numbered.',
    screenshot: openTheDrawing,
    alt: 'A drawing open beside its list of numbers, each numbered position ringed.',
  },
  {
    title: 'Press a number',
    detail:
      'The parts listed at that position, with their catalogue numbers and quantities, and what the Club knows about each.',
    screenshot: readThePart,
    alt: 'Number 3 pressed on the drawing, and the parts listed at each number beside it.',
  },
];

/** What a member is given at a number, and around it. Nothing here promises what is not built. */
const DETAIL = [
  {
    term: 'The factory’s listing',
    description:
      'Catalog Number, the Italian name and an English one, the quantity and the factory’s note, for every part at every number.',
  },
  {
    term: 'The Club’s knowledge',
    description:
      'Notes, photographs and specifications the Club has gathered about a part, beside what the factory printed.',
  },
  {
    term: 'Where a part fits, and where else to get it',
    description:
      'The cars a part fits, and its equivalents: a supplier’s number, a standard, a donor car.',
  },
  {
    term: 'A number stamped on a part',
    description:
      'Search by the number on the part in your hand, or compare one system across every car.',
  },
  {
    term: 'What you know',
    description:
      'Members offer what they know about a part, with photographs, and an Editor checks it before anybody else sees it.',
  },
];
