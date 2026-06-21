import { describe, expect, it } from "vitest";

import {
  extractCallbackUuid,
  normalizeCreate,
  normalizePayment,
} from "@/lib/payments";

describe("normalizeCreate", () => {
  it("maps address_in and carries ref/callbackUrl/raw", () => {
    const raw = {
      status: "success",
      address_in: "0xAbc",
      address_out: "0xDef",
      callback_url: "https://x/cb?ref=r1",
      minimum_transaction_coin: 1.0,
      priority: "default",
    };
    const v = normalizeCreate(raw, "r1", "https://x/cb?ref=r1");
    expect(v.addressIn).toBe("0xAbc");
    expect(v.ref).toBe("r1");
    expect(v.callbackUrl).toBe("https://x/cb?ref=r1");
    expect(v.raw).toBe(raw);
  });
});

describe("normalizePayment", () => {
  it("converts wei-style amounts to coin units (integer and fractional)", () => {
    const v = normalizePayment({
      id: "uuid-1",
      token: "usd1",
      address_in: "0xAbc",
      amount_received: "10000000000000000000", // 10
      fee: "25000000000000000", // 0.025
      status: "COMPLETED",
      tx_hash_in: "0xin",
      tx_hash_out: "0xout",
      created_at: "2026-06-21T10:00:00.000Z",
      updated_at: "2026-06-21T10:30:45.000Z",
    });
    expect(v.id).toBe("uuid-1");
    expect(v.status).toBe("COMPLETED");
    expect(v.amountReceived).toBe("10");
    expect(v.fee).toBe("0.025");
    expect(v.txHashIn).toBe("0xin");
    expect(v.txHashOut).toBe("0xout");
  });

  it("leaves amounts undefined when null/absent", () => {
    const v = normalizePayment({
      id: "uuid-2",
      status: "CREATED",
      amount_expected: null,
      amount_received: null,
    });
    expect(v.amountReceived).toBeUndefined();
    expect(v.fee).toBeUndefined();
  });

  it("passes unknown status values through verbatim", () => {
    const v = normalizePayment({ id: "x", status: "GAS_FUNDED" });
    expect(v.status).toBe("GAS_FUNDED");
  });
});

describe("extractCallbackUuid", () => {
  it("reads uuid from a callback body", () => {
    expect(extractCallbackUuid({ uuid: "p-1", confirmations: 15 })).toBe("p-1");
  });

  it("returns undefined for non-object or missing uuid", () => {
    expect(extractCallbackUuid("nope")).toBeUndefined();
    expect(extractCallbackUuid({ foo: 1 })).toBeUndefined();
  });
});
