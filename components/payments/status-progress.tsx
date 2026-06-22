"use client";

import { PAYMENT_STATUSES, type StatusTone, STATUS_TONE } from "@/lib/types";

const LIFECYCLE_ORDER = PAYMENT_STATUSES;

const TONE_BG: Record<StatusTone, string> = {
  neutral: "bg-slate-300 dark:bg-slate-600",
  info: "bg-sky-400 dark:bg-sky-500",
  progress: "bg-amber-400 dark:bg-amber-500",
  success: "bg-emerald-400 dark:bg-emerald-500",
  danger: "bg-red-400 dark:bg-red-500",
  warning: "bg-orange-400 dark:bg-orange-500",
};

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: "text-slate-500 dark:text-slate-400",
  info: "text-sky-600 dark:text-sky-400",
  progress: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-orange-600 dark:text-orange-400",
};

export function StatusProgress({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const currentIdx = LIFECYCLE_ORDER.indexOf(
    upper as (typeof LIFECYCLE_ORDER)[number],
  );
  const tone: StatusTone = STATUS_TONE[upper] ?? "neutral";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-0.5">
        {LIFECYCLE_ORDER.map((s, i) => {
          const isTerminal =
            upper === "FAILED" || upper === "EXPIRED" || upper === "COMPLETED";
          const isActive = s === upper;
          const isPast = currentIdx >= 0 && i < currentIdx;
          const filled = isActive || isPast;

          let barClass = "h-1.5 flex-1 rounded-full transition-colors ";
          if (filled) {
            barClass += TONE_BG[tone];
          } else if (isTerminal) {
            barClass += "bg-muted";
          } else {
            barClass += "bg-muted";
          }

          return <div key={s} className={barClass} />;
        })}
      </div>
      <span className={`text-xs font-medium ${TONE_TEXT[tone]}`}>{upper}</span>
    </div>
  );
}
