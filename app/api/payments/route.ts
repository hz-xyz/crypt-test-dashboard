import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { createPayment } from "@/lib/payments";
import { PAYMENT_TOKENS, type CreatePaymentInput } from "@/lib/types";

/**
 * POST /api/payments — create a test payment via the gateway (R5 console).
 *
 * The browser POSTs { token, address?, confirmations?, pending? }. This route
 * mints a unique `ref` + absolute callback URL (so the gateway can call us
 * back), resolves `address` (falling back to DEFAULT_PAYOUT_ADDRESS), and
 * returns the normalized CreatePaymentView. The gateway URL/token never leave
 * the server.
 */
export const dynamic = "force-dynamic";

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
  const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?ref=${ref}`;

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
