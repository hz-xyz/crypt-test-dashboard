import { cn } from "@/lib/utils";
import { STATUS_TONE, type StatusTone } from "@/lib/types";

/**
 * Color classes per tone. Kept as full literal strings so Tailwind's JIT
 * scanner picks them up (no dynamic class construction).
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral:
    "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  progress:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  warning:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONE[status.toUpperCase()] ?? "neutral";
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = toneForStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {status}
    </span>
  );
}
