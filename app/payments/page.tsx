import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { RecentPayments } from "@/components/payments/recent-payments";

export const dynamic = "force-dynamic";

export default function PaymentsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            USD1Pay · 支付流水
          </h1>
          <p className="text-sm text-muted-foreground">
            最近支付列表 · 点击查看详情与实时事件流
          </p>
        </div>
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          ← 返回监控盘
        </Link>
      </header>

      <RecentPayments />
    </div>
  );
}
