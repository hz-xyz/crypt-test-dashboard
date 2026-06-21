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
    try {
      const k = refKey(entry.ref);
      // LPUSH puts newest at the head; LTRIM caps; EXPIRE bounds retention.
      // @upstash/redis serializes the object automatically.
      await redis.lpush(k, entry);
      await redis.ltrim(k, 0, CALLBACK_BUFFER_CAP - 1);
      await redis.expire(k, CALLBACK_TTL_SECONDS);
      await redis.lpush(RECENT_KEY, entry);
      await redis.ltrim(RECENT_KEY, 0, RECENT_CAP - 1);
      await redis.expire(RECENT_KEY, CALLBACK_TTL_SECONDS);
    } catch (e) {
      // Never throw: the webhook must still reply 200 "ok" so the gateway does
      // not enter a retry storm. Losing one captured callback is preferable.
      console.error("[callback-store] record failed:", e);
    }
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
    try {
      return (await redis.lrange<CallbackRecord>(refKey(ref), 0, -1)) ?? [];
    } catch (e) {
      console.error("[callback-store] listByRef failed:", e);
      return [];
    }
  }
  return buffer.filter((r) => r.ref === ref).reverse();
}

/** The most recent callbacks across all refs, newest-first. */
export async function listRecent(
  limit = CALLBACK_BUFFER_CAP,
): Promise<CallbackRecord[]> {
  const redis = getRedis();
  if (redis) {
    try {
      return (
        (await redis.lrange<CallbackRecord>(RECENT_KEY, 0, limit - 1)) ?? []
      );
    } catch (e) {
      console.error("[callback-store] listRecent failed:", e);
      return [];
    }
  }
  return buffer.slice(-limit).reverse();
}

/** Test-only: clear the in-memory buffer. */
export async function __resetForTest(): Promise<void> {
  buffer = [];
}
