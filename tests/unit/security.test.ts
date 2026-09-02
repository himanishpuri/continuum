import { beforeEach, describe, expect, it } from "vitest";
import { timingSafeEqualStr } from "@/lib/util/timingSafeEqual";
import { checkRateLimit, rateLimitKeyCount, resetRateLimits } from "@/lib/util/rateLimit";
import { resolveSessionTimestamp } from "@/lib/util/sessionTimestamp";

describe("timingSafeEqualStr", () => {
  it("is true only for exactly equal strings", () => {
    expect(timingSafeEqualStr("s3cr3t-token", "s3cr3t-token")).toBe(true);
    expect(timingSafeEqualStr("s3cr3t-token", "s3cr3t-toke")).toBe(false); // shorter
    expect(timingSafeEqualStr("s3cr3t-token", "s3cr3t-tokeX")).toBe(false); // same length, differs
    expect(timingSafeEqualStr("", "")).toBe(true);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit, then returns a retry-after", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("user-a", 3, 60_000).ok).toBe(true);
    }
    const blocked = checkRateLimit("user-a", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    checkRateLimit("user-b", 1, 60_000);
    expect(checkRateLimit("user-b", 1, 60_000).ok).toBe(false);
    expect(checkRateLimit("user-c", 1, 60_000).ok).toBe(true);
  });

  it("caps the number of tracked keys", () => {
    for (let i = 0; i < 10_050; i++) checkRateLimit(`u-${i}`, 100, 60_000);
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(10_000);
  });
});

describe("resolveSessionTimestamp", () => {
  it("keeps a plausible recent timestamp", () => {
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    expect(resolveSessionTimestamp(yesterday)).toBe(yesterday);
  });

  it("falls back to now for future, ancient, or garbage input", () => {
    const before = Date.now();
    for (const bad of [
      new Date(Date.now() + 3 * 24 * 3600_000).toISOString(), // future
      "2019-01-01T00:00:00.000Z", // > 1 year back
      "not a date",
      undefined,
    ]) {
      const t = Date.parse(resolveSessionTimestamp(bad));
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });
});
