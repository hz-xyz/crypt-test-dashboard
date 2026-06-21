import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when GATEWAY_BASE_URL is missing", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/GATEWAY_BASE_URL/);
  });

  it("treats GATEWAY_ADMIN_TOKEN as optional", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "");
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.GATEWAY_ADMIN_TOKEN).toBeUndefined();
  });

  it("keeps GATEWAY_ADMIN_TOKEN when provided", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "secret");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().GATEWAY_ADMIN_TOKEN).toBe("secret");
  });

  it("strips a trailing slash and defaults timeout to 5000", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080/");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "t");
    vi.stubEnv("GATEWAY_TIMEOUT_MS", "");
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.GATEWAY_BASE_URL).toBe("http://host:8080");
    expect(env.GATEWAY_TIMEOUT_MS).toBe(5000);
  });

  it("rejects a non-positive timeout", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "t");
    vi.stubEnv("GATEWAY_TIMEOUT_MS", "-1");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/positive number/);
  });

  it("defaults PUBLIC_APP_URL to http://localhost:3000 when unset", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("PUBLIC_APP_URL", "");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("strips a trailing slash from PUBLIC_APP_URL", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("PUBLIC_APP_URL", "http://localhost:4000/");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().PUBLIC_APP_URL).toBe("http://localhost:4000");
  });

  it("leaves DEFAULT_PAYOUT_ADDRESS undefined when unset", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("DEFAULT_PAYOUT_ADDRESS", "");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().DEFAULT_PAYOUT_ADDRESS).toBeUndefined();
  });

  it("trims DEFAULT_PAYOUT_ADDRESS when provided", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("DEFAULT_PAYOUT_ADDRESS", "  0xABCdef  ");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().DEFAULT_PAYOUT_ADDRESS).toBe("0xABCdef");
  });

  it("reads optional VERCEL_AUTOMATION_BYPASS_SECRET", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "byp");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().VERCEL_AUTOMATION_BYPASS_SECRET).toBe("byp");
  });

  it("leaves VERCEL_AUTOMATION_BYPASS_SECRET undefined when unset", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
    const { getEnv } = await import("@/lib/env");
    expect(getEnv().VERCEL_AUTOMATION_BYPASS_SECRET).toBeUndefined();
  });
});
