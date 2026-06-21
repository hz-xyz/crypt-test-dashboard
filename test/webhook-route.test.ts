import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments", () => ({
  fetchPubkey: vi.fn(),
  verifyCallbackSignature: vi.fn(),
  extractCallbackUuid: vi.fn(),
}));

vi.mock("@/lib/callback-store", () => ({
  record: vi.fn(),
  listByRef: vi.fn(() => []),
  listRecent: vi.fn(() => []),
}));

import { record, listByRef, listRecent } from "@/lib/callback-store";
import {
  extractCallbackUuid,
  fetchPubkey,
  verifyCallbackSignature,
} from "@/lib/payments";
import { GET as webhookGET } from "@/app/api/webhooks/route";
import { POST as webhookPOST } from "@/app/api/webhooks/usd1pay/route";

afterEach(() => vi.clearAllMocks());

function callbackReq(ref: string, body: unknown, sig = "sig"): Request {
  return new Request(`http://localhost/api/webhooks/usd1pay?ref=${ref}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ca-signature": sig },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/usd1pay", () => {
  it("verifies, records, and replies 200 ok on a valid signature", async () => {
    vi.mocked(fetchPubkey).mockResolvedValue("PEM");
    vi.mocked(verifyCallbackSignature).mockReturnValue(true);
    vi.mocked(extractCallbackUuid).mockReturnValue("p-1");

    const res = await webhookPOST(callbackReq("r1", { uuid: "p-1" }));
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toMatch(/ok/i);

    expect(record).toHaveBeenCalledTimes(1);
    expect(vi.mocked(record).mock.calls[0][0]).toMatchObject({
      ref: "r1",
      uuid: "p-1",
      signatureValid: true,
      body: { uuid: "p-1" },
    });
  });

  it("still records (signatureValid:false) and replies 200 on a bad signature", async () => {
    vi.mocked(fetchPubkey).mockResolvedValue("PEM");
    vi.mocked(verifyCallbackSignature).mockReturnValue(false);
    vi.mocked(extractCallbackUuid).mockReturnValue("p-2");

    const res = await webhookPOST(callbackReq("r2", { uuid: "p-2" }, "bad"));
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toMatch(/ok/i);
    expect(vi.mocked(record).mock.calls[0][0]).toMatchObject({
      ref: "r2",
      signatureValid: false,
    });
  });

  it("records signatureValid:false when the pubkey fetch throws", async () => {
    vi.mocked(fetchPubkey).mockRejectedValue(new Error("gateway down"));
    vi.mocked(extractCallbackUuid).mockReturnValue(undefined);

    const res = await webhookPOST(callbackReq("r3", { uuid: "p-3" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(record).mock.calls[0][0]).toMatchObject({
      ref: "r3",
      signatureValid: false,
    });
  });
});

describe("GET /api/webhooks", () => {
  it("filters by ref when provided", async () => {
    vi.mocked(listByRef).mockResolvedValue([
      {
        ref: "r1",
        signatureValid: true,
        receivedAt: "t",
        body: {},
      },
    ]);
    const res = await webhookGET(
      new Request("http://localhost/api/webhooks?ref=r1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toHaveLength(1);
    expect(listByRef).toHaveBeenCalledWith("r1");
    expect(listRecent).not.toHaveBeenCalled();
  });

  it("returns recent across all refs without a ref", async () => {
    await webhookGET(new Request("http://localhost/api/webhooks"));
    expect(listRecent).toHaveBeenCalled();
    expect(listByRef).not.toHaveBeenCalled();
  });
});
