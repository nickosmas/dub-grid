# Fix: The consent rate limit no longer refuses people behind one address

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-26
**Follows:** `blueprint/history/fixes/cookie-consent-records.md` (PR #182)

### The problem

#182 limited `POST /api/consent` to 60 records per 10 minutes per IP. On
2026-10-26, Playwright (webkit, shard 3/4) on PR #184 failed with 23 console
errors, all 429s from `/api/consent` (counted from the retry's trace). E2E
jobs reuse fixed client IPs by job index, and the release PR #183's E2E run
was going at the same time, so both runs drew on one budget.

Two things made it worse, and both would reach production:

1. **Everyone behind one address shared one budget.** A facility's staff sign
   in from the same office IP, and each person records a choice before
   signing in and again after.
2. **A refused client asked again on every page load.** A 429 left no record
   mark, so `ensureConsentRecorded` sent the choice on the next load, and the
   next, each one another 429.

### The fix

- **Per person when signed in:** the route resolves the user first. A signed-in
  record is limited by `consentUserLimiter` (20 per 10 minutes, keyed
  `consent:user:<id>`); a signed-out one by `consentIpLimiter` (300 per 10
  minutes, keyed `consent:ip:<ip>`).
- **Backoff:** a shared `consentRetryAt` in `@dubgrid/domain` turns a 429 or
  503 into a time to wait until, from `Retry-After` or 10 minutes without
  one. Web (localStorage) and mobile (SecureStore) store it, and
  `ensureConsentRecorded` sends nothing until it passes. A new choice from
  the banner is still sent at once, and a success clears the wait.

### Verification

- **Tests:** domain `consentRetryAt` (waits out `Retry-After` on 429 and 503,
  10 minutes without a usable header, nothing for other answers). Route: a
  signed-in record uses the user limiter and key, a signed-out one the IP
  limiter and key. Web and mobile: after a 429 with `Retry-After: 60`, checks
  send nothing until the minute passes. The backoff tests fail against the
  code before this fix.
- **Checks:** `npm run type-check`, ESLint, Prettier, `npm run docs:check`
  (the `privacy-controls` fingerprint was refreshed; nothing the page says
  changed), `npm run test:mobile` and `npm run test:web`.
