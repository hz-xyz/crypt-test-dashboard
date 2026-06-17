import { NextResponse } from "next/server";

import { fetchInfo } from "@/lib/gateway";

/**
 * GET /api/info — proxy to the gateway's /api/v1/info.
 *
 * The browser calls THIS route; it never sees the gateway URL or token.
 * Returns a normalized InfoView (chain config) on success, or a normalized
 * ApiError with an appropriate HTTP status on failure.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchInfo();

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
