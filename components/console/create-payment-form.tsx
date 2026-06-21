"use client";

import { useState, type FormEvent } from "react";

import { ErrorBanner } from "@/components/dashboard/error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PAYMENT_TOKENS,
  type CreatePaymentInput,
  type PaymentToken,
} from "@/lib/types";

const FIELD =
  "rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Form to fire a test payment. `address` defaults to the server-configured payout address. */
export function CreatePaymentForm({
  defaultPayoutAddress,
  isPending,
  error,
  onSubmit,
}: {
  defaultPayoutAddress?: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (input: CreatePaymentInput) => void;
}) {
  const [token, setToken] = useState<PaymentToken>("usd1");
  const [address, setAddress] = useState(defaultPayoutAddress ?? "");
  const [confirmations, setConfirmations] = useState("");
  const [withPending, setWithPending] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: CreatePaymentInput = { token };
    const addr = address.trim();
    if (addr) input.address = addr;
    const conf = confirmations.trim();
    if (conf) input.confirmations = Number(conf);
    if (withPending) input.pending = true;
    onSubmit(input);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">币种 token</span>
              <select
                className={FIELD}
                value={token}
                onChange={(e) => setToken(e.target.value as PaymentToken)}
              >
                {PAYMENT_TOKENS.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                转出地址 address_out
                {defaultPayoutAddress ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (默认来自 env)
                  </span>
                ) : null}
              </span>
              <input
                className={`${FIELD} font-mono`}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x… 留空则用服务端默认地址"
                spellCheck={false}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                确认数 confirmations
                <span className="ml-1 text-xs text-muted-foreground">
                  (可选, 1–1000)
                </span>
              </span>
              <input
                className={FIELD}
                value={confirmations}
                onChange={(e) => setConfirmations(e.target.value)}
                inputMode="numeric"
                placeholder="留空用链默认"
              />
            </label>

            <label className="flex items-center gap-2 self-end pb-1.5">
              <input
                type="checkbox"
                className="size-4"
                checked={withPending}
                onChange={(e) => setWithPending(e.target.checked)}
              />
              <span className="text-sm">同时请求 pending 回调</span>
            </label>
          </div>

          {error ? <ErrorBanner title="创建支付" error={error} /> : null}

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "发起中…" : "发起测试支付"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
