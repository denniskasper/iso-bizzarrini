import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextArea } from '@/components/ui/field';
import type { NewPartRequest } from '@/lib/api';

/**
 * **The nine fields a Part has, written out once.**
 *
 * Recording a Part and correcting one are the same nine boxes with the same labels and the same
 * hints, and they were the obvious thing to write twice — which is how the two drift until an
 * Editor recording a Part and an Editor fixing one are being asked different questions about the
 * same archive. There is one form; what differs is what it is pointed at.
 *
 * Every field may be left blank, and blank means *not recorded* rather than a value. That matters
 * most for the Catalog Number: a Part with none is entirely ordinary (ADR 0001), so clearing the
 * box is a statement the archive has to be able to hear, not a field somebody forgot.
 */

/** The blank one, so nothing anywhere has to remember there are nine of them. */
export const NO_PART: NewPartRequest = {
  nameEn: '',
  nameIt: '',
  catalogNumber: '',
  disegnoOrigine: '',
  description: '',
  dimensions: '',
  materialFinish: '',
  catalogNote: '',
  note: '',
};

/**
 * What a Part in the archive looks like in these boxes: absent fields as empty ones.
 *
 * Written out field by field rather than mapped over the keys above, so that a tenth field added
 * to a Part is a typecheck failure here rather than a box that silently never fills in.
 */
export function partAsTyped(part: {
  [Field in keyof NewPartRequest]: string | null;
}): NewPartRequest {
  return {
    nameEn: part.nameEn ?? '',
    nameIt: part.nameIt ?? '',
    catalogNumber: part.catalogNumber ?? '',
    disegnoOrigine: part.disegnoOrigine ?? '',
    description: part.description ?? '',
    dimensions: part.dimensions ?? '',
    materialFinish: part.materialFinish ?? '',
    catalogNote: part.catalogNote ?? '',
    note: part.note ?? '',
  };
}

export function PartFields({
  part,
  onChange,
  offered,
}: {
  part: NewPartRequest;
  onChange: (part: NewPartRequest) => void;
  /**
   * **What the Editor had already typed when the archive sent them here** — offered under each
   * field it would change, and never applied for them.
   *
   * This exists for exactly one moment: an Editor describes a Part, the Catalog Number turns out
   * to belong to one the archive already has, and they merge into it. Before this, that press
   * threw away everything else they had written. It is *offered* rather than merged because the
   * archive cannot know which description is the better one, and quietly overwriting a
   * transcription with a stranger's is the one thing this form must never do.
   */
  offered?: Partial<NewPartRequest>;
}) {
  const set = (field: keyof NewPartRequest) => (event: { target: { value: string } }) =>
    onChange({ ...part, [field]: event.target.value });

  /**
   * A box, with the offer under it where there is one worth making — something was typed, and it
   * is not already what is in the box.
   *
   * **Under the box and not inside its hint**, which is the whole reason this wraps rather than
   * passing a button to `hint`: that slot is the input's `aria-describedby`, so a control put
   * there would be read out as the field's own description and would displace the guidance that
   * belongs in it. The offer is a thing to press, so it sits outside as one.
   */
  const withOffer = (field: keyof NewPartRequest, box: ReactNode): ReactNode => {
    const typed = offered?.[field]?.trim();
    if (!typed || typed === part[field].trim()) {
      return box;
    }

    return (
      <div className="flex flex-col gap-2">
        {box}
        <Button
          type="button"
          variant="ghost"
          // The 44px floor is kept — a cold hand has to be able to hit this — but it is set at
          // hint size and flush left, because it sits where a hint sits and is not the action.
          className="-mx-2 justify-start px-2 text-xs"
          onClick={() => onChange({ ...part, [field]: typed })}
        >
          Use what you typed: {typed}
        </Button>
      </div>
    );
  };

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {withOffer(
          'nameEn',
          <Field
            label="Name (English)"
            hint="What a member reads. One of the two names is required."
            value={part.nameEn}
            onChange={set('nameEn')}
          />,
        )}
        {withOffer(
          'nameIt',
          <Field
            label="Denominazione (Italian)"
            hint="As the catalog prints it."
            value={part.nameIt}
            onChange={set('nameIt')}
          />,
        )}
        {withOffer(
          'catalogNumber',
          <Field
            label="Catalog number"
            mono
            hint="The catalog's first column. Leave it blank if the part has none — many have."
            value={part.catalogNumber}
            onChange={set('catalogNumber')}
          />,
        )}
        {withOffer(
          'disegnoOrigine',
          <Field
            label="Disegno origine"
            mono
            hint="The original factory drawing number. Two parts may share one."
            value={part.disegnoOrigine}
            onChange={set('disegnoOrigine')}
          />,
        )}
      </div>

      {withOffer(
        'description',
        <TextArea label="Description" value={part.description} onChange={set('description')} />,
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {withOffer(
          'dimensions',
          <Field label="Dimensions" mono value={part.dimensions} onChange={set('dimensions')} />,
        )}
        {withOffer(
          'materialFinish',
          <Field
            label="Material and finish"
            value={part.materialFinish}
            onChange={set('materialFinish')}
          />,
        )}
      </div>

      {/*
       * The factory's words and the club's, side by side and never run together. A member
       * deciding what to buy is weighing evidence against interpretation (story 62), and the
       * form that records them is the first place that distinction can be lost.
       */}
      <fieldset className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <legend className="sr-only">Notes</legend>
        {withOffer(
          'catalogNote',
          <TextArea
            label="Catalog note"
            hint="Transcribed from the factory catalog, in its words. Nobody will improve it later."
            value={part.catalogNote}
            onChange={set('catalogNote')}
          />,
        )}
        {withOffer(
          'note',
          <TextArea
            label="The club's note"
            hint="What we have established. Kept apart from the factory's own text, always."
            value={part.note}
            onChange={set('note')}
          />,
        )}
      </fieldset>
    </>
  );
}
