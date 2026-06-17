/**
 * Shared types for the USD1Pay test monitoring dashboard.
 *
 * These types are safe to import from BOTH client and server code.
 * They contain NO secrets and NO server-only imports.
 *
 * The shapes here are the *normalized* views the dashboard renders. The
 * Route Handlers (app/api/*) are responsible for translating whatever the
 * gateway returns into these shapes, so the frontend never has to know the
 * gateway's exact wire format.
 */

/**
 * Canonical payment lifecycle statuses, in display order.
 *
 * The gateway is the source of truth; if it reports a status we don't know
 * about, the dashboard still renders it (appended after the known ones).
 * Keep this list ordered roughly by lifecycle progression.
 */
export const PAYMENT_STATUSES = [
  "CREATED",
  "PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Visual intent for a status badge. */
export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "success"
  | "danger"
  | "warning";

export const STATUS_TONE: Record<string, StatusTone> = {
  CREATED: "neutral",
  PENDING: "info",
  CONFIRMING: "progress",
  CONFIRMED: "progress",
  COMPLETED: "success",
  FAILED: "danger",
  EXPIRED: "warning",
};

/** Normalized metrics view: a flat map of status -> count, plus a total. */
export interface MetricsView {
  /** status name -> count. May include statuses outside PAYMENT_STATUSES. */
  statusCounts: Record<string, number>;
  /** Sum of all counts. */
  total: number;
  /** ISO timestamp of when the gateway responded (server-side). */
  fetchedAt: string;
}

/** getLogs scan strategy reported by the gateway health endpoint. */
export type GetLogsStrategy = "per-address" | "bulk" | string;

/** Normalized health view. All operational fields are optional/defensive. */
export interface HealthView {
  /** Overall up/down as judged by the gateway (or HTTP success). */
  up: boolean;
  /** Raw health payload, surfaced for debugging / future fields. */
  raw: unknown;
  /** getLogs strategy: "per-address" or "bulk". */
  getLogsStrategy?: GetLogsStrategy;
  /** Last block the indexer has processed. */
  lastProcessedBlock?: number;
  /** Current chain head height. */
  chainHead?: number;
  /** chainHead - lastProcessedBlock, if both are known. */
  blockLag?: number;
  /** Number of addresses currently in the watch set. */
  watchSetSize?: number;
  /** Free-form status string from the gateway, if any (e.g. "ok"). */
  statusText?: string;
  /** ISO timestamp of when the gateway responded (server-side). */
  fetchedAt: string;
}

/** A single supported token's on-chain config. */
export interface TokenInfo {
  /** Token symbol, e.g. "USD1" / "USDT" / "USDC". */
  symbol: string;
  /** BEP-20 contract address, if reported. */
  address?: string;
  /** Token decimals, if reported. */
  decimals?: number;
  /** Per-token fee in basis points (1 bps = 0.01%), if reported. */
  feeBps?: number;
}

/**
 * Normalized chain-config view (source: gateway `GET /api/v1/info`).
 *
 * Like HealthView, every operational field is optional/defensive — the
 * gateway's `/api/v1/info` wire format is not yet frozen, so the normalizer
 * tolerates several naming conventions and always preserves `raw`.
 */
export interface InfoView {
  /** EVM chain id, e.g. 56 (BSC mainnet) / 97 (BSC testnet). */
  chainId?: number;
  /** Human-readable network name, e.g. "BSC Testnet". */
  chainName?: string;
  /** Confirmations required before a payment is considered final. */
  confirmations?: number;
  /** Supported tokens with their contract addresses. */
  tokens: TokenInfo[];
  /** Gateway-wide fee in basis points (1 bps = 0.01%), if reported. */
  feeBps?: number;
  /** Raw info payload, surfaced for debugging / future fields. */
  raw: unknown;
  /** ISO timestamp of when the gateway responded (server-side). */
  fetchedAt: string;
}

/**
 * Normalized error contract returned by every Route Handler when the gateway
 * is unreachable, times out, or responds with an error. The frontend uses
 * `kind` to render a clear, non-silent error state.
 */
export interface ApiError {
  error: {
    kind: "timeout" | "network" | "upstream" | "parse" | "config";
    message: string;
    /** Upstream HTTP status, when kind === "upstream". */
    status?: number;
  };
}

/** Type guard for the ApiError shape. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiError).error === "object"
  );
}
