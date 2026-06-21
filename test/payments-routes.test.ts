import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments", () => ({
  createPayment: vi.fn(),
  fetchPaymentById: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    PUBLIC_APP_URL: "http://localhost:3000",
    DEFAULT_PAYOUT_ADDRESS: undefined as string | undefined,
  })),
}));

import { getEnv } from "@/lib/env";
import { createPayment, fetchPaymentById } from "@/lib/payments";
import { GET as paymentGET } from "@/app/api/payments/[id]/route";
import { POST as createPOST } from "@/app/api/payments/route";

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEnv).mockReturnValue({
    PUBLIC_APP_URL: "http://localhost:3000",
    DEFAULT_PAYOUT_ADDRESS: undefined,
  } as ReturnType<typeof getEnv>);
});

describe("POST /api/payments", () => {
  it("creates a payment and returns CreatePaymentView with a ref'd callback", async () => {
    vi.mocked(createPayment).mockResolvedValue({
      ok: true,
      data: {
        ref: "x",
        addressIn: "0xAbc",
        callbackUrl: "http://localhost:3000/api/webhooks/usd1pay?ref=x",
        raw: {},
        fetchedAt: "t",
      },
    });

    const res = await createPOST(postReq({ token: "usd1", address: "0xDef" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ addressIn: "0xAbc" });

    const [args, ref, callbackUrl] = vi.mocked(createPayment).mock.calls[0];
    expect(args).toMatchObject({ token: "usd1", address: "0xDef" });
    expect(ref).toBeTruthy();
    expect(callbackUrl).toBe(
      `http://localhost:3000/api/webhooks/usd1pay?ref=${ref}`,
    );
  });

  it("propagates a gateway business error (kind gateway, 502)", async () => {
    vi.mocked(createPayment).mockResolvedValue({
      ok: false,
      httpStatus: 502,
      error: { kind: "gateway", message: "Unsupported ticker" },
    });
    const res = await createPOST(postReq({ token: "usd1", address: "0xDef" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "gateway" },
    });
  });

  it("rejects when no address and no DEFAULT_PAYOUT_ADDRESS", async () => {
    const res = await createPOST(postReq({ token: "usd1" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "config" },
    });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("falls back to DEFAULT_PAYOUT_ADDRESS when address omitted", async () => {
    vi.mocked(getEnv).mockReturnValue({
      PUBLIC_APP_URL: "http://localhost:3000",
      DEFAULT_PAYOUT_ADDRESS: "0xFromEnv",
    } as ReturnType<typeof getEnv>);
    vi.mocked(createPayment).mockResolvedValue({
      ok: true,
      data: {
        ref: "x",
        addressIn: "0xAbc",
        callbackUrl: "http://localhost:3000/api/webhooks/usd1pay?ref=x",
        raw: {},
        fetchedAt: "t",
      },
    });
    const res = await createPOST(postReq({ token: "usdt" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(createPayment).mock.calls[0][0]).toMatchObject({
      address: "0xFromEnv",
    });
  });

  it("rejects an invalid token", async () => {
    const res = await createPOST(postReq({ token: "btc", address: "0xDef" }));
    expect(res.status).toBe(400);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("appends the bypass token to the callback URL when configured", async () => {
    vi.mocked(getEnv).mockReturnValue({
      PUBLIC_APP_URL: "https://app.example.com",
      DEFAULT_PAYOUT_ADDRESS: undefined,
      VERCEL_AUTOMATION_BYPASS_SECRET: "byp",
    } as ReturnType<typeof getEnv>);
    vi.mocked(createPayment).mockResolvedValue({
      ok: true,
      data: {
        ref: "x",
        addressIn: "0xAbc",
        callbackUrl: "u",
        raw: {},
        fetchedAt: "t",
      },
    });

    await createPOST(postReq({ token: "usd1", address: "0xDef" }));
    const callbackUrl = vi.mocked(createPayment).mock.calls[0][2] as string;
    const u = new URL(callbackUrl);
    expect(u.origin + u.pathname).toBe(
      "https://app.example.com/api/webhooks/usd1pay",
    );
    expect(u.searchParams.get("x-vercel-protection-bypass")).toBe("byp");
    expect(u.searchParams.get("ref")).toBeTruthy();
  });
});

describe("GET /api/payments/[id]", () => {
  it("returns the normalized PaymentView on success", async () => {
    vi.mocked(fetchPaymentById).mockResolvedValue({
      ok: true,
      data: {
        id: "uuid-1",
        status: "COMPLETED",
        amountReceived: "10",
        raw: {},
        fetchedAt: "t",
        txHashIn: null,
        txHashOut: null,
      },
    });
    const res = await paymentGET(
      new Request("http://localhost/api/payments/uuid-1"),
      {
        params: Promise.resolve({ id: "uuid-1" }),
      },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "COMPLETED" });
    expect(fetchPaymentById).toHaveBeenCalledWith("uuid-1");
  });

  it("propagates an upstream error status", async () => {
    vi.mocked(fetchPaymentById).mockResolvedValue({
      ok: false,
      httpStatus: 502,
      error: {
        kind: "upstream",
        message: "Gateway responded 404",
        status: 404,
      },
    });
    const res = await paymentGET(
      new Request("http://localhost/api/payments/missing"),
      {
        params: Promise.resolve({ id: "missing" }),
      },
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "upstream", status: 404 },
    });
  });
});
