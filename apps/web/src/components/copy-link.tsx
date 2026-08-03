import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** How long "copied" stays on the button — long enough to read, short enough not to linger. */
const COPIED_FOR = 2400;

/**
 * The link that opens exactly this screen for somebody else (story 52).
 *
 * **It copies the address bar and nothing cleverer**, because the address bar is already right:
 * what a member is reading *is* the URL — the Tavola in the path and the Position in the search —
 * so what is shared is what is on the glass, and a member who copies it by hand gets the same
 * thing. That is also why this knows nothing about Positions: it is about the address, and the
 * screen is what decides what the address says.
 *
 * A browser that refuses the clipboard is told to do exactly that, rather than left with a button
 * that did nothing.
 */
export function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'refused'>('idle');

  useEffect(() => {
    if (state === 'idle') {
      return;
    }
    const settle = setTimeout(() => setState('idle'), COPIED_FOR);
    return () => clearTimeout(settle);
  }, [state]);

  return (
    <div className="flex items-center gap-3">
      {state === 'refused' && (
        <span role="alert" className="text-xs text-pretty text-faint">
          Copy the address bar.
        </span>
      )}
      <Button
        variant="ghost"
        data-testid="copy-link"
        onClick={() => {
          void navigator.clipboard
            .writeText(window.location.href)
            .then(() => setState('copied'))
            .catch(() => setState('refused'));
        }}
      >
        <Link2 />
        {state === 'copied' ? 'Link copied' : 'Copy link'}
      </Button>
    </div>
  );
}
