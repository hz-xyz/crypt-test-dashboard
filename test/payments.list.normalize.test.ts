import { describe, expect, it } from "vitest";

import { normalizePaymentList } from "@/lib/payments";

describe("normalizePaymentList", () => {
  it("normalizes a plain array of payments", () => {
    const raw = [
      {
        id: "uuid-1",
        status: "COMPLETED",
        token: "usd1",
        amount_received: "1000000000000000000",
        fee: "5000000000000000",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "uuid-2",
        status: "PENDING",
        token: "usdt",
        address_in: "0xAbc",
      },
    ];
    const result = normalizePaymentList(raw);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "uuid-1",
      status: "COMPLETED",
      token: "usd1",
      amountReceived: "1",
      fee: "0.005",
    });
    expect(result.items[1]).toMatchObject({
      id: "uuid-2",
      status: "PENDING",
      addressIn: "0xAbc",
    });
    expect(result.total).toBe(2);
  });

  it("normalizes a wrapped { data, total } response", () => {
    const raw = {
      data: [
        { id: "uuid-1", status: "CREATED" },
        { id: "uuid-2", status: "FAILED" },
      ],
      total: 50,
    };
    const result = normalizePaymentList(raw);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(50);
    expect(result.items[0].status).toBe("CREATED");
  });

  it("normalizes a { payments } wrapper", () => {
    const raw = {
      payments: [{ id: "uuid-1", status: "CONFIRMING" }],
    };
    const result = normalizePaymentList(raw);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("CONFIRMING");
    expect(result.total).toBe(1);
  });

  it("skips items without an id", () => {
    const raw = [{ status: "COMPLETED" }, { id: "uuid-1", status: "PENDING" }];
    const result = normalizePaymentList(raw);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("uuid-1");
  });

  it("returns empty list for non-object input", () => {
    expect(normalizePaymentList(null).items).toEqual([]);
    expect(normalizePaymentList("bad").items).toEqual([]);
    expect(normalizePaymentList(42).items).toEqual([]);
  });

  it("handles camelCase field names", () => {
    const raw = [
      {
        uuid: "uuid-1",
        status: "COMPLETED",
        addressIn: "0xDef",
        amountReceived: "2000000000000000000",
        txHashIn: "0xTx1",
        txHashOut: "0xTx2",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      },
    ];
    const result = normalizePaymentList(raw);
    expect(result.items[0]).toMatchObject({
      id: "uuid-1",
      addressIn: "0xDef",
      amountReceived: "2",
      txHashIn: "0xTx1",
      txHashOut: "0xTx2",
    });
  });

  it("always includes raw and fetchedAt", () => {
    const result = normalizePaymentList([]);
    expect(result.raw).toEqual([]);
    expect(result.fetchedAt).toBeTruthy();
  });
});
