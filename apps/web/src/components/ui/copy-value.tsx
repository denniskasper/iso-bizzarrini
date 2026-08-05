import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** How long "Copied" stays on the button — long enough to read, short enough not to linger. */
const COPIED_FOR = 2400;

/**
 * A value that exists to be **transcribed somewhere else**: an IBAN, a BIC, the reference a
 * member writes on a transfer.
 *
 * Every one of them is transcribed into a banking app by somebody holding a phone in a cold
 * garage, and a single wrong character makes the payment unmatchable. So: the mono face, because
 * that is what every identifier in this archive is set in; tabular figures, because a mistyped
 * digit has to be findable by eye; and a press that puts it on the clipboard, because selecting
 * text precisely on a phone is the part that goes wrong.
 *
 * **`break-words` and deliberately not `break-all`.** A narrow screen has to be able to break an
 * IBAN written with no spaces in it, and must not break *Elena Moretti* into `Morett` and `i` —
 * which is what a payment reference is, a name with an identifier around it. This breaks at the
 * spaces where there are any and only inside a run when there is no other choice.
 *
 * A browser that refuses the clipboard is told to select it by hand, rather than left with a
 * button that appeared to do nothing.
 */
export function CopyValue({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  /** For the one value on a screen that is the reason the screen exists. */
  emphasis?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'refused'>('idle');

  useEffect(() => {
    if (state === 'idle') {
      return;
    }
    const settle = setTimeout(() => setState('idle'), COPIED_FOR);
    return () => clearTimeout(settle);
  }, [state]);

  return (
    <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
      <div className="min-w-0">
        <p className="text-2xs text-muted uppercase">{label}</p>
        <p
          className={cn(
            'tabular mt-1 font-mono break-words text-text',
            emphasis ? 'text-xl' : 'text-base',
          )}
        >
          {value}
        </p>
        {state === 'refused' && (
          <p role="alert" className="mt-1 text-xs text-pretty text-faint">
            This browser would not copy it. Select it by hand.
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        aria-label={`Copy the ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard
            .writeText(value)
            .then(() => setState('copied'))
            .catch(() => setState('refused'));
        }}
      >
        {state === 'copied' ? <Check /> : <Copy />}
        {state === 'copied' ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
