"use client";

import Link from "next/link";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { createPayment } from "@/lib/api-client";
import type { CreatePaymentInput, CreatePaymentView } from "@/lib/types";

import { CreatePaymentForm } from "./create-payment-form";
import { PaymentTracker } from "./payment-tracker";

/**
 * Operator console: fire a test payment, then track its create → callback →
 * settle lifecycle. Each successful create replaces the active tracker.
 */
export function Console({
  defaultPayoutAddress,
}: {
  defaultPayoutAddress?: string;
}) {
  const [created, setCreated] = useState<CreatePaymentView | null>(null);

  const create = useMutation({
    mutationFn: (input: CreatePaymentInput) => createPayment(input),
    onSuccess: (data) => setCreated(data),
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            USD1Pay · 发起测试支付
          </h1>
          <p className="text-sm text-muted-foreground">
            发起一笔测试支付 → 向收款地址转测试币 → 观察回调与权威终态
          </p>
        </div>
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          ← 返回监控盘
        </Link>
      </header>

      <CreatePaymentForm
        defaultPayoutAddress={defaultPayoutAddress}
        isPending={create.isPending}
        error={create.isError ? create.error : null}
        onSubmit={(input) => create.mutate(input)}
      />

      {created ? <PaymentTracker created={created} /> : null}
    </div>
  );
}
