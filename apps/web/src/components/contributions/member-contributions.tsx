import { Camera, Images, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { PhotographStrip } from '@/components/parts/part-photographs';
import { Button, buttonVariants } from '@/components/ui/button';
import { Refusal, TextArea } from '@/components/ui/field';
import { api, refusalText, type Contribution, type ContributionTarget } from '@/lib/api';
import { authorOf, useRereadContributions, writtenOn } from '@/lib/contributions';
import { cn } from '@/lib/utils';

/**
 * **What members have said about one thing, and the way to say something** (stories 83–91).
 *
 * The archive speaks in three voices and this is the third. The factory's words are boxed,
 * because they are quoted from a document; the Club's are plain prose, because they are the
 * archive speaking; a member's are set under **their name and the day they wrote**, because
 * that is what lets the next person judge them and follow up (story 89).
 *
 * It sits under the thing it is about — a Part, or a number with nothing recorded at it — and
 * the form opens **in place**, like everything else beside the drawing. Somebody standing at a
 * car with a part in one hand is not sent to another screen to say what it is.
 */
export function MemberContributions({
  target,
  contributions,
  about,
  thing,
  canReportWrong = false,
}: {
  target: ContributionTarget;
  /** The ones about this target, oldest first. */
  contributions: Contribution[];
  /** What it is about, as the form's own label names it: the Part's name, "position 14". */
  about: string;
  /**
   * And as the button says it: "this part", "this position". Said every time, because a number
   * with a Part at it offers both, one under the other, and they must not read as one button.
   */
  thing: string;
  /** Whether "the record is wrong" is something that can be said here. Only of a Part. */
  canReportWrong?: boolean;
}) {
  /** Which form is open, if either. One at a time: they are the same form with one word changed. */
  const [writing, setWriting] = useState<'knowledge' | 'correction' | null>(null);

  return (
    <div className="mt-6 border-t border-line pt-4" data-testid="contributions">
      {contributions.length > 0 && (
        <>
          <h5 className="label">From members</h5>
          <ul className="mt-3 flex flex-col gap-5">
            {contributions.map((contribution) => (
              <li key={contribution.id}>
                <Written contribution={contribution} />
              </li>
            ))}
          </ul>
        </>
      )}

      {writing === null ? (
        <div
          className={cn('flex flex-wrap items-center gap-x-2', contributions.length > 0 && 'mt-5')}
        >
          <Button onClick={() => setWriting('knowledge')}>Add what you know about {thing}</Button>
          {canReportWrong && (
            <Button variant="link" onClick={() => setWriting('correction')}>
              Report something wrong
            </Button>
          )}
        </div>
      ) : (
        <Writing
          target={target}
          about={about}
          correction={writing === 'correction'}
          onDone={() => setWriting(null)}
        />
      )}
    </div>
  );
}

/**
 * One Contribution as it is read.
 *
 * **A waiting one does not look published**, and that is the whole of the frame round it: a
 * member who has just sent something needs to see that it arrived (story 86) and that it has not
 * gone out under the Club's name yet (story 87) — in one glance, so they do not send it again.
 */
function Written({ contribution }: { contribution: Contribution }) {
  const waiting = contribution.state === 'waiting';
  const author = authorOf(contribution);

  return (
    <article
      className={cn(waiting && 'contribution-waiting')}
      data-state={contribution.state}
      data-testid="contribution"
    >
      {waiting && (
        <p className="mb-3 text-sm text-pretty" data-testid="contribution-waiting">
          <span className="font-semibold">Waiting to be checked.</span>{' '}
          <span className="text-muted">Only you can see this until an Editor has read it.</span>
        </p>
      )}

      <p className="text-sm">
        <span className="font-semibold">{author}</span>
        <span className="text-faint">
          , <time dateTime={contribution.writtenAt}>{writtenOn(contribution.writtenAt)}</time>
        </span>
      </p>
      {contribution.correction && <p className="tag mt-1">Says the record is wrong</p>}

      {/* Their line breaks are theirs: a list of three casting numbers was typed as three lines. */}
      <p className="mt-2 max-w-measure text-sm text-pretty whitespace-pre-line">
        {contribution.text}
      </p>

      <PhotographStrip
        photographs={contribution.photographs}
        of={
          contribution.authorName === null
            ? 'what a former member wrote'
            : `what ${contribution.authorName} wrote`
        }
      />
    </article>
  );
}

/**
 * A label standing in for a button, which therefore has to be told what a button knows already:
 * that it is pressable, and what it looks like when it is not. `disabled` is the input's; this
 * is the same state said to the eye.
 */
const PICKER = 'cursor-pointer aria-disabled:pointer-events-none aria-disabled:opacity-40';

/** Enough to show a part from every side. The archive refuses a ninth; this is the near warning. */
const MAX_PHOTOGRAPHS = 8;

/** Where a send has got to, in the words the button says while it is getting there. */
type Progress =
  { stage: 'idle' } | { stage: 'words' } | { stage: 'photograph'; at: number; of: number };

/**
 * The form — **words first, then each picture on its own.**
 *
 * That order is for a garage. The text is a few hundred bytes and arrives on almost any
 * reception; a photograph is megabytes and may not. So once the words are in, they are in: a
 * picture that fails leaves the Contribution sent and this form saying which pictures are still
 * to go, with the same button trying them again.
 */
function Writing({
  target,
  about,
  correction,
  onDone,
}: {
  target: ContributionTarget;
  about: string;
  correction: boolean;
  onDone: () => void;
}) {
  const reread = useRereadContributions();
  const cameraId = useId();
  const galleryId = useId();

  const [text, setText] = useState('');
  const [photographs, setPhotographs] = useState<Chosen[]>([]);
  /** The Contribution the words became, once they have arrived. Never sent twice. */
  const [sentId, setSentId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ stage: 'idle' });
  const [refusal, setRefusal] = useState<string | null>(null);

  const busy = progress.stage !== 'idle';
  const full = photographs.length >= MAX_PHOTOGRAPHS;

  /**
   * Every preview is an address the browser holds a file open for, so each is given back when
   * its photograph leaves the list — sent, taken out, or left behind with the form.
   */
  const held = useRef(photographs);
  useEffect(() => {
    held.current = photographs;
  }, [photographs]);
  useEffect(() => () => held.current.forEach((chosen) => URL.revokeObjectURL(chosen.preview)), []);

  function choose(files: FileList | null) {
    if (!files) {
      return;
    }
    const room = MAX_PHOTOGRAPHS - photographs.length;
    const added = [...files]
      .slice(0, room)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotographs((already) => [...already, ...added]);
  }

  function takeOut(at: number) {
    const gone = photographs[at];
    if (gone) {
      URL.revokeObjectURL(gone.preview);
    }
    setPhotographs((already) => already.filter((_, index) => index !== at));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRefusal(null);

    let contributionId = sentId;
    const remaining = [...photographs];
    try {
      if (contributionId === null) {
        setProgress({ stage: 'words' });
        const sent = await api.sendContribution(target, { text, correction });
        contributionId = sent.contribution.id;
        setSentId(contributionId);
      }

      const total = remaining.length;
      while (remaining.length > 0) {
        setProgress({ stage: 'photograph', at: total - remaining.length + 1, of: total });
        const next = remaining[0];
        if (next) {
          await api.attachContributionPhotograph(contributionId, next.file);
          URL.revokeObjectURL(next.preview);
        }
        remaining.shift();
        setPhotographs([...remaining]);
      }

      await reread();
      onDone();
    } catch (error) {
      setRefusal(
        contributionId === null
          ? refusalText(error)
          : `Your words arrived, but ${remaining.length === 1 ? 'a photograph' : `${remaining.length} photographs`} did not. ${refusalText(error)}`,
      );
      if (contributionId !== null) {
        // What did arrive is shown as arrived, under the form still holding what did not.
        await reread();
      }
    } finally {
      setProgress({ stage: 'idle' });
    }
  }

  return (
    <form
      onSubmit={(event) => void send(event)}
      className="editor-panel mt-5 flex animate-rise flex-col gap-5"
      data-testid="contribution-form"
    >
      <TextArea
        label={correction ? `What is wrong with ${about}` : `What you know about ${about}`}
        hint={
          correction
            ? 'Say what the record gets wrong and how you know. An Editor reads this and corrects the record; nothing changes until they have.'
            : 'In your own words. An Editor reads it before anybody else sees it, and it is published under your name.'
        }
        rows={5}
        value={text}
        onChange={(event) => setText(event.target.value)}
        // Once the words have arrived they are not edited here: what is left is the pictures.
        disabled={busy || sentId !== null}
        required
        autoFocus
      />

      <div>
        <p className="label">Photographs</p>
        <ChosenPhotographs photographs={photographs} disabled={busy} onRemove={takeOut} />

        {/*
         * **Two ways in, and the first is the camera** (story 85). The member is standing at the
         * car holding the part: making them leave, photograph it and come back is how a
         * Contribution does not get written. `capture` asks the phone for its rear camera; a
         * laptop ignores it and opens the file picker, which is the right answer there.
         *
         * Labels rather than scripted buttons, so the picker opens natively and at full height.
         */}
        <div className="mt-3 flex flex-wrap gap-3">
          <label
            htmlFor={cameraId}
            className={cn(buttonVariants({ variant: 'outline' }), PICKER)}
            aria-disabled={busy || full}
          >
            <Camera aria-hidden="true" />
            Take a photograph
          </label>
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy || full}
            data-testid="contribution-camera"
            onChange={(event) => {
              choose(event.target.files);
              event.target.value = '';
            }}
          />

          <label
            htmlFor={galleryId}
            className={cn(buttonVariants({ variant: 'outline' }), PICKER)}
            aria-disabled={busy || full}
          >
            <Images aria-hidden="true" />
            Choose photographs
          </label>
          <input
            id={galleryId}
            type="file"
            // A hint to the operating system and nothing more. What a file *is* is decided by
            // reading it, at the API.
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy || full}
            data-testid="contribution-gallery"
            onChange={(event) => {
              choose(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
        {full && (
          <p className="mt-2 text-xs text-pretty text-faint">
            Eight is as many as one Contribution carries. Send the rest with another.
          </p>
        )}
      </div>

      {refusal !== null && <Refusal>{refusal}</Refusal>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {sendLabel(progress, sentId !== null)}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          {sentId === null ? 'Cancel' : 'Leave the photographs'}
        </Button>
      </div>
    </form>
  );
}

function sendLabel(progress: Progress, wordsArrived: boolean): string {
  if (progress.stage === 'words') {
    return 'Sending…';
  }
  if (progress.stage === 'photograph') {
    return `Sending photograph ${progress.at} of ${progress.of}…`;
  }
  return wordsArrived ? 'Send the photographs again' : 'Send to the Editors';
}

/** A photograph picked and not yet sent, with the address its preview is shown from. */
interface Chosen {
  file: File;
  preview: string;
}

/**
 * The photographs picked so far, **shown before they are sent** — a member who has just taken a
 * picture in a dim garage needs to see whether it is the part or their thumb.
 */
function ChosenPhotographs({
  photographs,
  disabled,
  onRemove,
}: {
  photographs: Chosen[];
  disabled: boolean;
  onRemove: (at: number) => void;
}) {
  if (photographs.length === 0) {
    return (
      <p className="mt-2 max-w-measure text-xs text-pretty text-faint">
        If you have the part in front of you, a picture of it says more than a description.
      </p>
    );
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-4" data-testid="chosen-photographs">
      {photographs.map((chosen, index) => (
        <li key={chosen.preview} className="relative">
          <div className="photograph size-20">
            <img src={chosen.preview} alt={`Photograph ${index + 1} to send`} />
          </div>
          <Button
            type="button"
            size="icon"
            className="absolute -top-3 -right-3"
            aria-label={`Do not send photograph ${index + 1}`}
            disabled={disabled}
            onClick={() => onRemove(index)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
