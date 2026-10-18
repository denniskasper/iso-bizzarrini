import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Refusal } from '@/components/ui/field';
import { refusalText } from '@/lib/api';

/**
 * **An English name nobody has vouched for yet** (ADR 0016, issue #32), said as such wherever a
 * Member reads it. The quietest text there is, because it qualifies the name beside it and is
 * never read first — but it is always there, and the Italian the factory printed is always on
 * the same screen beside it, so nothing machine-made passes for somebody's word.
 */
export function MachineTranslationTag() {
  return (
    <span className="tag whitespace-nowrap" data-testid="machine-translation">
      Machine translation
    </span>
  );
}

/**
 * The English name, and — while it is a Machine translation — the Italian and the label beside
 * it. For places that name a sheet or a Part in a line of their own.
 */
export function EnglishName({
  nameEn,
  nameIt,
  machineTranslated,
}: {
  nameEn: string;
  nameIt: string | null;
  machineTranslated: boolean;
}) {
  if (!machineTranslated) {
    return <>{nameEn}</>;
  }
  return (
    <>
      {nameEn}
      {nameIt !== null && (
        <>
          {' '}
          <span lang="it" className="text-muted">
            ({nameIt})
          </span>
        </>
      )}{' '}
      <MachineTranslationTag />
    </>
  );
}

/**
 * **An Editor vouching for the English as it stands** — a judgement of its own, and not one that
 * publishing the Tavola makes. Rewriting the name does the same, through the Part's correction.
 * Plain and quiet: it is never the dominant action on the screen it sits on.
 */
export function ConfirmEnglish({ confirm }: { confirm: () => Promise<unknown> }) {
  const confirming = useMutation({ mutationFn: confirm });

  return (
    <span className="inline-flex flex-col items-start">
      <Button
        variant="ghost"
        className="-ml-5"
        disabled={confirming.isPending}
        onClick={() => confirming.mutate()}
        data-testid="confirm-english"
      >
        {confirming.isPending ? 'Confirming…' : 'Confirm English'}
      </Button>
      {confirming.isError && <Refusal>{refusalText(confirming.error)}</Refusal>}
    </span>
  );
}
