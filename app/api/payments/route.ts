import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { createPayment, fetchPayments } from "@/lib/payments";
import { PAYMENT_TOKENS, type CreatePaymentInput } from "@/lib/types";

/**
 * GET  /api/payments — list recent payments (R2, proxies GET /api/v1/payments).
 * POST /api/payments — create a test payment via the gateway (R5 console).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit")) || 20),
    100,
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const result = await fetchPayments(limit, offset);

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

export async function POST(request: Request) {
  let input: Partial<CreatePaymentInput>;
  try {
    input = (await request.json()) as Partial<CreatePaymentInput>;
  } catch {
    return NextResponse.json(
      { error: { kind: "parse", message: "请求体必须是 JSON。" } },
      { status: 400 },
    );
  }

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (e) {
    return NextResponse.json(
      {
        error: {
          kind: "config",
          message:
            e instanceof Error ? e.message : "Invalid server configuration.",
        },
      },
      { status: 500 },
    );
  }

  const token = input.token;
  if (!token || !PAYMENT_TOKENS.includes(token)) {
    return NextResponse.json(
      {
        error: { kind: "config", message: "token 必须是 usd1 / usdt / usdc。" },
      },
      { status: 400 },
    );
  }

  const address =
    (typeof input.address === "string" && input.address.trim()) ||
    env.DEFAULT_PAYOUT_ADDRESS;
  if (!address) {
    return NextResponse.json(
      {
        error: {
          kind: "config",
          message: "未提供转出地址,且未配置 DEFAULT_PAYOUT_ADDRESS。",
        },
      },
      { status: 400 },
    );
  }

  const ref = crypto.randomUUID();
  // Build the callback URL; when running behind Vercel Deployment Protection,
  // append the automation bypass token so the gateway's POST is not 401'd.
  const params = new URLSearchParams({ ref });
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    params.set(
      "x-vercel-protection-bypass",
      env.VERCEL_AUTOMATION_BYPASS_SECRET,
    );
  }
  const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?${params.toString()}`;

  const result = await createPayment(
    {
      token,
      address,
      confirmations: input.confirmations,
      pending: input.pending,
    },
    ref,
    callbackUrl,
  );

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
