import { getEnv } from "@/lib/env";

/**
 * GET /api/payments/[id]/events — SSE proxy to the gateway's
 * GET /api/v1/payments/:id/events stream (R2).
 *
 * Streams Server-Sent Events back to the browser. The gateway address and
 * token never leave the server; the browser only sees this proxy URL.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: {
          kind: "config",
          message:
            e instanceof Error ? e.message : "Invalid server configuration.",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = `${env.GATEWAY_BASE_URL}/api/v1/payments/${encodeURIComponent(id)}/events`;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (env.GATEWAY_ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${env.GATEWAY_ADMIN_TOKEN}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    env.GATEWAY_TIMEOUT_MS * 60,
  );

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({
        error: {
          kind: isAbort ? "timeout" : "network",
          message:
            e instanceof Error
              ? e.message
              : "Could not reach gateway SSE endpoint.",
        },
      }),
      { status: 504, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!upstream.ok) {
    clearTimeout(timer);
    return new Response(
      JSON.stringify({
        error: {
          kind: "upstream",
          message: `Gateway responded ${upstream.status} ${upstream.statusText}`.trim(),
          status: upstream.status,
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!upstream.body) {
    clearTimeout(timer);
    return new Response(
      JSON.stringify({
        error: { kind: "upstream", message: "Gateway returned no SSE body." },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const readable = upstream.body.pipeThrough(new TextDecoderStream());
  const reader = readable.getReader();
  const passthrough = new TransformStream<string, string>();
  const writer = passthrough.writable.getWriter();

  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch {
      // Upstream closed or client disconnected.
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
      await writer.close().catch(() => {});
    }
  })();

  return new Response(
    passthrough.readable.pipeThrough(new TextEncoderStream()),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    },
  );
}
