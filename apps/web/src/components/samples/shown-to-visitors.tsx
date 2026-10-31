import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '@/lib/api';

/**
 * **What the public sees of the archive** (ADR 0019): every Tavola shown to Visitors and the one
 * number each has open, in the order they were first shown. An Administrator's, on the page an
 * Administrator starts from, so what is public is never more than a glance away.
 *
 * A plain list and not a gallery: the drawings are the archive's hero on their own pages, and
 * here each line is only the way to one.
 */
export function ShownToVisitors({ className }: { className?: string }) {
  const { data } = useQuery({ queryKey: ['samples'], queryFn: api.samples });

  if (!data) {
    return null;
  }

  return (
    <section aria-labelledby="shown-to-visitors" className={className} data-testid="samples">
      <h2 id="shown-to-visitors" className="label">
        Shown to Visitors
      </h2>
      {data.samples.length === 0 ? (
        <p className="mt-4 max-w-measure text-pretty text-faint">
          No drawing is shown to Visitors yet. Open a Published drawing to show it.
        </p>
      ) : (
        <ul className="mt-4 border-t border-line">
          {data.samples.map((sample) => (
            <li key={sample.tavola.id} className="border-b border-line">
              <Link
                to="/tavole/$tavolaId"
                params={{ tavolaId: sample.tavola.id }}
                className="flex min-h-control items-baseline justify-between gap-6 py-3 hover:text-accent-ink"
                data-testid="sample"
              >
                <span>
                  {sample.tavola.model.brand} {sample.tavola.model.name}, Tavola{' '}
                  <span className="tabular">{sample.tavola.number}</span>
                  <span className="block text-sm text-muted">{sample.tavola.nameEn}</span>
                </span>
                <span className="shrink-0 text-sm text-muted">
                  Number <span className="tabular text-text">{sample.open.number}</span> open
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
