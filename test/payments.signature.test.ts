import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyCallbackSignature } from "@/lib/payments";

// A throwaway RSA keypair, generated once for this test file. Mirrors the
// gateway's RSA-SHA256-over-raw-bytes signing of webhook bodies.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function sign(body: string): string {
  return crypto
    .sign("sha256", Buffer.from(body), privateKey)
    .toString("base64");
}

describe("verifyCallbackSignature", () => {
  const body = JSON.stringify({ uuid: "p-1", value_coin: "10.0" });

  it("accepts a valid signature over the raw bytes", () => {
    expect(
      verifyCallbackSignature(Buffer.from(body), sign(body), publicPem),
    ).toBe(true);
  });

  it("rejects when the body was tampered with", () => {
    const tampered = body.replace("10.0", "99.0");
    expect(
      verifyCallbackSignature(Buffer.from(tampered), sign(body), publicPem),
    ).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const otherSig = crypto
      .sign("sha256", Buffer.from(body), otherKey)
      .toString("base64");
    expect(
      verifyCallbackSignature(Buffer.from(body), otherSig, publicPem),
    ).toBe(false);
  });

  it("returns false (never throws) on a malformed signature/key", () => {
    expect(
      verifyCallbackSignature(Buffer.from(body), "not-base64!!", publicPem),
    ).toBe(false);
    expect(
      verifyCallbackSignature(Buffer.from(body), sign(body), "not a key"),
    ).toBe(false);
  });
});
