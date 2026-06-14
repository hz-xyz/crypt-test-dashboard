"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Render a live "updated Ns ago" label from a timestamp (ms). */
export function LastRefreshed({
  updatedAt,
  isFetching,
  className,
}: {
  updatedAt: number;
  isFetching: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isFetching ? "animate-pulse bg-sky-500" : "bg-muted-foreground/40",
        )}
      />
      {isFetching
        ? "刷新中…"
        : seconds === null
          ? "尚未刷新"
          : `${seconds}s 前刷新`}
    </span>
  );
}
