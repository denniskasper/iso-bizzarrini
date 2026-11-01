import type { ReactNode } from 'react';

/**
 * The parts of a page that is only there to be read — the legal notice and the privacy
 * statement. One column at the measure and nothing else: no cards, no icons, no summary boxes.
 */
export function ReadingPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-measure animate-rise">
      <h1 className="display text-4xl tracking-display sm:text-5xl">{title}</h1>
      <p className="mt-6 text-lg text-pretty text-muted">{lead}</p>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl text-balance">{title}</h2>
      <div className="mt-5 flex flex-col gap-4 text-pretty text-text">{children}</div>
    </section>
  );
}

/**
 * Something the association wrote in a box on the Club's screen, set as it was typed: a blank
 * line starts a paragraph and a line break stays a line break, which is all an address or a
 * paragraph of the board's own wording needs. Nothing in it is interpreted.
 */
export function AsWritten({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim() !== '')
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph.trim()}
          </p>
        ))}
    </>
  );
}

/** What stands where a page could not be read at all. */
export function Unreadable({ children }: { children: ReactNode }) {
  return <p className="text-lg text-pretty text-muted">{children}</p>;
}

/**
 * An address somebody can write to, as the link it is: a target a hand can hit, though it sits in
 * a line of text.
 */
export function Mail({ address }: { address: string }) {
  return (
    <a
      href={`mailto:${address}`}
      className="-my-2 inline-flex min-h-control items-center text-accent-ink underline underline-offset-4"
    >
      {address}
    </a>
  );
}
