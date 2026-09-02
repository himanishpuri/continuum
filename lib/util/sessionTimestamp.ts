const FUTURE_SKEW_MS = 60_000;
const MAX_BACKDATE_MS = 366 * 24 * 60 * 60 * 1000; // a year

/**
 * A self-reported session's timestamp is trusted only within a sane window:
 * not in the future (small clock-skew allowance) and not more than a year
 * back. Anything outside that — or unparseable, or missing — falls back to
 * "now". Keeps progress stats from being poisoned by a backdated or
 * post-dated event.
 */
export function resolveSessionTimestamp(raw: string | undefined): string {
  const now = Date.now();
  if (raw) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed) && parsed <= now + FUTURE_SKEW_MS && parsed >= now - MAX_BACKDATE_MS) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date(now).toISOString();
}
