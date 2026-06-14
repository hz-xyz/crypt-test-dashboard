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
  /** Admin/bearer token for privileged gateway endpoints. */
  GATEWAY_ADMIN_TOKEN: string;
  /** Per-request timeout to the gateway, in milliseconds. Default 5000. */
  GATEWAY_TIMEOUT_MS: number;
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

  const GATEWAY_ADMIN_TOKEN = process.env.GATEWAY_ADMIN_TOKEN?.trim();
  if (!GATEWAY_ADMIN_TOKEN) missing.push("GATEWAY_ADMIN_TOKEN");

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

  return {
    GATEWAY_BASE_URL: baseUrl,
    GATEWAY_ADMIN_TOKEN: GATEWAY_ADMIN_TOKEN!,
    GATEWAY_TIMEOUT_MS,
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
