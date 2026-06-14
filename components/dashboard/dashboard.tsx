"use client";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchHealth, fetchMetrics } from "@/lib/api-client";

import { ErrorBanner } from "./error-banner";
import { HealthPanel } from "./health-panel";
import { LastRefreshed } from "./last-refreshed";
import { StatusCounts } from "./status-counts";

/** Polling interval for operational data (ms). */
const POLL_MS = 4_000;

export function Dashboard() {
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: fetchMetrics,
    refetchInterval: POLL_MS,
  });

  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: POLL_MS,
  });

  const lastUpdated = Math.max(metrics.dataUpdatedAt, health.dataUpdatedAt);
  const isFetching = metrics.isFetching || health.isFetching;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            USD1Pay · 测试环境监控
          </h1>
          <p className="text-sm text-muted-foreground">
            支付状态计数 + 网关健康度 · 每 {POLL_MS / 1000}s 自动轮询
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed updatedAt={lastUpdated} isFetching={isFetching} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void metrics.refetch();
              void health.refetch();
            }}
          >
            手动刷新
          </Button>
        </div>
      </header>

      {/* Metrics: status counts */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            支付状态计数
          </h2>
          {metrics.data ? (
            <span className="text-xs text-muted-foreground">
              总计{" "}
              <span className="font-mono font-semibold text-foreground">
                {metrics.data.total.toLocaleString()}
              </span>
            </span>
          ) : null}
        </div>
        {metrics.isError ? (
          <ErrorBanner
            title="/metrics"
            error={metrics.error}
            onRetry={() => void metrics.refetch()}
          />
        ) : (
          <StatusCounts metrics={metrics.data} isLoading={metrics.isLoading} />
        )}
      </section>

      {/* Health */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">健康度</h2>
        {health.isError ? (
          <ErrorBanner
            title="/health"
            error={health.error}
            onRetry={() => void health.refetch()}
          />
        ) : (
          <HealthPanel health={health.data} isLoading={health.isLoading} />
        )}
      </section>

      {/* Placeholders for not-yet-implemented panels (structure reserved). */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          后续功能(占位)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["支付流水", "Webhook 重放", "测试网余额", "发起测试支付"].map(
            (label) => (
              <Card key={label} className="border-dashed opacity-70">
                <CardContent className="flex h-20 items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground">
                    {label} · 待实现
                  </span>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
