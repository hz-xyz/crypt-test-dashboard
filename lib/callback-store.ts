import "server-only";

import type { CallbackRecord } from "./types";

/**
 * In-memory ring buffer of recently received gateway callbacks (R5 console).
 *
 * SCOPE: process-local and ephemeral by design. This is meant for local
 * `next dev` single-process integration testing of the gateway. On a
 * multi-instance deployment, callbacks land on whichever instance the gateway
 * happened to reach and are NOT shared — reliable cross-instance capture would
 * need shared storage (KV/Redis), which is intentionally out of scope.
 */

export const CALLBACK_BUFFER_CAP = 50;

// Oldest-first internally; readers get newest-first.
let buffer: CallbackRecord[] = [];

/** Append a callback, evicting the oldest once the cap is exceeded. */
export function record(entry: CallbackRecord): void {
  buffer.push(entry);
  if (buffer.length > CALLBACK_BUFFER_CAP) {
    buffer = buffer.slice(buffer.length - CALLBACK_BUFFER_CAP);
  }
}

/** All captured callbacks for a given correlation ref, newest-first. */
export function listByRef(ref: string): CallbackRecord[] {
  return buffer.filter((r) => r.ref === ref).reverse();
}

/** The most recent callbacks across all refs, newest-first. */
export function listRecent(limit = CALLBACK_BUFFER_CAP): CallbackRecord[] {
  return buffer.slice(-limit).reverse();
}

/** Test-only: empty the buffer. */
export function __resetForTest(): void {
  buffer = [];
}
