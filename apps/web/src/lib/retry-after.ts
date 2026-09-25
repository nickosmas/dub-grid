/**
 * Seconds a throttled caller should wait, for a `Retry-After` header.
 * `reset` is the limiter's window end as an epoch in milliseconds, so it has
 * to be measured against now; dividing it alone advertises a wait of decades.
 */
export function retryAfterSeconds(reset: number | undefined, now = Date.now()): number {
  if (!reset) return 60;
  return Math.max(1, Math.ceil((reset - now) / 1000));
}
