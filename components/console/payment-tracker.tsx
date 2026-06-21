"use client";

import { useQuery } from "@tanstack/react-query";

import { ErrorBanner } from "@/components/dashboard/error-banner";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetchCallbacks, fetchPayment } from "@/lib/api-client";
import type { CreatePaymentView } from "@/lib/types";

import { CallbackLog } from "./callback-log";

const POLL_MS = 4_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "EXPIRED"]);

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(value)}
        title="点击复制"
        className="w-fit max-w-full truncate rounded bg-muted px-2 py-1 text-left font-mono text-xs hover:bg-muted/70"
      >
        {value}
      </button>
    </div>
  );
}

/**
 * Track one payment: poll captured callbacks by ref; once a callback yields a
 * uuid, poll the authoritative payment record until it reaches a terminal state.
 */
export function PaymentTracker({ created }: { created: CreatePaymentView }) {
  const callbacks = useQuery({
    queryKey: ["callbacks", created.ref],
    queryFn: () => fetchCallbacks(created.ref),
    refetchInterval: POLL_MS,
  });

  const uuid = callbacks.data?.find((c) => c.uuid)?.uuid;

  const payment = useQuery({
    queryKey: ["payment", uuid],
    queryFn: () => fetchPayment(uuid as string),
    enabled: Boolean(uuid),
    refetchInterval: (query) =>
      TERMINAL.has(query.state.data?.status ?? "") ? false : POLL_MS,
  });

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              本次支付
            </h2>
            {payment.data ? (
              <StatusBadge status={payment.data.status} />
            ) : (
              <span className="text-xs text-muted-foreground">
                等待回调以获取 uuid…
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CopyableField
              label="收款地址 address_in"
              value={created.addressIn}
            />
            <CopyableField label="关联 ref" value={created.ref} />
          </div>

          <p className="text-xs text-muted-foreground">
            向上面的<strong>收款地址</strong>
            转入对应测试币;网关确认后会回调本站。
          </p>

          {payment.data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="到账金额" value={payment.data.amountReceived} />
              <Metric label="手续费" value={payment.data.fee} />
              <Metric
                label="入账 txid"
                value={payment.data.txHashIn ?? undefined}
                mono
              />
              <Metric
                label="转出 txid"
                value={payment.data.txHashOut ?? undefined}
                mono
              />
            </div>
          ) : null}

          {payment.isError ? (
            <ErrorBanner
              title="查询支付"
              error={payment.error}
              onRetry={() => void payment.refetch()}
            />
          ) : null}
        </CardContent>
      </Card>

      {callbacks.isError ? (
        <ErrorBanner
          title="读取回调"
          error={callbacks.error}
          onRetry={() => void callbacks.refetch()}
        />
      ) : (
        <CallbackLog records={callbacks.data ?? []} />
      )}
    </section>
  );
}

function Metric({
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
      <span className={`truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}
