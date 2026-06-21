"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { CallbackRecord } from "@/lib/types";

function SignatureBadge({ valid }: { valid: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        valid
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      }`}
    >
      {valid ? "验签通过" : "验签失败"}
    </span>
  );
}

function CallbackRow({ record }: { record: CallbackRecord }) {
  const [open, setOpen] = useState(false);
  const body = record.body as Record<string, unknown> | null;
  const pending = body?.pending;

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <SignatureBadge valid={record.signatureValid} />
        {pending === 1 || pending === "1" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            pending
          </span>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">
          {record.uuid ?? "(无 uuid)"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(record.receivedAt).toLocaleTimeString()}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {open ? "收起原始 body" : "展开原始 body"}
      </button>
      {open ? (
        <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
          {JSON.stringify(record.body, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/** Timeline of callbacks captured for this payment (newest-first). */
export function CallbackLog({ records }: { records: CallbackRecord[] }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            收到的回调
          </h2>
          <span className="text-xs text-muted-foreground">
            {records.length} 条
          </span>
        </div>
        {records.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            尚未收到回调。网关确认转出后会 POST 到本站的 webhook 接收端。
          </p>
        ) : (
          records.map((r, i) => (
            <CallbackRow key={`${r.receivedAt}-${i}`} record={r} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
