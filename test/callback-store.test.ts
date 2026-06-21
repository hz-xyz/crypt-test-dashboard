import { beforeEach, describe, expect, it } from "vitest";

import {
  CALLBACK_BUFFER_CAP,
  __resetForTest,
  listByRef,
  listRecent,
  record,
} from "@/lib/callback-store";
import type { CallbackRecord } from "@/lib/types";

function rec(ref: string, i: number): CallbackRecord {
  return {
    ref,
    uuid: `${ref}-${i}`,
    signatureValid: true,
    receivedAt: new Date(2026, 5, 21, 0, 0, i).toISOString(),
    body: { uuid: `${ref}-${i}` },
  };
}

describe("callback-store (in-memory fallback)", () => {
  beforeEach(async () => {
    await __resetForTest();
  });

  it("returns records newest-first", async () => {
    await record(rec("a", 1));
    await record(rec("a", 2));
    const all = await listRecent();
    expect(all.map((r) => r.uuid)).toEqual(["a-2", "a-1"]);
  });

  it("filters by ref", async () => {
    await record(rec("a", 1));
    await record(rec("b", 1));
    await record(rec("a", 2));
    expect((await listByRef("a")).map((r) => r.uuid)).toEqual(["a-2", "a-1"]);
    expect((await listByRef("b")).map((r) => r.uuid)).toEqual(["b-1"]);
    expect(await listByRef("missing")).toEqual([]);
  });

  it("caps the buffer, evicting the oldest", async () => {
    for (let i = 0; i < CALLBACK_BUFFER_CAP + 5; i++) await record(rec("a", i));
    const all = await listRecent();
    expect(all).toHaveLength(CALLBACK_BUFFER_CAP);
    expect(all[0].uuid).toBe(`a-${CALLBACK_BUFFER_CAP + 4}`);
    expect(all.at(-1)!.uuid).toBe("a-5");
  });

  it("honors an explicit limit on listRecent", async () => {
    for (let i = 0; i < 10; i++) await record(rec("a", i));
    expect(await listRecent(3)).toHaveLength(3);
  });
});
