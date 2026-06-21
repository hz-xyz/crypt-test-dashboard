import "server-only";

/**
 * Server-only environment configuration.
 *
 * SECURITY: This module imports "server-only", so any attempt to pull it into
 * a client bundle is a build-time error. The gateway URL and admin token live
 * ONLY here and are never serialized to the browser.
 *
 * Required variables are validated on first access; a missing required value
 * throws immediately so misconfiguration fails loud at startup rather than
 * surfacing as a confusing runtime error deep in a request.
 */

export interface Env {
  /** Base URL of the test payment gateway, e.g. https://gateway.internal:8080 */
  GATEWAY_BASE_URL: string;
  /**
   * Admin/bearer token for the gateway. Optional: only required if the gateway
   * protects its endpoints. When set, it is sent as `Authorization: Bearer`.
   */
  GATEWAY_ADMIN_TOKEN?: string;
  /** Per-request timeout to the gateway, in milliseconds. Default 5000. */
  GATEWAY_TIMEOUT_MS: number;
  /**
   * This app's own externally-reachable base URL. Used ONLY server-side to
   * build the absolute callback URL handed to the gateway (R5 payment console).
   * Must be reachable BY the gateway. Defaults to http://localhost:3000.
   * NOT secret, but NOT NEXT_PUBLIC_ — it is read on the server only.
   */
  PUBLIC_APP_URL: string;
  /**
   * Optional default payout address (address_out) for the R5 console: pre-fills
   * the create form and serves as a server-side fallback when a create request
   * omits `address`. Unset means the form field is required.
   */
  DEFAULT_PAYOUT_ADDRESS?: string;
  /**
   * Vercel "Protection Bypass for Automation" secret. When set, it is appended
   * to the gateway callback URL as `x-vercel-protection-bypass` so the gateway's
   * webhook POST passes Deployment Protection. Optional (absent locally).
   */
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
}

class MissingEnvError extends Error {
  constructor(names: string[]) {
    super(
      `[env] Missing required environment variable(s): ${names.join(", ")}.\n` +
        `Copy .env.example to .env.local and fill them in.`,
    );
    this.name = "MissingEnvError";
  }
}

function readEnv(): Env {
  const missing: string[] = [];

  const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL?.trim();
  if (!GATEWAY_BASE_URL) missing.push("GATEWAY_BASE_URL");

  // Optional: only needed when the gateway protects its endpoints. An empty or
  // unset value means we send no Authorization header at all.
  const GATEWAY_ADMIN_TOKEN =
    process.env.GATEWAY_ADMIN_TOKEN?.trim() || undefined;

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }

  const timeoutRaw = process.env.GATEWAY_TIMEOUT_MS?.trim();
  const GATEWAY_TIMEOUT_MS = timeoutRaw ? Number(timeoutRaw) : 5000;
  if (!Number.isFinite(GATEWAY_TIMEOUT_MS) || GATEWAY_TIMEOUT_MS <= 0) {
    throw new Error(
      `[env] GATEWAY_TIMEOUT_MS must be a positive number, got "${timeoutRaw}".`,
    );
  }

  // Normalize: strip a single trailing slash so path joins are predictable.
  const baseUrl = GATEWAY_BASE_URL!.replace(/\/+$/, "");

  // Our own externally-reachable base URL (for building gateway callbacks).
  // Strip trailing slashes so callback URL joins are predictable.
  const PUBLIC_APP_URL = (
    process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "");

  // Optional default payout address; empty/unset means undefined.
  const DEFAULT_PAYOUT_ADDRESS =
    process.env.DEFAULT_PAYOUT_ADDRESS?.trim() || undefined;

  const VERCEL_AUTOMATION_BYPASS_SECRET =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || undefined;

  return {
    GATEWAY_BASE_URL: baseUrl,
    GATEWAY_ADMIN_TOKEN,
    GATEWAY_TIMEOUT_MS,
    PUBLIC_APP_URL,
    DEFAULT_PAYOUT_ADDRESS,
    VERCEL_AUTOMATION_BYPASS_SECRET,
  };
}

// Lazy singleton so the validation runs once, on first server-side access.
let cached: Env | null = null;

export function getEnv(): Env {
  if (cached === null) {
    cached = readEnv();
  }
  return cached;
}
