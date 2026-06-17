import { describe, expect, it } from "vitest";

import { normalizeInfo } from "@/lib/gateway";

describe("normalizeInfo", () => {
  it("reads a flat camelCase payload with a tokens array", () => {
    const v = normalizeInfo({
      chainId: 97,
      chainName: "BSC Testnet",
      confirmations: 12,
      tokens: [
        { symbol: "USD1", address: "0xabc", decimals: 18 },
        { symbol: "USDT", address: "0xdef", decimals: 18, feeBps: 25 },
      ],
      feeBps: 50,
    });
    expect(v.chainId).toBe(97);
    expect(v.chainName).toBe("BSC Testnet");
    expect(v.confirmations).toBe(12);
    expect(v.feeBps).toBe(50);
    expect(v.tokens).toEqual([
      { symbol: "USD1", address: "0xabc", decimals: 18 },
      { symbol: "USDT", address: "0xdef", decimals: 18, feeBps: 25 },
    ]);
  });

  it("tolerates snake_case, a token map, and a fee given as a percent", () => {
    const v = normalizeInfo({
      chain_id: "56",
      network: "BSC Mainnet",
      min_confirmations: 15,
      tokens: {
        USD1: { address: "0x1", decimals: 18 },
        USDT: { contract: "0x2" },
      },
      fee_percent: 0.5,
    });
    expect(v.chainId).toBe(56);
    expect(v.chainName).toBe("BSC Mainnet");
    expect(v.confirmations).toBe(15);
    // 0.5% expressed in basis points.
    expect(v.feeBps).toBe(50);
    expect(v.tokens).toEqual([
      { symbol: "USD1", address: "0x1", decimals: 18 },
      { symbol: "USDT", address: "0x2" },
    ]);
  });

  it("reads tokens nested under `contracts` and chain head fields", () => {
    const v = normalizeInfo({
      networkId: 97,
      requiredConfirmations: 6,
      contracts: [{ name: "USDC", contractAddress: "0x9" }],
    });
    expect(v.chainId).toBe(97);
    expect(v.confirmations).toBe(6);
    expect(v.tokens).toEqual([{ symbol: "USDC", address: "0x9" }]);
  });

  it("defaults to an empty token list and preserves raw for non-object payloads", () => {
    const v = normalizeInfo("nope");
    expect(v.chainId).toBeUndefined();
    expect(v.tokens).toEqual([]);
    expect(v.raw).toBe("nope");
  });
});
