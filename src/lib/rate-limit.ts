type Window = { hits: number[] };

const windows = new Map<string, Window>();

/**
 * In-memory sliding window. Fine for demo / single Node process.
 * Returns retryAfterSec when blocked.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let bucket = windows.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    windows.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.hits[0]! + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  bucket.hits.push(now);
  return { ok: true };
}

export function clientKey(request: Request, sessionId?: string): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || request.headers.get("x-real-ip") || "local";
  return sessionId ? `${ip}:${sessionId}` : ip;
}

export function rateLimitResponse(retryAfterSec: number) {
  return {
    error: "Too many requests. Slow down.",
    retryAfterSec,
  };
}
