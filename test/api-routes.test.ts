import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gateway", () => ({
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
}));

import { fetchHealth, fetchMetrics } from "@/lib/gateway";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as metricsGET } from "@/app/api/metrics/route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("returns the normalized HealthView on success", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: true,
      data: { up: true, raw: {}, fetchedAt: "x" },
    });
    const res = await healthGET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ up: true });
  });

  it("returns 504 with error contract on timeout", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: false,
      httpStatus: 504,
      error: { kind: "timeout", message: "slow" },
    });
    const res = await healthGET();
    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "timeout" },
    });
  });

  it("returns 502 with error contract on upstream failure", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: false,
      httpStatus: 502,
      error: {
        kind: "upstream",
        message: "Gateway responded 500",
        status: 500,
      },
    });
    const res = await healthGET();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "upstream" },
    });
  });

  it("returns 500 with error contract on config error", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: false,
      httpStatus: 500,
      error: { kind: "config", message: "Missing GATEWAY_BASE_URL" },
    });
    const res = await healthGET();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "config" },
    });
  });
});

describe("GET /api/metrics", () => {
  it("returns the normalized MetricsView on success", async () => {
    vi.mocked(fetchMetrics).mockResolvedValue({
      ok: true,
      data: { statusCounts: { CREATED: 1 }, total: 1, fetchedAt: "x" },
    });
    const res = await metricsGET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ total: 1 });
  });

  it("returns 504 with error contract on timeout", async () => {
    vi.mocked(fetchMetrics).mockResolvedValue({
      ok: false,
      httpStatus: 504,
      error: { kind: "timeout", message: "slow" },
    });
    const res = await metricsGET();
    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "timeout" },
    });
  });

  it("returns 502 with error contract on upstream failure", async () => {
    vi.mocked(fetchMetrics).mockResolvedValue({
      ok: false,
      httpStatus: 502,
      error: {
        kind: "upstream",
        message: "Gateway responded 503",
        status: 503,
      },
    });
    const res = await metricsGET();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "upstream" },
    });
  });
});
