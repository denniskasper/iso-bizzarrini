import { environmentMode } from '@/lib/environment';

/**
 * The proof stamp: the one element in this interface whose job is to be noticed.
 *
 * Everything else recedes around the drawing. This does not, because the failure it prevents is
 * someone taking practice data for the archive, or an Editor learning the tools on what they
 * believe is the real thing. It carries no control of any kind — there is nothing to dismiss,
 * nothing to collapse and nothing to remember having hidden — and it travels with the header,
 * so it cannot be scrolled away either.
 *
 * It is deliberately two sentences' worth of plain English rather than a symbol: what is unsafe
 * here is not obvious, and "nothing leaves it" is the part an Editor most needs to know before
 * they practise sending an invitation.
 */
export function EnvironmentBanner() {
  if (environmentMode() === 'production') {
    return null;
  }

  return (
    <aside aria-label="Environment" data-testid="environment-banner" className="demo-band">
      <div className="mx-auto w-full max-w-6xl px-gutter py-2">
        {/* One flowing sentence rather than a stamp beside a paragraph: on a phone the two
            wrapped onto three lines, and a permanent band is not allowed a fifth of the
            screen. Inline, the mark reads as stamped across the sentence and it fits in two. */}
        {/* Set a step above the chrome around it, not below: the one element that must be read
            at arm's length in a garage cannot be the smallest type on the page. */}
        <p className="text-sm">
          <span className="mr-3 text-xs font-semibold tracking-wordmark uppercase">Demo</span>
          Practice archive — nothing here is real, and nothing reaches a member.
        </p>
      </div>
    </aside>
  );
}

/**
 * The same stamp, for a drawing filling the screen: full screen covers the chrome, and with it
 * the band, so the drawing carries the mark itself. One word rather than the band's sentence,
 * because it sits on the artwork and the artwork is what a member came for. In a corner nothing
 * else uses, and it lets every pointer through to the sheet beneath it.
 */
export function EnvironmentMark() {
  if (environmentMode() === 'production') {
    return null;
  }

  return (
    <p data-testid="environment-mark" className="demo-band demo-mark absolute top-3 left-3">
      <span className="text-sm font-semibold tracking-wordmark uppercase">Demo</span>
      <span className="sr-only"> — practice archive, nothing here is real</span>
    </p>
  );
}
