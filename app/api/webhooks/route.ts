import { NextResponse } from "next/server";

import { listByRef, listRecent } from "@/lib/callback-store";

/**
 * GET /api/webhooks?ref=... — read recently captured gateway callbacks.
 *
 * The console polls this to discover when a callback (carrying the payment
 * uuid) has arrived. With `ref`, returns that payment's callbacks; without,
 * the most recent across all refs. Newest-first.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref");
  const records = ref ? listByRef(ref) : listRecent();

  return NextResponse.json(records, {
    headers: { "Cache-Control": "no-store" },
  });
}
