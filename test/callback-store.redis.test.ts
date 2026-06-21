import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lpush = vi.fn().mockResolvedValue(1);
const ltrim = vi.fn().mockResolvedValue("OK");
const expire = vi.fn().mockResolvedValue(1);
const lrange = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ lpush, ltrim, expire, lrange }),
}));

import {
  CALLBACK_BUFFER_CAP,
  CALLBACK_TTL_SECONDS,
  RECENT_CAP,
  listByRef,
  listRecent,
  record,
} from "@/lib/callback-store";
import type { CallbackRecord } from "@/lib/types";

const entry: CallbackRecord = {
  ref: "r1",
  uuid: "p-1",
  signatureValid: true,
  receivedAt: "t",
  body: { uuid: "p-1" },
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("callback-store (Redis backend)", () => {
  it("LPUSH + LTRIM + EXPIRE the per-ref and recent lists on record", async () => {
    await record(entry);
    expect(lpush).toHaveBeenCalledWith("cb:ref:r1", entry);
    expect(ltrim).toHaveBeenCalledWith("cb:ref:r1", 0, CALLBACK_BUFFER_CAP - 1);
    expect(expire).toHaveBeenCalledWith("cb:ref:r1", CALLBACK_TTL_SECONDS);
    expect(lpush).toHaveBeenCalledWith("cb:recent", entry);
    expect(ltrim).toHaveBeenCalledWith("cb:recent", 0, RECENT_CAP - 1);
  });

  it("LRANGE the per-ref list on listByRef", async () => {
    lrange.mockResolvedValue([entry]);
    const out = await listByRef("r1");
    expect(lrange).toHaveBeenCalledWith("cb:ref:r1", 0, -1);
    expect(out).toEqual([entry]);
  });

  it("LRANGE the recent list on listRecent", async () => {
    lrange.mockResolvedValue([entry]);
    const out = await listRecent(10);
    expect(lrange).toHaveBeenCalledWith("cb:recent", 0, 9);
    expect(out).toEqual([entry]);
  });

  it("returns [] when LRANGE yields null", async () => {
    lrange.mockResolvedValue(null);
    expect(await listByRef("nope")).toEqual([]);
  });

  it("record swallows a Redis error and does not throw", async () => {
    lpush.mockRejectedValueOnce(new Error("redis down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(record(entry)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("listByRef returns [] when Redis throws", async () => {
    lrange.mockRejectedValueOnce(new Error("redis down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listByRef("r1")).toEqual([]);
    errSpy.mockRestore();
  });

  it("listRecent returns [] when Redis throws", async () => {
    lrange.mockRejectedValueOnce(new Error("redis down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await listRecent()).toEqual([]);
    errSpy.mockRestore();
  });
});
