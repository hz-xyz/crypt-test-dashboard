import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HealthView } from "@/lib/types";

/** A single labelled metric row inside the health panel. */
function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card/40 p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-lg font-semibold tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

function fmt(n?: number): string {
  return n === undefined ? "—" : n.toLocaleString();
}

/** Classify block lag into a tone. Thresholds are conservative defaults. */
function lagTone(lag?: number): "default" | "warning" | "danger" {
  if (lag === undefined) return "default";
  if (lag > 50) return "danger";
  if (lag > 10) return "warning";
  return "default";
}

export function HealthPanel({
  health,
  isLoading,
}: {
  health?: HealthView;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>网关健康度</CardTitle>
        {isLoading && !health ? (
          <Skeleton className="h-6 w-16 rounded-full" />
        ) : (
          <UpDownPill up={health?.up ?? false} />
        )}
      </CardHeader>
      <CardContent>
        {isLoading && !health ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="getLogs 策略"
              value={health?.getLogsStrategy ?? "—"}
              hint="per-address / bulk"
            />
            <Metric
              label="区块游标差距 (lag)"
              value={fmt(health?.blockLag)}
              tone={lagTone(health?.blockLag)}
              hint={
                health?.lastProcessedBlock !== undefined ||
                health?.chainHead !== undefined
                  ? `已处理 ${fmt(health?.lastProcessedBlock)} / 链高 ${fmt(
                      health?.chainHead,
                    )}`
                  : "last_processed_block vs chain head"
              }
            />
            <Metric
              label="Watch set 大小"
              value={fmt(health?.watchSetSize)}
              hint="监听地址数"
            />
            <Metric
              label="状态"
              value={health?.statusText ?? (health?.up ? "up" : "down")}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpDownPill({ up }: { up: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        up
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          up ? "bg-emerald-500" : "bg-red-500",
        )}
      />
      {up ? "UP" : "DOWN"}
    </span>
  );
}
