import { useId } from 'react';
import { Field } from '@/components/ui/field';

/**
 * **The two fields a Listing has besides where it sits**, written out once.
 *
 * Recording a Part and correcting where it sits ask exactly the same two questions, in the same
 * words, and they were the obvious thing to write twice — which is how the sentence explaining
 * *drawn* drifts until the form that records a fixing and the form that fixes one are telling an
 * Editor different things about the same flag.
 *
 * That sentence is the reason this is written out at all rather than left as a checkbox labelled
 * "Drawn". Several **drawn** Parts at a Position are alternatives, fitted instead of one another;
 * the **undrawn** ones sharing it are the screws and washers needed as well. A member who reads
 * that the wrong way round orders one bolt when they needed a caliper and three, so the flag is
 * spelled out in the words of the thing rather than left as a term to remember.
 */
export function ListingFields({
  quantity,
  drawn,
  onQuantity,
  onDrawn,
  quantityHint,
}: {
  quantity: string;
  drawn: boolean;
  onQuantity: (quantity: string) => void;
  onDrawn: (drawn: boolean) => void;
  quantityHint: string;
}) {
  const drawnId = useId();

  return (
    <>
      <Field
        label="Quantity per car"
        mono
        type="number"
        min={1}
        inputMode="numeric"
        data-testid="listing-quantity"
        hint={quantityHint}
        value={quantity}
        onChange={(event) => onQuantity(event.target.value)}
      />

      <label
        htmlFor={drawnId}
        className="flex max-w-measure items-start gap-3 text-sm text-pretty text-muted"
      >
        <input
          id={drawnId}
          type="checkbox"
          data-testid="listing-drawn"
          checked={drawn}
          onChange={(event) => onDrawn(event.target.checked)}
          className="mt-1 size-5 accent-accent"
        />
        <span>
          The position's number points at this part. Clear it for a screw, washer or clip that
          shares the position but is not on the drawing.
        </span>
      </label>
    </>
  );
}
