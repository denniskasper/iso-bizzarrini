import { Link } from '@tanstack/react-router';
import { Plate } from '@/components/plate';
import type { TavolaScan, VisitorSampleListed } from '@/lib/api';

/** The public copy in the shape the viewer and a plate draw, at one address for both sizes. */
export function sampleDrawing(sample: VisitorSampleListed): TavolaScan {
  const { url, width, height } = sample.drawing;
  return { id: url, width, height, displayUrl: url, previewUrl: url };
}

/**
 * The Samples on the landing: each drawing on its sheet, and the way to it. A gallery here, where
 * the Administrator's list is plain, because to a Visitor the drawing is what is being shown.
 */
export function SampleShelf({ samples }: { samples: VisitorSampleListed[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
      {samples.map((sample) => (
        <li key={sample.tavola.id}>
          <Link
            to="/tavole/$tavolaId"
            params={{ tavolaId: sample.tavola.id }}
            className="group block"
            data-testid="landing-sample"
          >
            <Plate
              scan={sampleDrawing(sample)}
              alt={`Tavola ${sample.tavola.number} — ${sample.tavola.nameEn}`}
              className="aspect-[4/3]"
            />
            <span className="mt-4 block text-muted">
              {sample.tavola.model.brand} {sample.tavola.model.name}, Tavola{' '}
              <span className="tabular text-text">{sample.tavola.number}</span>
            </span>
            <span className="mt-1 block text-xl font-semibold text-pretty group-hover:text-accent-ink">
              {sample.tavola.nameEn}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
