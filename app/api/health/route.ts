import { NextResponse } from "next/server";

import { fetchHealth } from "@/lib/gateway";

/**
 * GET /api/health — proxy to the gateway's /health.
 *
 * The browser calls THIS route; it never sees the gateway URL or token.
 * Returns a normalized HealthView on success, or a normalized ApiError with an
 * appropriate HTTP status on failure (502/504/500).
 */
export const dynamic = "force-dynamic"; // never statically cache operational data

export async function GET() {
  const result = await fetchHealth();

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
