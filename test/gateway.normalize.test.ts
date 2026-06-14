import { describe, expect, it } from "vitest";

import { normalizeHealth, normalizeMetrics } from "@/lib/gateway";

describe("normalizeMetrics", () => {
  it("flat status->count object", () => {
    const v = normalizeMetrics({ CREATED: 3, COMPLETED: 10 });
    expect(v.statusCounts).toEqual({ CREATED: 3, COMPLETED: 10 });
    expect(v.total).toBe(13);
  });

  it("nested under counts, uppercases keys", () => {
    const v = normalizeMetrics({ counts: { pending: 2, completed: 5 } });
    expect(v.statusCounts).toEqual({ PENDING: 2, COMPLETED: 5 });
    expect(v.total).toBe(7);
  });

  it("prometheus text with status label", () => {
    const text =
      'payment_status_total{status="CREATED"} 3\npayment_status_total{status="FAILED"} 1';
    const v = normalizeMetrics(text);
    expect(v.statusCounts).toEqual({ CREATED: 3, FAILED: 1 });
    expect(v.total).toBe(4);
  });
});

describe("normalizeHealth", () => {
  it("derives up + blockLag from a healthy payload", () => {
    const v = normalizeHealth({
      status: "ok",
      getLogsStrategy: "bulk",
      lastProcessedBlock: 100,
      chainHead: 115,
      watchSetSize: 4,
    });
    expect(v.up).toBe(true);
    expect(v.getLogsStrategy).toBe("bulk");
    expect(v.blockLag).toBe(15);
    expect(v.watchSetSize).toBe(4);
  });

  it("marks down on a failing status string", () => {
    expect(normalizeHealth({ status: "down" }).up).toBe(false);
  });

  it("defaults up=true and preserves raw for non-object payloads", () => {
    const v = normalizeHealth("pong");
    expect(v.up).toBe(true);
    expect(v.raw).toBe("pong");
  });
});
