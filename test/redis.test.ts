import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getRedis", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns null when KV env is absent", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    const { getRedis } = await import("@/lib/redis");
    expect(getRedis()).toBeNull();
  });

  it("returns a client when KV env is present", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "tok");
    const { getRedis } = await import("@/lib/redis");
    expect(getRedis()).not.toBeNull();
  });
});
