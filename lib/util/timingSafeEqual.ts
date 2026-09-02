import crypto from "node:crypto";

// A per-process random key: HMAC-ing both operands with it before comparison
// gives fixed-length digests (so the length of the real secret never affects
// comparison time) and blinds the digests to anything an attacker can predict.
const BLIND_KEY = crypto.randomBytes(32);

/**
 * Constant-time string comparison that leaks neither the content nor the
 * length of the expected value via timing. Both inputs are HMAC-ed to a
 * fixed 32 bytes first, then compared with `crypto.timingSafeEqual`.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHmac("sha256", BLIND_KEY).update(a).digest();
  const hb = crypto.createHmac("sha256", BLIND_KEY).update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
