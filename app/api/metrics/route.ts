import { NextResponse } from "next/server";

import { fetchMetrics } from "@/lib/gateway";

/**
 * GET /api/metrics — proxy to the gateway's /metrics.
 *
 * The browser calls THIS route; it never sees the gateway URL or token.
 * Returns a normalized MetricsView (status -> count) on success, or a
 * normalized ApiError with an appropriate HTTP status on failure.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchMetrics();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
