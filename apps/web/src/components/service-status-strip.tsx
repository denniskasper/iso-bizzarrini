import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Proof, in the smallest type on the page, that the browser reached the API and the API
 * reached the database. Plain and dense — a tool, not a feature. It reports which environment
 * the *API* believes it is; the banner is stamped on the document instead, so that it does not
 * depend on a request coming back.
 */
export function ServiceStatusStrip() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['service-status'],
    queryFn: api.status,
    refetchInterval: 60_000,
  });

  return (
    <dl
      data-testid="service-status"
      aria-label="Service status"
      className="tag flex flex-wrap items-baseline gap-x-8 gap-y-2"
    >
      <Entry label="Environment" value={isError ? 'unreachable' : (data?.environment ?? '—')} />
      <Entry label="Database" value={isError ? 'unreachable' : (data?.database ?? '—')} />
      <Entry
        label="Server time"
        value={
          isPending || isError
            ? '—'
            : new Date(data.time).toISOString().replace('T', ' ').slice(0, 19)
        }
      />
    </dl>
  );
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt>{label}</dt>
      <dd className="tabular text-xs tracking-normal text-muted normal-case">{value}</dd>
    </div>
  );
}
