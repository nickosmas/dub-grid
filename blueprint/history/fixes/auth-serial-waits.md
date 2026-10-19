# Server-side serial waits on the web auth path

**Type:** Fix
**Status:** verified

## The problem

The 2026-10-18 speed audit found server work on the web sign-in and session
path that waited on one step before starting the next, or held a response for
work the response does not depend on. Each was confirmed in the code.

1. **Sign-in orchestration** (`app/api/auth/login/route.ts`). The terms check
   waited for the organization switch, though it needs only the user id. The
   session cookies were written after the trial, sandbox and terms steps
   settled. Sandbox teardown ran only when the sign-in switched organizations,
   so the browser made its own `exitSandbox()` call otherwise. The final
   success or challenge audit row was awaited before responding.
2. **The `/login` server render** checked the IP rate limit, then looked the
   organization up, on every request, though a warm cache hit never reaches
   the database the limit protects.
3. **Revocation lookups** (`lib/auth/revocation.ts`). A cold page fans out
   several authenticated requests before any has an answer to memoize, so each
   paid its own Redis read for the same session. `revokeOtherUserSessions`
   revoked peers one after another.
4. **`requireLiveAuthenticatedSession`** asked Auth for the live user only
   after the revocation check finished.
5. **Success audit writes** were awaited before responding in the bulk
   sign-out (`lib/auth/session-sign-out.ts`) and in MFA enrolment and factor
   removal (`features/account/server/mfa-lifecycle.ts`).
6. **Trial welcome** (`app/api/trial-welcome/route.ts`) ran the atomic claim,
   email render and Resend send before answering, though the modal reads only
   the welcome state.
7. **Invitation accept** sent its notification as a bare `void` promise, which
   serverless can cut off.
8. **Sandbox exit** deleted the cloned organization before clearing the cookie
   and answering.
9. **Organization bootstrap** waited for the permission check before starting
   its data fan-out; the account permissions route read the membership row
   after its `Promise.all`.
10. **Gridmaster impersonation start** ran the Gridmaster check, then the
    step-up check.

## The fix

1. `orchestratePostSignIn` starts the terms check first (its rejection is
   handled, so a refused sign-in discards it), starts the session cookies as
   soon as the final session is known, alongside trial, sandbox teardown and
   terms, and tears down the sandbox on every completed sign-in. A throw from
   the cookie writer now means "browser sets the session" rather than a 500.
   The final audit write runs in `after()`; refusals stay awaited.
2. `lookupOrgBySlug` takes an optional `admitMiss` gate that runs only on a
   cache miss, before the database. The page passes the IP limiter as that
   gate, so a refused miss answers "unresolved" as before and a warm hit costs
   no limiter round trip.
3. Concurrent lookups for one session share one in-flight Redis read. A
   revocation in the same isolate marks that read stale, so nothing joins it
   or memoizes its answer afterwards. Peers are revoked with `Promise.all`,
   which still rejects if any marker write fails; each `revokeSession` still
   writes its marker before deleting its row.
4. Authentication is split into token verification and admission. The live
   guard starts `getUser` after verification, alongside the revocation check,
   and reads it only after admission, so a revoked or challenged token is
   refused exactly as before.
5. Bulk sign-out, enrolment and factor-removal audits run in `after()`. The
   reauthentication audit stays awaited: its row marks the replacement session
   so `record_sign_in_once` never records it as a new sign-in, and a
   completion call could otherwise beat it.
6. Claim, send and rollback moved into `sendTrialWelcomeOnce`, run in
   `after()`. The atomic claim still allows one send.
7. The invitation notification runs in `after()`.
8. Exit clears the cookie and answers; the delete runs in `after()` and logs a
   failure. The daily `sandbox-cleanup` job is the backstop. Reset and enter
   are unchanged.
9. Bootstrap starts its fan-out alongside `requireOrgPermissions` when the
   organization came from verified claims, a verified impersonation row or an
   owned sandbox, never when it came only from the host. A refusal returns
   before the loaded data is read; if the permission check names another
   organization, the fan-out reruns for it. The permissions route folds the
   membership read into its existing `Promise.all`.
10. A start body that passes the schema starts `requireSensitiveActionAuth`
    alongside `requireGridmasterSession`. Its answer is read after the
    Gridmaster check and the input checks, so refusals keep their order. The
    boundary pin in `sensitive-action-authorization-boundaries.test.ts` now
    matches the new form.

Skipped:

- **Invite register limiters together.** Not equivalent: checking the
  per-email limiter alongside the IP limiter consumes the email's budget even
  when the IP is already limited, so one limited IP could exhaust an invitee's
  registration attempts. Left serial.
- **`/api/account/logout-cleanup` and `/api/auth/sign-out`.** No server change
  is needed for a client to skip calls: logout-cleanup is already an explicit
  no-op for non-Gridmasters.

Must not break: rate limits failing closed in production, CSRF on mutations,
step-up and fresh proof, strict revocation marker writes, `switch_org` as the
authorization boundary, the effective organization, MFA aal2 enforcement.

## Build steps

- [x] **1. Login orchestration overlaps its steps.** Done when terms start
      before the switch finishes, cookies start before terms settle, sandbox
      teardown runs without a switch, the audit runs in `after()`, and tests
      cover each.
- [x] **2. The login page consults the limiter only on a miss.** Done when a
      cached organization skips the gate and a refused miss never reads the
      database, with tests.
- [x] **3. Revocation reads coalesce and peers revoke together.** Done when a
      cold fan-out makes one Redis read, a read begun before a revocation is
      not reused after it, and a failed peer write still fails the call.
- [x] **4. The live guard overlaps Auth with revocation.** Done when `getUser`
      starts while revocation is pending and a revoked session is still 401.
- [x] **5 to 8. Work the response does not need runs in `after()`.** Done when
      the moved audits, trial welcome send, invitation notice and sandbox
      delete run in `after()`, with tests that the response does not wait.
- [x] **9. Bootstrap and permissions overlap their reads.** Done when the
      fan-out starts during the permission check for a verified organization,
      waits for a host-only one, and a refusal still answers first.
- [x] **10. Impersonation start overlaps its two checks.** Done when step-up
      starts during the Gridmaster check and the Gridmaster refusal still
      answers first.

## Verify

- `npx tsc --noEmit -p apps/web/tsconfig.json`, ESLint and Prettier on every
  changed file, and focused Vitest runs for the touched routes, helpers and
  the authorization boundary suites.

## Evidence

- `npx tsc --noEmit -p apps/web/tsconfig.json`: exit 0.
- `npx eslint` on the 27 changed web files: no problems.
- `npx prettier --check` on the same files: all formatted.
- `npx vitest run` over 24 files (api-auth, revocation, org-lookup, login
  page, login and login/complete routes, web and mobile sign-out,
  session-sign-out, mfa-lifecycle, mfa-remove-then-reconcile, trial-welcome,
  invitations accept and register, test-sandbox, bootstrap, account
  permissions and sessions, gridmaster impersonation, mobile auth-login, and
  the privileged, sensitive-action, API authorization and auth-integrity
  boundary suites): 352 of 352 passed.
- Not exercised against a running app, and the full web suite was not run.
  The browser still calls `exitSandbox()` after a sign-in until the client
  group removes it; a two-factor sign-in still relies on that call, since it
  completes in the browser.
