import type {
  CallbackRecord,
  CreatePaymentInput,
  CreatePaymentView,
  HealthView,
  InfoView,
  MetricsView,
  PaymentView,
} from "./types";
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

async function parseResponse<T>(res: Response): Promise<T> {
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
  return parseResponse<T>(res);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ApiClientError(
      "network",
      e instanceof Error ? e.message : "Network request failed.",
      0,
    );
  }
  return parseResponse<T>(res);
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

// --- R5: test payment console ---------------------------------------------

export function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentView> {
  return postJson<CreatePaymentView>("/api/payments", input);
}

export function fetchPayment(id: string): Promise<PaymentView> {
  return getJson<PaymentView>(`/api/payments/${encodeURIComponent(id)}`);
}

export function fetchCallbacks(ref: string): Promise<CallbackRecord[]> {
  return getJson<CallbackRecord[]>(
    `/api/webhooks?ref=${encodeURIComponent(ref)}`,
  );
}
