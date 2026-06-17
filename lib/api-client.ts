import type { HealthView, InfoView, MetricsView } from "./types";
import { isApiError } from "./types";

/**
 * Client-safe fetchers. These hit THIS app's Route Handlers (/api/*) only.
 * They never know the gateway's address or token.
 *
 * On a normalized API error (gateway down/timeout/etc.) they throw an
 * ApiClientError carrying the structured `kind` + `message` so the UI can
 * render a clear, specific error state instead of failing silently.
 */

export class ApiClientError extends Error {
  readonly kind: string;
  readonly status?: number;
  readonly httpStatus: number;

  constructor(
    kind: string,
    message: string,
    httpStatus: number,
    status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch (e) {
    throw new ApiClientError(
      "network",
      e instanceof Error ? e.message : "Network request failed.",
      0,
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiClientError(
        "upstream",
        `Request failed (${res.status}).`,
        res.status,
      );
    }
    throw new ApiClientError(
      "parse",
      "Response was not valid JSON.",
      res.status,
    );
  }

  if (!res.ok || isApiError(body)) {
    if (isApiError(body)) {
      throw new ApiClientError(
        body.error.kind,
        body.error.message,
        res.status,
        body.error.status,
      );
    }
    throw new ApiClientError(
      "upstream",
      `Request failed (${res.status}).`,
      res.status,
    );
  }

  return body as T;
}

export function fetchHealth(): Promise<HealthView> {
  return getJson<HealthView>("/api/health");
}

export function fetchMetrics(): Promise<MetricsView> {
  return getJson<MetricsView>("/api/metrics");
}

export function fetchInfo(): Promise<InfoView> {
  return getJson<InfoView>("/api/info");
}
