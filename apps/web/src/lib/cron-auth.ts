import { timingSafeEqual } from "node:crypto";

/**
 * Compares a request's bearer credential to a configured secret without
 * leaking where the two diverge.
 *
 * `!==` returns as soon as a byte differs. The secrets here are long and
 * random and the measurement would have to survive network jitter, so this
 * is hygiene rather than a live hole, but one helper settles it for every
 * cron route at once and gives the comparison a name.
 */
export function bearerMatchesSecret(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a signal we
  // cannot hide: a wrong-length credential is wrong whatever its bytes say.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
