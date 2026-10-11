import { useQuery } from '@tanstack/react-query';
import type { ServiceStatus } from '@ricambi/contracts';
import { api } from '@/lib/api';

/**
 * Proof, in the smallest type on the page, that the browser reached the API and the API
 * reached the database. Plain and dense — a tool, not a feature. It reports which environment
 * the *API* believes it is; the banner is stamped on the document instead, so that it does not
 * depend on a request coming back.
 *
 * First, which Ricambi this is (ADR 0016): the Version, and the commit when the build was told
 * one. Plain text that links nowhere — something to read out when a problem is relayed, not an
 * announcement.
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
      <Entry label="Version" value={isError ? 'unreachable' : data ? describeBuild(data) : '—'} />
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

/** `0.4.0 · a86c067`, or `0.4.0` alone for a build that was told no commit. */
function describeBuild({ version, commit }: ServiceStatus): string {
  return commit === null ? version : `${version} · ${commit.slice(0, 7)}`;
}

function Entry({ label, value }: { label: string; value: string }) {
  return (
    // Each entry stays on one line; on a phone the strip wraps between entries, never inside one.
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <dt>{label}</dt>
      <dd className="tabular text-xs tracking-normal text-muted normal-case">{value}</dd>
    </div>
  );
}
