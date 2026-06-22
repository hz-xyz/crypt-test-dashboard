import "server-only";

import crypto from "node:crypto";

import { gatewayFetch, type GatewayResult } from "./gateway";
import type {
  CreatePaymentView,
  PaymentListItem,
  PaymentListView,
  PaymentToken,
  PaymentView,
} from "./types";

/**
 * Server-only client for the R5 test-payment console.
 *
 * Wraps the gateway's CryptAPI-style payment endpoints (create / query-by-id /
 * pubkey) and the RSA-SHA256 webhook signature verification. Reuses the shared
 * `gatewayFetch` (token/timeout/error-normalization) from lib/gateway.ts.
 *
 * Contract reference: usd1pay/docs/payment-callback-integration-guide.md.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Convert an 18-decimal wei-style integer string to a coin-unit string.
 * Pure string math to avoid Number precision loss. Non-integer input passes
 * through unchanged (defensive).
 */
export function weiToCoin(wei: string, decimals = 18): string {
  if (!/^\d+$/.test(wei)) return wei;
  const padded = wei.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  const intPart = padded.slice(0, cut).replace(/^0+(?=\d)/, "");
  const fracPart = padded.slice(cut).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function coinAmount(v: unknown): string | undefined {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  return weiToCoin(v.trim());
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/** Normalize the create response into CreatePaymentView. */
export function normalizeCreate(
  raw: unknown,
  ref: string,
  callbackUrl: string,
): CreatePaymentView {
  const fetchedAt = new Date().toISOString();
  const obj =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const addressIn = asString(pick(obj, ["address_in", "addressIn"])) ?? "";
  return { ref, addressIn, callbackUrl, raw, fetchedAt };
}

/** Normalize the query-by-id response into PaymentView (amounts -> coin units). */
export function normalizePayment(raw: unknown): PaymentView {
  const fetchedAt = new Date().toISOString();
  const obj =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  const status = asString(pick(obj, ["status"])) ?? "UNKNOWN";

  return {
    id: asString(pick(obj, ["id", "uuid"])) ?? "",
    token: asString(pick(obj, ["token", "coin"])),
    addressIn: asString(pick(obj, ["address_in", "addressIn"])),
    status,
    amountReceived: coinAmount(
      pick(obj, ["amount_received", "amountReceived"]),
    ),
    fee: coinAmount(pick(obj, ["fee"])),
    txHashIn:
      asString(pick(obj, ["tx_hash_in", "txHashIn", "txid_in"])) ?? null,
    txHashOut:
      asString(pick(obj, ["tx_hash_out", "txHashOut", "txid_out"])) ?? null,
    createdAt: asString(pick(obj, ["created_at", "createdAt"])),
    updatedAt: asString(pick(obj, ["updated_at", "updatedAt"])),
    raw,
    fetchedAt,
  };
}

/** Pull the payment UUID out of a callback body, if present. */
export function extractCallbackUuid(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  return asString((body as Record<string, unknown>).uuid);
}

// ---------------------------------------------------------------------------
// Gateway calls
// ---------------------------------------------------------------------------

interface CreateArgs {
  token: PaymentToken;
  address: string;
  confirmations?: number;
  pending?: boolean;
}

/**
 * Create a test payment via the gateway. The caller supplies the correlation
 * `ref` and the absolute `callbackUrl` (which embeds that ref). Business errors
 * come back as HTTP 200 with `status:"error"`, surfaced here as kind "gateway".
 */
export async function createPayment(
  args: CreateArgs,
  ref: string,
  callbackUrl: string,
): Promise<GatewayResult<CreatePaymentView>> {
  const params = new URLSearchParams({
    callback: callbackUrl,
    address: args.address,
  });
  if (args.confirmations !== undefined) {
    params.set("confirmations", String(args.confirmations));
  }
  if (args.pending) params.set("pending", "1");

  const res = await gatewayFetch(
    `/bep20/${args.token}/create/?${params.toString()}`,
  );
  if (!res.ok) return res;

  const data = res.data;
  if (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).status === "error"
  ) {
    const message =
      asString((data as Record<string, unknown>).error) ??
      "Gateway rejected the payment request.";
    return { ok: false, httpStatus: 502, error: { kind: "gateway", message } };
  }

  return { ok: true, data: normalizeCreate(data, ref, callbackUrl) };
}

// ---------------------------------------------------------------------------
// Payment list (R2)
// ---------------------------------------------------------------------------

/** Normalize a single payment item from the list. Amounts -> coin units. */
function normalizeListItem(raw: unknown): PaymentListItem | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const id = asString(pick(obj, ["id", "uuid"]));
  if (!id) return undefined;

  return {
    id,
    token: asString(pick(obj, ["token", "coin"])),
    addressIn: asString(pick(obj, ["address_in", "addressIn"])),
    status: asString(pick(obj, ["status"])) ?? "UNKNOWN",
    amountReceived: coinAmount(
      pick(obj, ["amount_received", "amountReceived"]),
    ),
    fee: coinAmount(pick(obj, ["fee"])),
    txHashIn:
      asString(pick(obj, ["tx_hash_in", "txHashIn", "txid_in"])) ?? null,
    txHashOut:
      asString(pick(obj, ["tx_hash_out", "txHashOut", "txid_out"])) ?? null,
    createdAt: asString(pick(obj, ["created_at", "createdAt"])),
    updatedAt: asString(pick(obj, ["updated_at", "updatedAt"])),
  };
}

/**
 * Normalize the payments list response. Handles:
 * 1. Plain array: [ { id, status, ... }, ... ]
 * 2. Wrapped: { data: [...], total: N } or { payments: [...], total: N }
 */
export function normalizePaymentList(raw: unknown): PaymentListView {
  const fetchedAt = new Date().toISOString();
  const base: PaymentListView = { items: [], raw, fetchedAt };

  if (Array.isArray(raw)) {
    base.items = raw
      .map(normalizeListItem)
      .filter((x): x is PaymentListItem => x !== undefined);
    base.total = base.items.length;
    return base;
  }

  if (typeof raw !== "object" || raw === null) return base;

  const obj = raw as Record<string, unknown>;
  const list = pick(obj, ["data", "payments", "items", "results"]);
  if (Array.isArray(list)) {
    base.items = list
      .map(normalizeListItem)
      .filter((x): x is PaymentListItem => x !== undefined);
  }

  const total = pick(obj, ["total", "count", "totalCount", "total_count"]);
  if (typeof total === "number" && Number.isFinite(total)) {
    base.total = total;
  } else {
    base.total = base.items.length;
  }

  return base;
}

/** Fetch recent payments from the gateway. */
export async function fetchPayments(
  limit = 20,
  offset = 0,
): Promise<GatewayResult<PaymentListView>> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await gatewayFetch(`/api/v1/payments?${params.toString()}`);
  if (!res.ok) return res;
  return { ok: true, data: normalizePaymentList(res.data) };
}

/** Query a single payment by id (uuid). */
export async function fetchPaymentById(
  id: string,
): Promise<GatewayResult<PaymentView>> {
  const res = await gatewayFetch(`/api/v1/payments/${encodeURIComponent(id)}`);
  if (!res.ok) return res;
  return { ok: true, data: normalizePayment(res.data) };
}

// ---------------------------------------------------------------------------
// Signature verification (RSA-SHA256 over raw callback bytes)
// ---------------------------------------------------------------------------

let pubkeyCache: string | null = null;

/** Fetch and cache the gateway's RSA public key (PEM) from GET /pubkey/. */
export async function fetchPubkey(): Promise<string> {
  if (pubkeyCache) return pubkeyCache;
  const res = await gatewayFetch("/pubkey/");
  if (!res.ok)
    throw new Error(`Could not fetch gateway pubkey: ${res.error.message}`);
  const pem = typeof res.data === "string" ? res.data : String(res.data);
  pubkeyCache = pem;
  return pem;
}

/** Test-only: clear the cached public key. */
export function __resetPubkeyCacheForTest(): void {
  pubkeyCache = null;
}

/**
 * Verify an `x-ca-signature` (base64 RSA-SHA256) against the RAW callback bytes
 * using the gateway's public key. Returns false (never throws) on any error.
 */
export function verifyCallbackSignature(
  rawBody: Buffer,
  signatureB64: string,
  pubkeyPem: string,
): boolean {
  try {
    return crypto.verify(
      "sha256",
      rawBody,
      pubkeyPem,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}
