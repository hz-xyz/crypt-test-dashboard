import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PaymentDetailSse } from "@/components/payments/payment-detail-sse";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            USD1Pay · 支付详情
          </h1>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/payments"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← 支付列表
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            监控盘
          </Link>
        </div>
      </header>

      <PaymentDetailSse paymentId={id} />
    </div>
  );
}
