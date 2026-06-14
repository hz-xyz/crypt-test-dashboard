import { describe, expect, it } from "vitest";

import { isApiError } from "@/lib/types";

describe("test harness smoke", () => {
  it("isApiError accepts a well-formed error", () => {
    expect(isApiError({ error: { kind: "timeout", message: "x" } })).toBe(true);
  });

  it("isApiError rejects a plain object", () => {
    expect(isApiError({ up: true })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
