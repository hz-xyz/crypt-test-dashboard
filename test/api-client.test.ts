import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, fetchHealth, fetchInfo } from "@/lib/api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("api-client", () => {
  it("returns parsed data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ up: true, raw: {}, fetchedAt: "x" })),
    );
    await expect(fetchHealth()).resolves.toMatchObject({ up: true });
  });

  it("throws ApiClientError carrying kind on a normalized error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { kind: "timeout", message: "slow" } }, 504),
        ),
    );
    await expect(fetchHealth()).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "timeout",
    });
    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiClientError);
  });

  it("fetchInfo returns parsed chain config on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ chainId: 97, tokens: [], raw: {}, fetchedAt: "x" }),
        ),
    );
    await expect(fetchInfo()).resolves.toMatchObject({ chainId: 97 });
  });
});
