# Auth Errors & Edge Cases — DubGrid

**Date:** 2026-05-24 (findings) · re-verified 2026-05-25
**Scope:** The authentication surface — login (org/gridmaster/subdomain-selector),
logout, session lifecycle (`AuthProvider`, `RouteGuards`, token refresh),
org-switch, post-login gating (onboarding/trial/billing), MFA, impersonation,
sandbox, invitations, password reset, rate limiting, CSRF.
**Method:** Three parallel read-only sweeps, then every reported item re-checked
by hand against current source. Speculative leads that did not hold are recorded
in **Checked — not a finding** so the verification is auditable.

**How to read this doc.** It is a point-in-time findings log, not a living spec:
the **Fixed this pass** rows are the fixes shipped 2026-05-24, **Already fixed**
confirms earlier items, and **Checked — not a finding** records disproven leads
with their source reference. For the steady-state auth model see
`docs/authentication.md`; for RBAC see `RBAC_SYSTEM_DESIGN.md`. All rows below were
re-confirmed against current source on 2026-05-25.

> Companion to `SECURITY_AUDIT.md` (2026-05-21, F-1..F-7) and `POTENTIAL_BUGS.md`
> (2026-05-23, C/H/M/L). This doc does not restate their findings; it covers the
> auth-specific gaps found after them and records which were already fixed.

---

## Fixed this pass (2026-05-24)

| ID  | Sev | Title                                                                                                                                                                                                                                                                                | File                                                                   |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A1  | Low | Logout now sweeps **all** `dg_*` session/local keys (not just `dg_user_view`/`dg_user_name`) so onboarding flags / auth-transition / view-as-user can't leak into the next login in the same tab. Device prefs (`dg-…` hyphen, `dubgrid-cookie-consent`) preserved. Generalizes M-2. | `hooks/useLogout.ts`                                                   |
| A3  | Med | `AuthProvider` session-check timeout raised 5s→**12s** and no longer **wipes** persisted tokens on a bare timeout (only on a known-recoverable failure) — a slow-network refresh no longer becomes a silent logout.                                                                  | `components/AuthProvider.tsx`                                          |
| A4  | Low | `switch_org` RPC now rejects **suspended** orgs for normal members (was archived-only); gridmaster oversight path unchanged. _Needs `npm run db:reset` to apply in an existing env._                                                                                                 | `migrations/002_functions_triggers.sql`                                |
| B1  | Med | Per-**target-email** rate limit (`emailTargetLimiter`, 5/h, keyed by `hashEmail`) added to invite-email and gridmaster password-reset — the per-actor limit alone let one actor email-bomb a single inbox.                                                                           | `lib/rate-limit.ts` + `send-invite-email`, `gridmaster/password-reset` |
| B2  | Med | `invitations/lookup` now filters to **live** invitations (`expires_at > now()`, not accepted/revoked) and returns a uniform **404** — was leaking org name/slug for any/expired token.                                                                                               | `api/invitations/lookup/route.ts`                                      |
| B4  | Low | `start-trial` now checks the verified claim is `super_admin` for the requested org before the RPC (defense-in-depth on top of the self-gating RPC).                                                                                                                                  | `api/auth/start-trial/route.ts`                                        |
| B5  | Low | `logout-cleanup` only runs the gridmaster impersonation sweep for gridmaster claims (clean no-op otherwise) instead of for every authed caller.                                                                                                                                      | `api/account/logout-cleanup/route.ts`                                  |
| B6  | Low | A prior session's "view as user" toggle (`dg_user_view`) is cleared when a login switches orgs, so it can't silently force read-only on the new org.                                                                                                                                 | `app/login/page.tsx`                                                   |

Tests added: logout `dg_*` sweep + device-key preservation; `invitations/lookup`
404-for-dead-token; `start-trial` 403 for non-super_admin / org-mismatch claims.

---

## Already fixed — verified in current code (from POTENTIAL_BUGS)

These auth items were open in `POTENTIAL_BUGS.md` and are confirmed fixed:

- **H-3** — gridmaster MFA verify is now `async` + try/catch (no stuck screen).
- **M-2** — logout clears `dg_user_view` (now subsumed by A1's sweep).
- **M-3** — `checkRateLimit` wraps `limiter.limit` in try/catch (fails closed in prod).
- **M-5** — `consumeAuthTransition()` runs in a `useEffect`, not during render.
- **L-1** — `setUserViewActive` no-ops when unchanged (no re-render storm).
- **L-4** — onboarding step persists the _clamped_ index.
- **L-5** — `ProtectedRoute`'s 6s bounce uses a wall-clock deadline ref (no reset on auth churn).

---

## Checked — not a finding

Re-verified against code; disproven (with reference):

- **`accept_invitation` RPC** (`002:2279+`) is hardened: `FOR UPDATE` row lock + explicit checks for already-accepted, revoked, expired, **and recipient email match** (`lower(user_email) <> lower(invite.email)`). The accept route throws RPC errors as non-200. (Agent "already-accepted returns 200 / no expiry" — false.)
- **`account/terms`** writes `profiles.terms_version` — **per-user, not org-scoped**, so `requireAuthenticatedUser` is correct (no missing org check).
- **Middleware JWT fallback** never trusts a `gridmaster` claim from an unverified token; RLS is the real boundary. (SECURITY_AUDIT "verified sound".)
- **Rate limiter** fails **closed** (503) in production when Redis is unconfigured/unreachable. (SECURITY_AUDIT.)
- **JWT hook** strips org claims for archived/suspended orgs and deactivated users; honors `jwt_refresh_locks`. (SECURITY_AUDIT.)
- **`start_trial_for_org` / role-change RPCs** self-gate (super_admin membership; self/tier/last-super_admin guards). B4 adds belt-and-suspenders, not a fix.
- **Multi-tab org-switch race** is bounded: `caller_org_id()` is per-session (JWT-baked), so a sibling tab's `switch_org` can't leak into another session; RLS enforces final access.
- **Impersonation**: the cookie is re-verified server-side against the DB on every request, 30-min expiry checked with **server** time (the banner's client-time countdown is cosmetic), and `logout-cleanup` hard-expires the gridmaster's sessions.
- **Error sanitization** (`packages/client-errors`) blocks raw DB/JWT/SQL leaks. (SECURITY_AUDIT.)
- **Sandbox → real-org escalation** is the existing **H-1** in POTENTIAL_BUGS (mutation routes must use the effective orgId) — tracked there; not an auth-login issue.

---

## Edge cases noted (accepted / deferred)

- **A3**: even at 12s, a genuinely offline/hung refresh still ends in a logged-out state — acceptable (the timeout exists for stale remote↔local cookies); 12s just stops penalizing merely-slow networks.
- **A4**: the `switch_org` change only takes effect after the RPC is re-applied (`npm run db:reset` locally / migration run remotely).
- **`data-export` GET**: no CSRF/Upstash limit (audit-log gated, 1/hour, read-only) — low; deferred.
- **Login timing side-channel** (valid vs unknown email): mitigated by the generic 401 message; true constant-time is a Supabase-side concern.
