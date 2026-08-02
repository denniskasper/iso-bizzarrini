import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A labelled input. Plain and unambiguous, in the Google half of the direction: a small
 * uppercase label, a ruled box, and a note underneath when there is something worth saying.
 *
 * The label is always present and never a placeholder. An Editor typing a Sezione into a form
 * has the paper catalog in their other hand, and a field whose name vanishes the moment they
 * start typing is a field they have to empty to check.
 */
export function Field({
  label,
  hint,
  mono = false,
  suggestions,
  className,
  ...props
}: ComponentProps<'input'> & {
  label: string;
  hint?: ReactNode;
  /** Set the value in the mono face — every number the factory printed is an identifier. */
  mono?: boolean;
  /**
   * What has been typed here before, offered rather than imposed. A `datalist` and not a
   * `select`, because the Editor must still be able to write something that is not on the
   * list — the first Tavola of a new Category has to be recordable.
   */
  suggestions?: readonly string[];
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const listId = suggestions && suggestions.length > 0 ? `${id}-list` : undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-2xs text-muted uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        list={listId}
        className={cn(
          'h-control w-full rounded-md border border-line-strong bg-surface-raised px-3',
          'text-base text-text transition-colors duration-150 ease-[var(--ease-out-quick)]',
          'placeholder:text-faint hover:border-line-strong focus:border-accent-ink',
          mono && 'tabular',
        )}
        {...props}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions?.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-pretty text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A form an Editor opened deliberately: ruled off from the page, headed, and closed by the two
 * actions at its foot. Not a modal — the archive is a printed index and a dialogue over a
 * drawing is exactly the chrome this interface is supposed to stay out of the way of.
 */
export function EditorPanel({
  title,
  note,
  children,
  onSubmit,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="registration-mark animate-rise border border-line bg-surface-sunken p-6 sm:p-8"
    >
      <h2 className="text-2xs text-muted uppercase">{title}</h2>
      {note && <p className="mt-3 max-w-measure text-sm text-pretty text-muted">{note}</p>}
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </form>
  );
}

/** What a failed request says, where the eye already is: just above the action that failed. */
export function Refusal({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-pretty text-accent-ink">
      {children}
    </p>
  );
}
