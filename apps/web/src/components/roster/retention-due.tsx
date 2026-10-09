import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useRetentionReport, years } from '@/lib/roster';

/**
 * Who the next retention sweep would delete (ADR 0007, story 133) — **the dry run, on the
 * screen where something can still be done about it.**
 *
 * The sweep runs by itself once a day and nobody is asked. So this is not a queue to work
 * through and it has no button: it is a notice, set at the foot of the roster, that these people
 * are about to go. The one thing an Administrator can do is the thing the roster already offers
 * on every row — record a payment — which moves the date and takes them off this list.
 *
 * Silent when nobody is due, apart from one sentence saying what the rule is. An empty table
 * about deletion is not something to open the roster to every morning.
 */
export function RetentionDue() {
  const report = useRetentionReport();

  if (!report.data) {
    return null;
  }

  const { accounts, paymentRecords, retention } = report.data;

  return (
    <section className="mt-20" aria-labelledby="retention-heading">
      <h2 id="retention-heading" className="text-2xl font-semibold">
        {accounts.length === 0
          ? 'Nobody is due to be deleted'
          : accounts.length === 1
            ? '1 Account will be deleted by the next daily sweep'
            : `${accounts.length} Accounts will be deleted by the next daily sweep`}
      </h2>
      <p className="mt-4 max-w-measure text-pretty text-muted">
        An Account is kept for {years(retention.accountYears)} after its Membership runs out, so a
        member who comes back finds their history. After that it is deleted automatically, and what
        they published stays, signed “a former member”.{' '}
        {accounts.length > 0 && 'Recording a payment for somebody below keeps them.'}
      </p>
      {/* A control of its own rather than a link inside the sentence: nothing pressable here is
          shorter than a cold thumb. */}
      <Button asChild variant="link" className="px-0">
        <Link to="/privacy">What members are told</Link>
      </Button>

      {accounts.length > 0 && (
        <ul className="mt-8 border-b border-line" data-testid="retention-due">
          {accounts.map((account) => (
            <li key={account.id} className="retention-row">
              <div className="min-w-0">
                <p className="font-medium text-text">{account.name}</p>
                <p className="tabular truncate text-sm text-muted">{account.email}</p>
              </div>
              <div>
                <p className="tabular text-sm text-text">{account.paidThrough ?? '—'}</p>
                <p className="tag mt-1">paid through</p>
              </div>
              <div>
                <p className="tabular text-sm text-text">{account.keptUntil}</p>
                <p className="tag mt-1">kept until</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {paymentRecords > 0 && (
        <p className="mt-6 max-w-measure text-sm text-pretty text-muted">
          {paymentRecords === 1
            ? '1 payment record from somebody already erased has'
            : `${paymentRecords} payment records from people already erased have`}{' '}
          been kept for the full {years(retention.paymentRecordYears)} and will be deleted in the
          same sweep.
        </p>
      )}
    </section>
  );
}
