import { beforeEach, describe, expect, it } from "vitest";
import { timingSafeEqualStr } from "@/lib/util/timingSafeEqual";
import { checkRateLimit, resetRateLimits } from "@/lib/util/rateLimit";

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
});
