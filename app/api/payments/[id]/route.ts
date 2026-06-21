import { NextResponse } from "next/server";

import { fetchPaymentById } from "@/lib/payments";

/**
 * GET /api/payments/[id] — proxy to the gateway's GET /api/v1/payments/{id}.
 *
 * Returns a normalized PaymentView (amounts in coin units) on success, or the
 * normalized ApiError + HTTP status on failure.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await fetchPaymentById(id);

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
