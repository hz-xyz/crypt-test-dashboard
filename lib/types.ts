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
    kind: "timeout" | "network" | "upstream" | "parse" | "config" | "gateway";
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

// ---------------------------------------------------------------------------
// R5: test payment console (source: CryptAPI-style gateway endpoints).
// ---------------------------------------------------------------------------

/** Tokens the gateway accepts, lowercase as required by the create endpoint. */
export const PAYMENT_TOKENS = ["usd1", "usdt", "usdc"] as const;
export type PaymentToken = (typeof PAYMENT_TOKENS)[number];

/** Input for creating a test payment (POSTed to this app's /api/payments). */
export interface CreatePaymentInput {
  token: PaymentToken;
  /** address_out. Omit to fall back to the server's DEFAULT_PAYOUT_ADDRESS. */
  address?: string;
  /** Required confirmations, 1–1000. Omit to use the chain default. */
  confirmations?: number;
  /** Request a pending-stage callback too (needs gateway enablePendingWebhooks). */
  pending?: boolean;
}

/** Normalized result of creating a payment. */
export interface CreatePaymentView {
  /** Nonce this app generated to correlate the gateway's callback. */
  ref: string;
  /** address_in — the unique on-chain deposit address for this payment. */
  addressIn: string;
  /** The unique callback URL handed to the gateway (carries `ref`). */
  callbackUrl: string;
  /** Raw create payload, surfaced for debugging. */
  raw: unknown;
  /** ISO timestamp of when the gateway responded (server-side). */
  fetchedAt: string;
}

/**
 * Normalized single-payment view (source: gateway GET /api/v1/payments/{id}).
 * Amounts are converted from 18-decimal wei-style strings to coin-unit strings.
 */
export interface PaymentView {
  id: string;
  token?: string;
  addressIn?: string;
  /** Lifecycle status; unknown values are passed through verbatim. */
  status: string;
  /** amount_received in coin units (already divided by 10^18). */
  amountReceived?: string;
  /** fee in coin units (already divided by 10^18). */
  fee?: string;
  txHashIn?: string | null;
  txHashOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
  raw: unknown;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// R2: recent payment list + SSE real-time status.
// ---------------------------------------------------------------------------

/** A payment item in the list view (from GET /api/v1/payments). */
export interface PaymentListItem {
  id: string;
  token?: string;
  addressIn?: string;
  status: string;
  amountReceived?: string;
  fee?: string;
  txHashIn?: string | null;
  txHashOut?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Paginated list of payments. */
export interface PaymentListView {
  items: PaymentListItem[];
  total?: number;
  raw: unknown;
  fetchedAt: string;
}

/** An SSE event from the gateway's /api/v1/payments/:id/events stream. */
export interface PaymentEvent {
  event: string;
  data: Record<string, unknown>;
}

/** A callback captured from the gateway, held in the in-memory ring buffer. */
export interface CallbackRecord {
  /** Correlation nonce from the callback URL's `ref` query param. */
  ref: string;
  /** Payment UUID from the callback body, if present. */
  uuid?: string;
  /** Whether the x-ca-signature verified against the gateway's public key. */
  signatureValid: boolean;
  /** ISO timestamp of when this app received the callback. */
  receivedAt: string;
  /** Parsed callback body (raw bytes were used for signature verification). */
  body: unknown;
}
