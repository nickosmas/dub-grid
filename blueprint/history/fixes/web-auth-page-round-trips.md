# Fewer serial round trips on the web auth pages

**Type:** Fix
**Status:** verified (unit tests only)

## The problem

The 2026-10-18 speed audit found web auth pages that wait on requests one
after another although none depends on the previous answer, or that make a
request whose answer is already known. Each item was checked in the code first.

1. **Org two-factor finish is serial.** `OrgLogin.tsx`'s `handleMFAVerified`
   awaited `startBrowserTrial` for every role, then the terms check, then
   `login/complete`. The start-trial route refuses anyone but the
   organization's Super Admin (`claims.org_role !== "super_admin"` answers 403),
   so for every other role it was a wasted round trip.
2. **Redundant client sandbox exit on the password path.** `handleSubmit`
   called `exitSandbox()` after every non-switch sign-in. The login response
   already clears the sandbox cookie on a completed sign-in, and the server
   tears the sandbox down (on a switch today; on every completed sign-in once
   G2 lands).
3. **Gridmaster two-factor finish.** `GridmasterLogin.tsx` always refreshed
   the session, then recorded the sign-in, then checked terms, and landed on
   `/dashboard` with nothing primed. The refresh exists so the access-token
   hook stamps `platform_role` on a token minted without it (a6a46d5f, and the
   login route's own comment); the password path already skips it when the
   token carries the role.
4. **MFAVerify's `setBrowserSession`.** Claimed redundant after
   `challengeAndVerify`.
5. **Invite acceptance.** `login/complete`, accept and the terms POST ran one
   after another, then `signOutFromBrowser("global")` signed an existing
   multi-organization user out of every other device just for accepting an
   invitation. The comment claimed local scope would leave a stale refresh
   token.
6. **Web sign-out.** `/goodbye` called `/api/account/logout-cleanup` (a no-op
   unless the caller is a Gridmaster), then `signOutFromBrowser("local")`
   awaited `/api/auth/sign-out` before starting Auth's `/logout`.
7. **Impersonation preflight.** `EnhancedImpersonation.tsx` called
   `requireCredentialAssurance` before the start request, which runs
   `requireSensitiveActionAuth` itself before changing anything.
8. **Recovery tidy-up.** `completeBrowserPasswordRecovery` awaited the local
   `supabase.auth.signOut` after the global revocation had already ended every
   session, with no deadline.

## The fix

1. `startTrialForSuperAdmin` asks only when the session's decoded `org_role`
   is `super_admin`. Once the session is in its organization, the terms check,
   `login/complete`, the trial and (after a switch) the sandbox exit run in one
   `Promise.all`. `switchToOrgAndPrepare` now does only the switch and refresh
   and resolves to the refreshed claims, so the switch and refresh still come
   first and the trial reads the switched session's role. Navigation is
   unchanged: hard after a switch, soft otherwise.
2. Both password-path `exitSandbox()` calls are gone. The two-factor path
   keeps its own (fire-and-forget without a switch, awaited after one) because
   no login-route teardown runs after a second factor: that request returned
   `mfa_required` and cleared nothing.
3. The refresh runs only when the verified token lacks
   `platform_role: "gridmaster"`. The sign-in record and the terms check run
   together, the destination is `GRIDMASTER_POST_LOGIN_DESTINATION` (through a
   new `home` argument on `resolvePostLoginDestination`), and the portal is
   primed with `primeSignInQueries` as on the password path.
4. **Skipped.** In auth-js 2.104.1 (the copy apps/web resolves) `_verify`
   awaits `_saveSession` before returning, so the session is persisted. But it
   emits `MFA_CHALLENGE_VERIFIED`, not `SIGNED_IN`. AuthProvider trusts the
   session's user (no `getUser`) and calls `trackSession` only on `SIGNED_IN`
   or `TOKEN_REFRESHED`, so removing the call would move the `/user` request
   rather than save it and would stop recording the verified session. Item 3
   relies on this too: without a refresh, that `SIGNED_IN` is what tracks a
   Gridmaster's verified session.
5. `finishAcceptance` sends the sign-in record and the terms record alongside
   the acceptance and waits for both on every path before any sign-out. Each
   needs only the signed-in session; the server refuses both on a
   password-only session that owes a second factor, as before. Acceptance
   keeps its error handling and single-use semantics, and "accepted" is still
   shown only after it succeeds. The sign-out is now `"local"`: auth-js's local
   `signOut` POSTs `/logout?scope=local`, which ends this session and its
   refresh token on the auth server, and the DubGrid route writes the
   revocation marker.
6. `/goodbye` skips logout cleanup when the session's token is readable and
   not a Gridmaster's; an unreadable session still asks. `signOutFromBrowser`
   sends the sign-out POST first and runs Auth's `/logout` alongside it,
   waiting for both. Safe because the route verifies the token locally
   (`verifyAccessToken`, JWKS) and writes the marker by session id, so Auth
   ending the session first cannot fail it. `beginLogout` and the hard
   navigation in `useLogout` are untouched.
7. The preflight is dropped. The start route refuses with the standard step-up
   403 before any mutation, `requestGridmasterJson` keeps its `code` and
   `method`, and `useStepUpAction.run` turns it into the prompt and retries.
8. After a successful global revocation the local sign-out is started, not
   awaited (mobile's `leaveRecovery` pattern). If the revocation failed it is
   still awaited, since it is then what ends this session server-side.

Kept: fresh proof for sensitive actions, CSRF, `login/complete` requiring a
fresh second factor, terms gating, single-use invitations, revocation on
sign-out.

Other `requireCredentialAssurance` preflights (not changed, candidates for the
same review): `EditEmployeePanel`, `GridmasterAccountsView`,
`GridmasterComplianceView`, `DangerZone`, `GridmasterPersonView`,
`OrganizationSetupWizard`, `PersonMembershipActions`, `PersonHistoryCard`,
`UsersTab`, `usePersonSecurityActions`, `PersonStaffActions`,
`ProfileChangeRequestQueue`, `SecurityPanel`, `ProfilePanel`,
`DeleteAccountCard`.

## Build steps

- [x] **1. Org two-factor finish runs concurrently.** Done when only a Super
      Admin's session asks for a trial and the terms check and sign-in record
      do not wait on it, with tests for both roles and the switched session.
- [x] **2. Password path stops exiting the sandbox.** Done when the
      cookie-set sign-in no longer calls `exitSandbox`.
- [x] **3. Gridmaster two-factor finish.** Done when a stamped token skips the
      refresh, an unstamped one refreshes once, and both land on `/gridmaster`
      primed, with tests.
- [x] **4. MFAVerify.** Investigated and left, for the reasons above.
- [x] **5. Invite acceptance.** Done when the three requests are in flight
      together, the sign-out waits for them, and it is local, with tests.
- [x] **6. Sign-out.** Done when non-Gridmasters skip cleanup, an unreadable
      session does not, and the revocation and Auth logout overlap, with tests.
- [x] **7. Impersonation preflight dropped.** Done when the start route's own
      refusal reaches the prompt, with a test.
- [x] **8. Recovery tidy-up not awaited.** Done when a stalled local sign-out
      no longer holds recovery after a successful revocation, and a failed
      revocation still waits for it, with tests.

## Evidence

- `npx tsc --noEmit -p apps/web/tsconfig.json`: clean.
- ESLint (`--max-warnings 0`) and Prettier on every changed file: clean.
- Focused suites, 23 files and 197 tests passing: login (`page`,
  `GridmasterLogin`, `DomainSelector`, `shared`), accept-invite, goodbye,
  reset-password, `MFAVerify`, `features/account/client`,
  `EnhancedImpersonationStepUp`, `useLogout`,
  `effective-tenant-session-boundaries`, `architecture-boundaries`.
- `npm run docs:check`: clean after re-recording the quickstart, onboarding
  and profile fingerprints (their evidence includes `OrgLogin.tsx`,
  `accept-invite/page.tsx` and `RunLogoutTeardown.tsx`; no customer-facing
  behavior they describe changed).
- Not verified in a browser or against a running app: no sign-in, two-factor,
  invitation, sign-out or impersonation flow was exercised live, and no
  timings were measured.
