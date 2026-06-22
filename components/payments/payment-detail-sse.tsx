"use client";

import { useCallback, useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { ErrorBanner } from "@/components/dashboard/error-banner";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPayment, subscribePaymentEvents } from "@/lib/api-client";

import { StatusProgress } from "./status-progress";

const TERMINAL = new Set(["COMPLETED", "FAILED", "EXPIRED"]);
const POLL_MS = 4_000;

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
  receivedAt: string;
}

type SseStatus = "connected" | "disconnected" | "error";

function useSseSubscription(
  paymentId: string,
  isTerminal: boolean,
  onRefetch: () => void,
) {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [sseError, setSseError] = useState(false);

  const handleEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      setEvents((prev) => [
        { event, data, receivedAt: new Date().toISOString() },
        ...prev.slice(0, 49),
      ]);
      if (data.status) onRefetch();
    },
    [onRefetch],
  );

  useEffect(() => {
    if (isTerminal) return;

    const cleanup = subscribePaymentEvents(paymentId, handleEvent, () => {
      setSseError(true);
    });

    return () => {
      cleanup();
    };
  }, [paymentId, isTerminal, handleEvent]);

  const sseStatus: SseStatus = isTerminal
    ? "disconnected"
    : sseError
      ? "error"
      : "connected";

  return { events, sseStatus };
}

export function PaymentDetailSse({ paymentId }: { paymentId: string }) {
  const payment = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => fetchPayment(paymentId),
    refetchInterval: (query) =>
      TERMINAL.has(query.state.data?.status ?? "") ? false : POLL_MS,
  });

  const isTerminal = TERMINAL.has(payment.data?.status ?? "");
  const doRefetch = useCallback(() => void payment.refetch(), [payment]);

  const { events, sseStatus } = useSseSubscription(
    paymentId,
    isTerminal,
    doRefetch,
  );

  if (payment.isLoading && !payment.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  if (payment.isError) {
    return (
      <ErrorBanner
        title="支付详情"
        error={payment.error}
        onRetry={() => void payment.refetch()}
      />
    );
  }

  const p = payment.data;
  if (!p) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              支付状态
            </h2>
            <div className="flex items-center gap-2">
              <SseIndicator status={sseStatus} />
              <StatusBadge status={p.status} />
            </div>
          </div>

          <StatusProgress status={p.status} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="ID" value={p.id} mono />
            <Field label="Token" value={p.token?.toUpperCase()} />
            <Field label="到账金额" value={p.amountReceived} />
            <Field label="手续费" value={p.fee} />
            <Field label="收款地址" value={p.addressIn} mono />
            <Field label="入账 txid" value={p.txHashIn ?? undefined} mono />
            <Field label="转出 txid" value={p.txHashOut ?? undefined} mono />
            <Field
              label="创建时间"
              value={
                p.createdAt
                  ? new Date(p.createdAt).toLocaleString()
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      <SseEventLog events={events} />
    </div>
  );
}

function SseIndicator({ status }: { status: SseStatus }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <span className="size-2 rounded-full bg-red-500" />
        SSE 断开
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
        SSE 实时
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="size-2 rounded-full bg-muted-foreground/40" />
      SSE 未连接
    </span>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`truncate text-sm ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function SseEventLog({ events }: { events: SseEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          实时事件流 ({events.length})
        </h2>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {events.map((e, i) => (
            <div
              key={`${e.receivedAt}-${i}`}
              className="flex flex-col gap-0.5 border-b border-border/40 py-1.5 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {e.event}
                </span>
                {e.data.status ? (
                  <StatusBadge status={String(e.data.status)} />
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.receivedAt).toLocaleTimeString()}
                </span>
              </div>
              <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">
                {JSON.stringify(e.data)}
              </pre>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
