import "server-only";

import { getEnv } from "./env";
import type { ApiError, HealthView, MetricsView } from "./types";

/**
 * Server-only gateway client.
 *
 * The browser NEVER talks to the gateway directly. Route Handlers call these
 * helpers, which attach the admin token, enforce a timeout, and normalize both
 * success and error shapes. The gateway's real address and token never leave
 * the server.
 */

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: ApiError["error"]; httpStatus: number };
export type GatewayResult<T> = Ok<T> | Err;

/**
 * Low-level fetch to the gateway with a hard timeout and normalized errors.
 * Returns the parsed JSON (or raw text) on success.
 */
async function gatewayFetch(path: string): Promise<GatewayResult<unknown>> {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (e) {
    // Misconfiguration: surface as a 500 with a clear "config" kind.
    return {
      ok: false,
      httpStatus: 500,
      error: {
        kind: "config",
        message:
          e instanceof Error ? e.message : "Invalid server configuration.",
      },
    };
  }

  const url = `${env.GATEWAY_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.GATEWAY_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.GATEWAY_ADMIN_TOKEN}`,
      },
      signal: controller.signal,
      // Never cache operational data; we want live status.
      cache: "no-store",
    });

    const text = await res.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Keep as text; callers (e.g. Prometheus metrics) may parse it.
        body = text;
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        httpStatus: 502,
        error: {
          kind: "upstream",
          message: `Gateway responded ${res.status} ${res.statusText}`.trim(),
          status: res.status,
        },
      };
    }

    return { ok: true, data: body };
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      httpStatus: 504,
      error: isAbort
        ? {
            kind: "timeout",
            message: `Gateway did not respond within ${env.GATEWAY_TIMEOUT_MS}ms.`,
          }
        : {
            kind: "network",
            message:
              e instanceof Error
                ? `Could not reach gateway: ${e.message}`
                : "Could not reach gateway.",
          },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Normalizers: gateway wire format -> dashboard view models.
// These are deliberately defensive — fields may be missing or named slightly
// differently. We pull what we can and always keep `raw` for debugging.
// ---------------------------------------------------------------------------

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/** Pick the first defined value across several candidate keys. */
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/**
 * Normalize the /health payload into HealthView. Tolerant of a few common
 * field-naming conventions (snake_case / camelCase / nested under `indexer`).
 */
export function normalizeHealth(raw: unknown): HealthView {
  const fetchedAt = new Date().toISOString();
  const base: HealthView = { up: true, raw, fetchedAt };

  if (typeof raw !== "object" || raw === null) {
    return base;
  }

  const obj = raw as Record<string, unknown>;
  // Some gateways nest indexer state; merge a likely nested object for lookups.
  const nested =
    (obj.indexer as Record<string, unknown> | undefined) ??
    (obj.state as Record<string, unknown> | undefined) ??
    {};
  const flat: Record<string, unknown> = { ...nested, ...obj };

  const statusText =
    typeof pick(flat, ["status", "state"]) === "string"
      ? (pick(flat, ["status", "state"]) as string)
      : undefined;

  // Treat explicit healthy markers as up; otherwise default to true on 2xx.
  let up = true;
  const ok = pick(flat, ["ok", "healthy", "up"]);
  if (typeof ok === "boolean") up = ok;
  if (statusText) {
    const s = statusText.toLowerCase();
    if (["down", "unhealthy", "error", "fail", "failed"].includes(s))
      up = false;
    if (["ok", "up", "healthy", "ready"].includes(s)) up = true;
  }

  const getLogsStrategy = pick(flat, [
    "getLogsStrategy",
    "get_logs_strategy",
    "getLogs",
    "get_logs",
    "logStrategy",
    "strategy",
  ]);

  const lastProcessedBlock = asNumber(
    pick(flat, [
      "lastProcessedBlock",
      "last_processed_block",
      "cursor",
      "blockCursor",
      "block_cursor",
    ]),
  );

  const chainHead = asNumber(
    pick(flat, [
      "chainHead",
      "chain_head",
      "currentBlock",
      "current_block",
      "headBlock",
      "head_block",
      "latestBlock",
      "latest_block",
    ]),
  );

  const watchSetSize = asNumber(
    pick(flat, [
      "watchSetSize",
      "watch_set_size",
      "watchSet",
      "watch_set",
      "watchedAddresses",
      "watched_addresses",
    ]),
  );

  const blockLag =
    lastProcessedBlock !== undefined && chainHead !== undefined
      ? Math.max(0, chainHead - lastProcessedBlock)
      : undefined;

  return {
    ...base,
    up,
    statusText,
    getLogsStrategy:
      typeof getLogsStrategy === "string" ? getLogsStrategy : undefined,
    lastProcessedBlock,
    chainHead,
    blockLag,
    watchSetSize,
  };
}

/**
 * Normalize the /metrics payload into MetricsView (status -> count).
 *
 * Handles three shapes:
 *   1. JSON object of counts:        { "CREATED": 3, "COMPLETED": 10, ... }
 *   2. JSON nested under a key:       { "counts": {...} } / { "statuses": {...} }
 *   3. Prometheus text exposition:    payment_status_total{status="CREATED"} 3
 */
export function normalizeMetrics(raw: unknown): MetricsView {
  const fetchedAt = new Date().toISOString();
  const statusCounts: Record<string, number> = {};

  const addCounts = (src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      const n = asNumber(v);
      if (n !== undefined) statusCounts[k.toUpperCase()] = n;
    }
  };

  if (typeof raw === "string") {
    // Prometheus-style text: match `...{status="X"...} N` or `name_X N`.
    const lineRe = /^(?!#)(\S+?)(?:\{([^}]*)\})?\s+([0-9.eE+-]+)\s*$/;
    const statusLabelRe = /status="([^"]+)"/i;
    for (const line of raw.split("\n")) {
      const m = line.trim().match(lineRe);
      if (!m) continue;
      const [, name, labels, valueStr] = m;
      const value = Number(valueStr);
      if (!Number.isFinite(value)) continue;

      let status: string | undefined;
      const labelMatch = labels?.match(statusLabelRe);
      if (labelMatch) {
        status = labelMatch[1];
      } else if (/status|payment/i.test(name)) {
        // Fallback: `payment_status_completed_total` -> COMPLETED
        const parts = name.replace(/_total$/, "").split("_");
        status = parts[parts.length - 1];
      }
      if (status) statusCounts[status.toUpperCase()] = value;
    }
  } else if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const nested = pick(obj, [
      "counts",
      "statuses",
      "statusCounts",
      "status_counts",
      "payments",
    ]);
    if (typeof nested === "object" && nested !== null) {
      addCounts(nested as Record<string, unknown>);
    } else {
      // Treat the object itself as a flat status->count map.
      addCounts(obj);
    }
  }

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  return { statusCounts, total, fetchedAt };
}

export async function fetchHealth(): Promise<GatewayResult<HealthView>> {
  const res = await gatewayFetch("/health");
  if (!res.ok) return res;
  return { ok: true, data: normalizeHealth(res.data) };
}

export async function fetchMetrics(): Promise<GatewayResult<MetricsView>> {
  const res = await gatewayFetch("/metrics");
  if (!res.ok) return res;
  return { ok: true, data: normalizeMetrics(res.data) };
}
