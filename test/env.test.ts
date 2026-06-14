import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when required vars are missing", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/GATEWAY_BASE_URL/);
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
});
