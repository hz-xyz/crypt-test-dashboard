import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";

const KIND_LABEL: Record<string, string> = {
  timeout: "网关响应超时",
  network: "无法连接网关",
  upstream: "网关返回错误",
  parse: "网关响应解析失败",
  config: "服务端配置缺失",
};

/**
 * Loud, explicit error state. NEVER fail silently — surface the kind, the
 * upstream status (if any), and a retry action.
 */
export function ErrorBanner({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const kind = error instanceof ApiClientError ? error.kind : "network";
  const message =
    error instanceof Error ? error.message : "未知错误。";
  const status =
    error instanceof ApiClientError ? error.status : undefined;
  const label = KIND_LABEL[kind] ?? "请求失败";

  return (
    <Card className="border-red-300 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
              {title} · {label}
            </span>
            {status ? (
              <span className="rounded bg-red-200/60 px-1.5 py-0.5 font-mono text-xs text-red-800 dark:bg-red-900/50 dark:text-red-200">
                HTTP {status}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-red-700/80 dark:text-red-300/80">
            {message}
          </p>
        </div>
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            重试
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
