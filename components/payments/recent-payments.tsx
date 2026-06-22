"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { ErrorBanner } from "@/components/dashboard/error-banner";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPayments } from "@/lib/api-client";
import type { PaymentListItem } from "@/lib/types";

const POLL_MS = 4_000;
const LIST_LIMIT = 20;

function PaymentRow({ item }: { item: PaymentListItem }) {
  const time = item.createdAt
    ? new Date(item.createdAt).toLocaleString()
    : "—";

  return (
    <Link
      href={`/payments/${encodeURIComponent(item.id)}`}
      className="flex items-center gap-3 rounded-lg border bg-card/40 p-3 transition-colors hover:bg-muted/50"
    >
      <StatusBadge status={item.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {item.id.slice(0, 8)}…
        </span>
        {item.token ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">
            {item.token}
          </span>
        ) : null}
        {item.amountReceived ? (
          <span className="text-xs text-muted-foreground">
            收到 {item.amountReceived}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </Link>
  );
}

export function RecentPayments() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["payments", LIST_LIMIT],
    queryFn: () => fetchPayments(LIST_LIMIT),
    refetchInterval: POLL_MS,
  });

  if (isError) {
    return (
      <ErrorBanner
        title="支付列表"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            共 {data?.total ?? 0} 笔
          </span>
          <Link
            href="/payments"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            查看全部 →
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            暂无支付记录。
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <PaymentRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
