/**
 * Minimal in-process sliding-window rate limiter keyed by user id.
 *
 * Scope: this app runs as a single Vercel function instance / one Cloud Run
 * container at the scale it targets, so an in-memory map is sufficient. It does
 * NOT coordinate across instances — move to Firestore / Redis if the deployment
 * is ever scaled out.
 *
 * Memory: a hard cap evicts the least-recently-touched key (the map preserves
 * insertion order), so it can't grow without bound as distinct users accumulate.
 */
type Bucket = number[]; // request timestamps (ms), oldest first

const MAX_KEYS = 10_000;
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry, when `ok` is false. */
  retryAfter: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    // Re-insert so the key is treated as recently used by the eviction pass.
    buckets.delete(key);
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.max(Math.ceil((hits[0] + windowMs - now) / 1000), 1) };
  }

  hits.push(now);
  buckets.delete(key);
  buckets.set(key, hits);

  if (buckets.size > MAX_KEYS) {
    // Map preserves insertion order; the first key is the least-recently-touched.
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  return { ok: true, retryAfter: 0 };
}

/** Test-only: drop all state. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test-only. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}
