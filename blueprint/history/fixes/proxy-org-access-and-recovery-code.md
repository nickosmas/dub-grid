# Proxy membership check, mobile code resend, and a shorter recovery code

**Type:** Fix
**Status:** verified

## The problem

Three gaps left out of scope by `auth-security-batch.md`, each confirmed in the
code on `dev` (0b2c4315).

1. **The proxy's organization cache could answer a removed member with another
   member's row.** `readOrgAccess` in `proxy.ts` memoized (10 s, per isolate)
   and cached (Redis `dg:mw:orgAccess:<org>`, 30 s) the organization row per
   organization, but read it as the caller under RLS, where "no row" is the
   verdict that the caller's membership is gone. Once any member had filled the
   memo or Redis, a just-removed member got that row back and skipped the
   redirect to `/login`. The platform billing policy was then read only after
   the row, so a cold gate paid two reads in a row.
2. **Mobile "Resend code" called Supabase Auth directly.**
   `ResetPasswordScreen.resendCode` used `supabase.auth.resetPasswordForEmail`,
   skipping DubGrid's per-address, per-device and surge limits and the uniform
   answer that `/api/mobile/v1/auth/recovery-request` gives the first request.
   Its toast also promised "We sent a new code." for any address.
3. **Recovery codes lived for an hour.** `otp_expiry = 3600` in
   `supabase/config.toml` gave a 6-digit code an hour of guessing, while
   verification is limited only per IP.

## The fix

1. The gate now reads two separate things, together with the platform billing
   policy, in one `Promise.all`:
   - the organization's state (`ORG_ACCESS_SELECT`) with the service client,
     memoized and cached per organization under the same key, so `stripe.ts`,
     the Gridmaster manage route and `access-status` keep invalidating or
     refreshing it unchanged;
   - whether the caller can still see the organization their token names
     (`select id` as the caller under RLS), memoized and cached per person and
     organization (`CacheKey.mwOrgVisible`). Only `true` is ever kept; a miss
     is never memoized or written to Redis.

   The decisions still run in the old order: not visible (or no organization)
   goes to `/login`, then archived, suspended and billing. A read failure still
   falls through to the best-effort catch, so no state is acted on unless
   visibility was answered. `/billing-required` still bypasses both caches and
   refreshes them. `evaluateOrgBillingAccess` takes the already-read policy
   through a new optional `policy` option. Member removal
   (`DELETE /api/organizations/access`) deletes the removed person's visibility
   key; other isolates' memos lapse within 10 s.

   Visibility is asked about the token's organization, captured before the
   Test Sandbox override. RLS (`caller_org_id()`) answers from the token's
   claim, so the old read of the sandbox copy as the caller could never return
   a row.

2. The resend calls `requestPasswordRecovery`, the same server request as the
   first send, through `settleMobileAuthAction`. A 429 or transport failure
   still shows the existing error copy; success starts the cooldown and says
   "If an account uses this email, we sent a new code."
3. `otp_expiry = 900` locally. `otp_expiry` covers every emailed link and code,
   so the recovery, email-change and reauthentication emails now say 15
   minutes (react-email sources, regenerated `supabase/templates/`, and the
   template test that pins the copy to `config.toml`).

## Build steps

- [x] **1. Separate organization state from the caller's visibility.** Done
      when a removed member is sent to `/login` while another member's state is
      memoized, the three reads start before any resolves, and the existing
      gate tests pass.
- [x] **2. Resend through the server.** Done when the resend calls
      `requestPasswordRecovery`, never Supabase Auth, and a rate-limited resend
      shows the error without a toast.
- [x] **3. 15-minute codes.** Done when `config.toml` sets 900 and every
      template that states the lifetime says 15 minutes.

## Verify

- `tsc --noEmit` for web and mobile, ESLint and Prettier on every changed file,
  and the focused suites below.

## Evidence

- `npx tsc --noEmit -p tsconfig.json` in `apps/web`: clean.
  `npx tsc --noEmit -p apps/mobile/tsconfig.json`: clean.
- `npx eslint` and `npx prettier --check` on every changed file (and the
  regenerated templates): clean.
- `npx vitest run src/__tests__/middleware.test.ts`: 56 passed. The two new
  cases fail against the `dev` proxy (memoized row lets the removed member
  through; the reads ran one after another).
- `npx vitest run src/app/api/organizations/access/route.test.ts`: 8 passed.
- `npx vitest run src/lib/stripe.test.ts
src/app/api/organization/access-status/route.test.ts
src/__tests__/cache.test.ts`: all passed.
- `npm run -s email:build` then `npx vitest run
src/emails/auth/supabase-templates.test.ts`: 40 passed; the template diff is
  the three lifetime sentences only.
- Mobile `npx vitest run
src/features/auth/screens/ResetPasswordScreen.test.tsx`: 32 passed.
- Not exercised against a running app or Redis.

## Not done here

- Production's OTP lifetime is a Supabase Auth setting. The owner must set it
  to 900 seconds in the dashboard, or push it with
  `scripts/push-auth-templates.ts`, which sends `otp_expiry` together with the
  templates. Changing only one of them would make the emails state the wrong
  lifetime.
