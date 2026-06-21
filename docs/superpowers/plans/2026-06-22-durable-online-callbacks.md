# Durable Online Callbacks + Address Copy/QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/console` work on the deployed Vercel site — receive gateway callbacks reliably (Upstash Redis + Deployment-Protection bypass) and give the deposit address an explicit copy button and a scannable QR code.

**Architecture:** Two independent slices. **A (infra):** swap the in-memory callback ring buffer for Upstash Redis behind the same (now-async) interface, with an in-memory fallback for local dev; append the Vercel automation bypass token to the gateway callback URL so the webhook POST passes Deployment Protection. **B (UI):** a focused `address-display` component (copy button with feedback + raw-address QR) used by the payment tracker.

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / `@upstash/redis` / `qrcode.react` / Vitest / Testing Library.

**Spec:** [`docs/superpowers/specs/2026-06-22-durable-online-callbacks-design.md`](../specs/2026-06-22-durable-online-callbacks-design.md)

---

## File Structure

- Create: `lib/redis.ts` — lazy Upstash client from `KV_REST_API_URL/TOKEN`, or `null` when unconfigured.
- Modify: `lib/callback-store.ts` — async `record/listByRef/listRecent/__resetForTest`; Redis backend when configured, in-memory otherwise.
- Modify: `app/api/webhooks/usd1pay/route.ts` — `await record(...)`.
- Modify: `app/api/webhooks/route.ts` — `await listByRef/listRecent`.
- Modify: `lib/env.ts` — add optional `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Modify: `app/api/payments/route.ts` — append `x-vercel-protection-bypass` to the callback URL when the secret is set.
- Create: `components/console/address-display.tsx` — `CopyableField` (copy + feedback) and `AddressQR` (raw-address QR).
- Modify: `components/console/payment-tracker.tsx` — use the new component; remove the local `CopyableField`.
- Tests: `test/redis.test.ts`, `test/callback-store.redis.test.ts`, `test/address-display.test.tsx`; adapt `test/callback-store.test.ts`; extend `test/payments-routes.test.ts`.
- Modify: `README.md`, `.env.example` — online-mode notes.

**Commands:** run a single test file with `pnpm test <path>`; full gate with `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.

---

## Part A — Durable online callbacks

### Task A1: `lib/redis.ts` — lazy Upstash client

**Files:**

- Create: `lib/redis.ts`
- Test: `test/redis.test.ts`

- [ ] **Step 1: Install the dependency**

Run: `pnpm add @upstash/redis`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `test/redis.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test test/redis.test.ts`
Expected: FAIL — cannot resolve `@/lib/redis`.

- [ ] **Step 4: Write the implementation**

Create `lib/redis.ts`:

```ts
import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Lazy Upstash Redis client (server-only).
 *
 * The Vercel Marketplace Upstash integration injects KV_REST_API_URL /
 * KV_REST_API_TOKEN (not the UPSTASH_REDIS_REST_* names Redis.fromEnv() reads),
 * so we construct the client explicitly. Returns null when those vars are
 * absent — callers (callback-store) then fall back to an in-memory buffer,
 * which keeps local `next dev` working without provisioning Redis.
 */

// undefined = not yet resolved, null = unconfigured.
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/redis.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/redis.ts test/redis.test.ts
git commit -m "feat: lazy Upstash Redis client (KV_REST_API_* or null)"
```

---

### Task A2: `lib/callback-store.ts` — async, Redis + in-memory backends

**Files:**

- Modify: `lib/callback-store.ts` (full rewrite of body, same exports)
- Modify: `test/callback-store.test.ts` (await the now-async API)
- Test: `test/callback-store.redis.test.ts` (new)

- [ ] **Step 1: Update the existing in-memory test to async**

Replace `test/callback-store.test.ts` entirely with:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/callback-store.test.ts`
Expected: FAIL — current `record` is sync (`await` on void is harmless but the cap test still passes; the real failure source is the next step's rewrite). If it still passes here, that is fine — proceed; the contract is enforced after Step 3.

- [ ] **Step 3: Rewrite `lib/callback-store.ts`**

Replace the file entirely with:

```ts
import "server-only";

import { getRedis } from "./redis";
import type { CallbackRecord } from "./types";

/**
 * Recently received gateway callbacks (R5 console).
 *
 * Backend is selected at call time: when Upstash Redis is configured
 * (getRedis() != null) callbacks are shared across all serverless instances;
 * otherwise an in-memory ring buffer is used, which is process-local and only
 * suitable for single-process `next dev`. The async interface is identical for
 * both backends so route handlers don't care which is active.
 */

export const CALLBACK_BUFFER_CAP = 50; // per-ref cap and default recent limit
export const RECENT_CAP = 100; // global recent list cap (Redis)
export const CALLBACK_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const refKey = (ref: string) => `cb:ref:${ref}`;
const RECENT_KEY = "cb:recent";

// In-memory fallback. Oldest-first internally; readers get newest-first.
let buffer: CallbackRecord[] = [];

/** Append a callback to both the per-ref list and the global recent list. */
export async function record(entry: CallbackRecord): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const k = refKey(entry.ref);
    // LPUSH puts newest at the head; LTRIM caps; EXPIRE bounds retention.
    // @upstash/redis serializes the object automatically.
    await redis.lpush(k, entry);
    await redis.ltrim(k, 0, CALLBACK_BUFFER_CAP - 1);
    await redis.expire(k, CALLBACK_TTL_SECONDS);
    await redis.lpush(RECENT_KEY, entry);
    await redis.ltrim(RECENT_KEY, 0, RECENT_CAP - 1);
    await redis.expire(RECENT_KEY, CALLBACK_TTL_SECONDS);
    return;
  }
  buffer.push(entry);
  if (buffer.length > CALLBACK_BUFFER_CAP) {
    buffer = buffer.slice(buffer.length - CALLBACK_BUFFER_CAP);
  }
}

/** All captured callbacks for a correlation ref, newest-first. */
export async function listByRef(ref: string): Promise<CallbackRecord[]> {
  const redis = getRedis();
  if (redis) {
    return (await redis.lrange<CallbackRecord>(refKey(ref), 0, -1)) ?? [];
  }
  return buffer.filter((r) => r.ref === ref).reverse();
}

/** The most recent callbacks across all refs, newest-first. */
export async function listRecent(
  limit = CALLBACK_BUFFER_CAP,
): Promise<CallbackRecord[]> {
  const redis = getRedis();
  if (redis) {
    return (await redis.lrange<CallbackRecord>(RECENT_KEY, 0, limit - 1)) ?? [];
  }
  return buffer.slice(-limit).reverse();
}

/** Test-only: clear the in-memory buffer. */
export async function __resetForTest(): Promise<void> {
  buffer = [];
}
```

- [ ] **Step 4: Run the in-memory test to verify it passes**

Run: `pnpm test test/callback-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the Redis-backend test**

Create `test/callback-store.redis.test.ts`:

```ts
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
});
```

- [ ] **Step 6: Run the Redis-backend test to verify it passes**

Run: `pnpm test test/callback-store.redis.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/callback-store.ts test/callback-store.test.ts test/callback-store.redis.test.ts
git commit -m "feat: Redis-backed callback store with in-memory fallback (async)"
```

---

### Task A3: webhook routes await the async store

**Files:**

- Modify: `app/api/webhooks/usd1pay/route.ts`
- Modify: `app/api/webhooks/route.ts`
- Test: `test/webhook-route.test.ts` (existing — no edit, just re-run)

- [ ] **Step 1: Await `record` in the POST handler**

In `app/api/webhooks/usd1pay/route.ts`, change the `record({ ... })` call to `await`:

```ts
await record({
  ref,
  uuid: extractCallbackUuid(body),
  signatureValid,
  receivedAt: new Date().toISOString(),
  body,
});
```

- [ ] **Step 2: Await the reads in the GET handler**

In `app/api/webhooks/route.ts`, change:

```ts
const records = ref ? await listByRef(ref) : await listRecent();
```

- [ ] **Step 3: Run the existing webhook route tests**

Run: `pnpm test test/webhook-route.test.ts`
Expected: PASS (5 tests). The mocks return plain values; `await` on them is a no-op, so no test changes are needed.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/usd1pay/route.ts app/api/webhooks/route.ts
git commit -m "refactor: await async callback store in webhook routes"
```

---

### Task A4: env var + bypass token on the callback URL

**Files:**

- Modify: `lib/env.ts`
- Modify: `app/api/payments/route.ts`
- Test: `test/payments-routes.test.ts` (extend); `test/env.test.ts` (extend)

- [ ] **Step 1: Add the env-var test**

Append to `test/env.test.ts` inside the `describe("getEnv", ...)` block:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/env.test.ts`
Expected: FAIL — `VERCEL_AUTOMATION_BYPASS_SECRET` is not on `Env`.

- [ ] **Step 3: Add the field to `lib/env.ts`**

In the `Env` interface, after `DEFAULT_PAYOUT_ADDRESS?: string;`, add:

```ts
  /**
   * Vercel "Protection Bypass for Automation" secret. When set, it is appended
   * to the gateway callback URL as `x-vercel-protection-bypass` so the gateway's
   * webhook POST passes Deployment Protection. Optional (absent locally).
   */
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
```

In `readEnv()`, after the `DEFAULT_PAYOUT_ADDRESS` line, add:

```ts
const VERCEL_AUTOMATION_BYPASS_SECRET =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || undefined;
```

In the returned object, after `DEFAULT_PAYOUT_ADDRESS,`, add:

```ts
    VERCEL_AUTOMATION_BYPASS_SECRET,
```

- [ ] **Step 4: Run the env test to verify it passes**

Run: `pnpm test test/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the bypass test to the payments route**

In `test/payments-routes.test.ts`, append inside `describe("POST /api/payments", ...)`:

```ts
it("appends the bypass token to the callback URL when configured", async () => {
  vi.mocked(getEnv).mockReturnValue({
    PUBLIC_APP_URL: "https://app.example.com",
    DEFAULT_PAYOUT_ADDRESS: undefined,
    VERCEL_AUTOMATION_BYPASS_SECRET: "byp",
  } as ReturnType<typeof getEnv>);
  vi.mocked(createPayment).mockResolvedValue({
    ok: true,
    data: {
      ref: "x",
      addressIn: "0xAbc",
      callbackUrl: "u",
      raw: {},
      fetchedAt: "t",
    },
  });

  await createPOST(postReq({ token: "usd1", address: "0xDef" }));
  const callbackUrl = vi.mocked(createPayment).mock.calls[0][2] as string;
  const u = new URL(callbackUrl);
  expect(u.origin + u.pathname).toBe(
    "https://app.example.com/api/webhooks/usd1pay",
  );
  expect(u.searchParams.get("x-vercel-protection-bypass")).toBe("byp");
  expect(u.searchParams.get("ref")).toBeTruthy();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test test/payments-routes.test.ts`
Expected: FAIL — callback URL has no `x-vercel-protection-bypass` param.

- [ ] **Step 7: Build the callback URL with the bypass param**

In `app/api/payments/route.ts`, replace:

```ts
const ref = crypto.randomUUID();
const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?ref=${ref}`;
```

with:

```ts
const ref = crypto.randomUUID();
// Build the callback URL; when running behind Vercel Deployment Protection,
// append the automation bypass token so the gateway's POST is not 401'd.
const params = new URLSearchParams({ ref });
if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  params.set("x-vercel-protection-bypass", env.VERCEL_AUTOMATION_BYPASS_SECRET);
}
const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?${params.toString()}`;
```

- [ ] **Step 8: Run the payments route tests to verify they pass**

Run: `pnpm test test/payments-routes.test.ts`
Expected: PASS. The existing "ref'd callback" test still passes because its `getEnv` mock has no bypass secret, so the URL stays `.../usd1pay?ref=<ref>`.

- [ ] **Step 9: Commit**

```bash
git add lib/env.ts app/api/payments/route.ts test/env.test.ts test/payments-routes.test.ts
git commit -m "feat: append Vercel bypass token to gateway callback URL"
```

---

## Part B — Address copy button + QR

### Task B1: `components/console/address-display.tsx`

**Files:**

- Create: `components/console/address-display.tsx`
- Test: `test/address-display.test.tsx`

- [ ] **Step 1: Install the QR dependency**

Run: `pnpm add qrcode.react`
Expected: added to `dependencies` (provides the `QRCodeSVG` component).

- [ ] **Step 2: Write the failing test**

Create `test/address-display.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddressQR, CopyableField } from "@/components/console/address-display";

describe("CopyableField", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the value and shows feedback", async () => {
    render(<CopyableField label="收款地址" value="0xAbc" />);
    fireEvent.click(screen.getByRole("button", { name: /复制/ }));
    expect(writeText).toHaveBeenCalledWith("0xAbc");
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });
});

describe("AddressQR", () => {
  it("renders an svg QR for a non-empty address", () => {
    const { container } = render(<AddressQR address="0xAbc" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders nothing for an empty address", () => {
    const { container } = render(<AddressQR address="" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test test/address-display.test.tsx`
Expected: FAIL — cannot resolve `@/components/console/address-display`.

- [ ] **Step 4: Write the component**

Create `components/console/address-display.tsx`:

```tsx
"use client";

import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

/**
 * A labeled value with an explicit copy button that shows "已复制" feedback for
 * 2s. Copy silently no-ops if the Clipboard API is unavailable (non-HTTPS / old
 * browser); production is HTTPS so it works.
 */
export function CopyableField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — leave the UI unchanged.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs">
          {value}
        </span>
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={`复制${label}`}
          title="复制"
          className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

/**
 * Scannable QR of the raw deposit address. Fixed black-on-white (with a quiet
 * zone) regardless of theme so wallet scanners get reliable contrast. Renders
 * nothing when the address is empty.
 */
export function AddressQR({
  address,
  label = "充值地址二维码",
}: {
  address: string;
  label?: string;
}) {
  if (!address) return null;
  return (
    <div className="flex w-fit flex-col items-center gap-1">
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG value={address} size={140} title={label} />
      </div>
      <span className="text-xs text-muted-foreground">扫码转账到充值地址</span>
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test test/address-display.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml components/console/address-display.tsx test/address-display.test.tsx
git commit -m "feat: address-display — copy button with feedback + raw-address QR"
```

---

### Task B2: wire address-display into the payment tracker

**Files:**

- Modify: `components/console/payment-tracker.tsx`

- [ ] **Step 1: Replace the local CopyableField with the shared component**

In `components/console/payment-tracker.tsx`:

1. Delete the local `CopyableField` definition (the `function CopyableField(...) { ... }` block, lines 16–30).
2. Add an import alongside the existing `./callback-log` import:

```ts
import { AddressQR, CopyableField } from "./address-display";
```

3. Replace the address/ref grid block:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <CopyableField label="收款地址 address_in" value={created.addressIn} />
  <CopyableField label="关联 ref" value={created.ref} />
</div>
```

with:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div className="grid grid-cols-1 gap-3">
    <CopyableField label="收款地址 address_in" value={created.addressIn} />
    <CopyableField label="关联 ref" value={created.ref} />
  </div>
  <AddressQR address={created.addressIn} />
</div>
```

- [ ] **Step 2: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS — all tests green; no type errors (the removed local component is no longer referenced).

- [ ] **Step 3: Commit**

```bash
git add components/console/payment-tracker.tsx
git commit -m "feat: show copy button + QR for the deposit address in /console"
```

---

## Part C — Docs + final verification

### Task C1: document online mode and run all gates

**Files:**

- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Note the new env in `.env.example`**

Append to the R5 section of `.env.example`:

```bash
# 【可选,线上模式】Upstash Redis(KV)与 Vercel Protection Bypass 由 Vercel 平台注入,
# 本地无需填写:
#   KV_REST_API_URL / KV_REST_API_TOKEN     Marketplace Upstash 集成自动注入
#   VERCEL_AUTOMATION_BYPASS_SECRET          开启 Protection Bypass for Automation 后注入
# 本地未配 KV 时,回调走进程内内存缓冲(仅单进程 dev 有效)。
```

- [ ] **Step 2: Add an "在线模式" subsection to the R5 docs in `README.md`**

Under the "R5 操作台" section, add:

```markdown
### 在线模式(部署到 Vercel 也能可靠收回调)

默认 R5 是本地联调。要让部署后的站点也能收回调,需三项(均在 Vercel 配置,代码自动适配):

1. **Upstash Redis(KV)**:Marketplace 加 Upstash 集成,自动注入 `KV_REST_API_URL/TOKEN`。回调改存 Redis(`cb:ref:<ref>` / `cb:recent`,TTL 7 天),跨实例不丢;本地无 KV 时自动回退内存。
2. **Protection Bypass for Automation**:Settings → Deployment Protection 开启,注入 `VERCEL_AUTOMATION_BYPASS_SECRET`。创建支付时自动把它作为 `x-vercel-protection-bypass` 拼进回调 URL,网关回调即可穿过 401;看板/操作台其余路径仍需登录。回调照样 RSA 验签。
3. **`PUBLIC_APP_URL`**:设为站点对外地址(如 `https://crypt-test-dashboard.vercel.app`),作为回调前缀。

> 权衡:bypass token 会出现在交给网关的回调 URL 中,可能进网关日志;对测试环境可接受,伪造防护仍是 RSA 验签。
```

- [ ] **Step 3: Run the full gate suite**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green — tests pass, no type errors, no lint errors, production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document /console online mode (Redis + bypass + PUBLIC_APP_URL)"
```

---

## Verification (post-implementation)

1. **Unit gates:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` all green.
2. **Merge to `main`** so Vercel's Git integration builds production (R5 + this work is currently on `feat/r5-payment-console`, not `main`).
3. **Live smoke (logged in):** open `/console`, fire a test payment; confirm the deposit address shows a copy button (with "已复制" feedback) and a scannable QR; after the gateway calls back, the callback list populates with a verified-signature badge and the payment reaches a terminal state.
4. **Bypass check:** a signed POST to `/api/webhooks/usd1pay?ref=...&x-vercel-protection-bypass=<secret>` returns `200 ok` (not 401); the same POST without the param returns 401.
5. **Redis check:** after a callback, `cb:ref:<ref>` exists in the Upstash console.
