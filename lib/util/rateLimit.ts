/**
 * Minimal in-process sliding-window rate limiter keyed by user id.
 *
 * Scope: this app runs as a single Vercel function instance / one Cloud Run
 * container at the scale it targets, so an in-memory map is sufficient. It does
 * NOT coordinate across instances — move to Firestore / Redis if the deployment
 * is ever scaled out.
 */
type Bucket = number[]; // request timestamps (ms), oldest first

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
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfter: 0 };
}

/** Test-only: drop all state. */
export function resetRateLimits(): void {
  buckets.clear();
}
