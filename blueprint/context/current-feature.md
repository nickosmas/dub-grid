# Current Feature

## Cookie consent records that hold up as proof

**Type:** Fix
**Status:** not started

## The problem

Every cookie choice is saved to `cookie_consents` through `POST /api/consent`
(`apps/web/src/app/api/consent/route.ts`), but the records can't prove who
consented to what:

1. **Mobile rows never name the person.** The route reads the session only
   from cookies, and the native app sends none, so every mobile row has
   `user_id = null` (`apps/mobile/src/features/consent/lib/consent.ts:89`).
2. **A choice made before sign-in is never tied to the account.** There is no
   visitor ID, so an anonymous row can't be matched to the browser that made it.
3. **A failed save is lost silently.** Both clients fire and forget, so
   analytics turn on in the browser while the server holds no record.
4. **The IP hash can be reversed.** It is an unkeyed SHA-256, and there are
   only about 4 billion IPv4 addresses to try.
5. **Rows can be changed.** `gridmaster_all_cookie_consents` grants `FOR ALL`,
   so a Gridmaster can edit or delete them through the data API.
6. **No rate limit, and the route can be skipped.** The route has no limiter,
   and `anon` and `authenticated` can insert straight into the table through
   the data API, so any limit on the route could be bypassed.
7. **`dg-theme` is set before consent without a choice.** `ThemeCookieSync` in
   `apps/web/src/components/ThemeProvider.tsx` writes the 1-year cookie on
   every visit, even for someone who never picked a theme. A live scan of
   www.dubgrid.com on 2026-10-25 found `dg-theme=light` as the only cookie
   set before consent, and Cookiebot's 2026-09-30 report flags prior consent
   as missing. A preference cookie is only exempt from consent once the
   person has made the choice it stores.

## The fix

The table is written by the route alone, through the service client. Rows can
only be added; deletion happens only with the account. Each client keeps
re-sending its current choice until the server has a record of it for the
signed-in person, or for an anonymous visitor.

Must not break:

- **The banner and analytics never wait on the network.** Consent still takes
  effect at once in the browser or app. A missing record is retried; analytics
  are not held back.
- **Account deletion and data export still cover these rows**
  (`features/account/server/account-deletion.ts`,
  `app/api/auth/data-export/route.ts`), along with the Gridmaster person record
  and the oversight counts.
- **No token, or a token that fails verification, still records the choice**,
  as anonymous. It is never refused.
- **Rate limiting must not lock out a whole facility on its first day.**
  Staff often share one office IP address, so the limit is generous.
- **A chosen theme still carries across subdomains**, through the cookie in
  production and the `?theme=` link parameter, and paints without a flash.

`dg-theme` is written only when someone picks a theme with the toggle. With
no cookie, the site uses its existing default.

Existing rows stay as they are: old IP hashes and anonymous mobile rows can't
be backfilled.

## Build steps

1. **Identify mobile users.**
   - The route takes a Bearer token (`extractBearerToken`, then
     `verifyAccessToken`) before it falls back to the cookie session.
   - The mobile `syncConsentToServer` sends `Authorization: Bearer <access token>`
     whenever a session exists.

   **Done when:** route tests show that a valid Bearer token records its user, an
   invalid one records an anonymous row, and no token keeps today's behavior. A
   mobile test shows the header is sent only when signed in.

2. **Record again after sign-in, and retry failed saves.**
   - A shared helper in a `packages/*` module decides whether the current choice
     still needs recording. It compares what was last recorded (policy version,
     plus the user id or anonymous) with the current version and current user.
   - After a 2xx response, each client stores what it recorded next to the
     choice.
   - The web banner checks on load and when the auth state changes. Mobile
     checks when its session changes. Each re-sends only when the helper says
     so.

   **Done when:** unit tests for the helper cover these cases: never recorded,
   recorded anonymously and now signed in, a different user, an old version, and
   already recorded (no re-send). The web and mobile tests show that a failed
   save is re-sent on the next check.

3. **Key the IP hash and rate-limit the route.**
   - `ip_hash` becomes an HMAC-SHA256 keyed by a new `CONSENT_IP_HASH_SECRET`,
     declared in `lib/env.server.ts`, classified in
     `internal/documentation/source-policy.json` (with the inventory
     regenerated) and added to `internal/secrets-rotation.md`.
   - If the secret is unset, the route stores `unavailable` and logs an error.
     It never falls back to the plain hash.
   - A new `consentLimiter` in `lib/rate-limit.ts` (60 per 10 minutes per IP)
     answers 429, or 503 when misconfigured. Step 2's retry covers either one.

   **Done when:** route tests show the keyed hash, the `unavailable` fallback and
   the 429. `npm run docs:check` passes.

4. **Make the table add-only (migration 094).**
   - Revoke `INSERT`, `UPDATE` and `DELETE` on `cookie_consents` from `anon`
     and `authenticated`.
   - Drop `anon_insert_cookie_consent` and `authenticated_insert_cookie_consent`.
   - Replace `gridmaster_all_cookie_consents` with a `FOR SELECT` policy.
   - Add a `BEFORE UPDATE` trigger that refuses every update, the service role
     included.
   - `users_read_own_cookie_consent` stays. Deletion stays service-role only,
     through account deletion.
   - Lock the file's hash in `checksums.sha256`.
   - Update `anon-holds-nothing.integration.test.ts` and
     `ledger-cleanup-sql.test.ts`, which assert today's `anon` insert grant.
     After this change, `anon` holds nothing at all.

   **Done when:** `npm run db:migrations:check` passes. A live test shows that
   `anon` and `authenticated` can't insert, a Gridmaster can read but not update
   or delete, any update is refused, and the route and account deletion still
   work.

5. **Write `dg-theme` only on a real choice.**
   - Remove the write in `ThemeCookieSync`'s effect. `ThemeToggleButton`
     calls `writeThemeCookie` when it sets a theme, the only place the app
     sets one.
   - The pre-paint seed script (`apps/web/public/dg-theme-seed.js`) still only
     reads the cookie.
   - Change the `dg-theme` row in the Cookie Policy to say it is set only once
     you choose an appearance. Bump `legal-policy-copy.test.ts` to match.
   - Leave existing cookies alone: a defaulted one can't be told apart from a
     real choice, and it expires on its own.

   **Done when:** a Playwright test shows that a fresh browser loading the
   landing page and `/login` has no `dg-theme` cookie and no `theme` in
   localStorage, and that clicking the toggle sets the cookie. If anything else
   writes `theme` to localStorage before a choice, find it and stop it in this
   step.

## Verify

- Run `npm run type-check`, `npm run lint`, `npm run test`, `npm run docs:check`
  and `npm run db:migrations:check`.
- **Web:** choose in the banner while signed out, then sign in. A second row
  appears with your `user_id` and the same choice, and reloading adds no further
  rows.
- **Mobile:** sign in on the simulator and change the choice under
  Profile > Privacy. The new row carries your `user_id` and the mobile user agent.
- **Theme:** in a fresh browser on production or a preview deploy, the only
  cookie before consent is none at all. Pick dark on the landing page, then
  open your organization's sign-in page: it paints dark.
- **Failure:** with `/api/consent` blocked, a choice still takes effect. Unblock
  it and reload, and the row appears.

## Not in scope

- **Changing the Privacy or Cookie Policy text.** Saying that a record of your
  choice is kept is a wording decision for the owner.
- **A retention period** for consent rows.
- **Backfilling** old rows.
