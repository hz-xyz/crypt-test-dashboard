import { record } from "@/lib/callback-store";
import {
  extractCallbackUuid,
  fetchPubkey,
  verifyCallbackSignature,
} from "@/lib/payments";

/**
 * POST /api/webhooks/usd1pay?ref=... — receive a gateway payment callback.
 *
 * The gateway signs the callback with RSA-SHA256 over the RAW body bytes
 * (`x-ca-signature`, base64). We verify against its public key, record the
 * callback in the in-memory buffer keyed by `ref`, and ALWAYS reply 200 "ok"
 * so the happy path is observable. A failed/absent signature is still recorded
 * (signatureValid: false) rather than dropped silently.
 *
 * Node runtime: needs node:crypto (via lib/payments) and raw-byte access.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  // RAW bytes — must NOT JSON.parse-then-stringify, or the signature won't match.
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-ca-signature") ?? "";

  let signatureValid = false;
  try {
    signatureValid = verifyCallbackSignature(
      raw,
      signature,
      await fetchPubkey(),
    );
  } catch {
    // Could not fetch the pubkey / verify — record as unverified, don't 500.
    signatureValid = false;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    body = raw.toString("utf8") || null;
  }

  record({
    ref,
    uuid: extractCallbackUuid(body),
    signatureValid,
    receivedAt: new Date().toISOString(),
    body,
  });

  // Gateway requires HTTP 200 + a body containing "ok", else it retries.
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
