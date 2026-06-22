import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments", () => ({
  createPayment: vi.fn(),
  fetchPaymentById: vi.fn(),
  fetchPayments: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    PUBLIC_APP_URL: "http://localhost:3000",
    DEFAULT_PAYOUT_ADDRESS: undefined as string | undefined,
  })),
}));

import { fetchPayments } from "@/lib/payments";
import { GET as paymentsGET } from "@/app/api/payments/route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/payments (list)", () => {
  it("returns the normalized PaymentListView on success", async () => {
    vi.mocked(fetchPayments).mockResolvedValue({
      ok: true,
      data: {
        items: [
          { id: "uuid-1", status: "COMPLETED" },
          { id: "uuid-2", status: "PENDING" },
        ],
        total: 2,
        raw: [],
        fetchedAt: "t",
      },
    });
    const res = await paymentsGET(new Request("http://localhost/api/payments"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(fetchPayments).toHaveBeenCalledWith(20, 0);
  });

  it("passes limit and offset from query params", async () => {
    vi.mocked(fetchPayments).mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, raw: [], fetchedAt: "t" },
    });
    await paymentsGET(
      new Request("http://localhost/api/payments?limit=5&offset=10"),
    );
    expect(fetchPayments).toHaveBeenCalledWith(5, 10);
  });

  it("clamps limit to 1–100", async () => {
    vi.mocked(fetchPayments).mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, raw: [], fetchedAt: "t" },
    });
    await paymentsGET(new Request("http://localhost/api/payments?limit=999"));
    expect(fetchPayments).toHaveBeenCalledWith(100, 0);
  });

  it("propagates an upstream error", async () => {
    vi.mocked(fetchPayments).mockResolvedValue({
      ok: false,
      httpStatus: 502,
      error: { kind: "upstream", message: "Gateway 500", status: 500 },
    });
    const res = await paymentsGET(new Request("http://localhost/api/payments"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.kind).toBe("upstream");
  });
});
