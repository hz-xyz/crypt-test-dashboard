import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYMENT_STATUSES, type MetricsView } from "@/lib/types";

import { StatusBadge } from "./status-badge";

/**
 * Order the status keys: known lifecycle statuses first (in canonical order),
 * then any unknown statuses the gateway reported, appended alphabetically.
 */
function orderedStatuses(counts: Record<string, number>): string[] {
  // Any status the gateway reported that isn't in our canonical list.
  const extra = Object.keys(counts)
    .filter((s) => !(PAYMENT_STATUSES as readonly string[]).includes(s))
    .sort();
  // Always show the full known set even when count is 0, so the board is stable.
  return [...PAYMENT_STATUSES, ...extra];
}

function StatCard({ status, count }: { status: string; count: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <StatusBadge status={status} />
        <span className="font-mono text-3xl font-semibold tabular-nums">
          {count.toLocaleString()}
        </span>
      </CardContent>
    </Card>
  );
}

export function StatusCounts({
  metrics,
  isLoading,
}: {
  metrics?: MetricsView;
  isLoading: boolean;
}) {
  if (isLoading && !metrics) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {PAYMENT_STATUSES.map((s) => (
          <Card key={s} className="gap-0 py-0">
            <CardContent className="flex flex-col gap-3 p-4">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-9 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const counts = metrics?.statusCounts ?? {};
  const statuses = orderedStatuses(counts);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {statuses.map((status) => (
        <StatCard key={status} status={status} count={counts[status] ?? 0} />
      ))}
    </div>
  );
}
