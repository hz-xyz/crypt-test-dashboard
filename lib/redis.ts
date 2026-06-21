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
