import { dollars } from '@/lib/readings';
import { useMonthlyLimitLeft } from '@/lib/spending';

/**
 * **What is left of this month's Monthly limit** (issue #192), under the limit a run is started
 * or continued with. `room` is what the run could spend from here on its own limit, `null` until
 * one is typed. Where that is more than is left, it says so and refuses nothing: Ricambi only
 * estimates, and the provider's limit is what stops a run. Nothing is said without a Monthly
 * limit, or where the Reading method is not billed.
 */
export function MonthlyLimitLeft({ room }: { room: number | null }) {
  const { data } = useMonthlyLimitLeft();
  const left = data?.left;
  if (!left) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="monthly-limit-left">
      <p className="text-sm text-pretty text-muted">
        <span className="tabular text-text">{dollars(left.leftUsd)}</span> left of this month’s
        Monthly limit of <span className="tabular">{dollars(left.monthlyLimitUsd)}</span>.
      </p>
      {room !== null && room > left.leftUsd && (
        <p
          role="status"
          className="text-sm font-medium text-pretty text-text"
          data-testid="monthly-limit-warning"
        >
          This limit is more than is left this month. The run may stop at the Monthly limit first,
          keeping what it has read, and continue next month.
        </p>
      )}
    </div>
  );
}
