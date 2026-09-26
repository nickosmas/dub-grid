# Fix: Web sign-in request waves and loading jitter

**Type:** Fix
**Status:** in progress

## The problem

Web sign-in in production is slow because the browser waits on one request
after another, and each wait costs 0.4 to 1.1s for a user far from Oregon.
Server work is small (database about 70ms, Redis about 5ms from `pdx1`). The
same chain shows on screen as loading surfaces that mount more than once, a
blank frame and late layout.

Measured 2026-09-26 in production, ms from clicking Sign in:

| Wave | Organization sign-in (Super Admin, Calm Haven)           | Done | Gridmaster portal (no MFA)                | Done  |
| ---- | -------------------------------------------------------- | ---- | ----------------------------------------- | ----- |
| 1    | `POST /api/auth/login`                                   | 952  | `POST /api/auth/login`                    | 2603  |
| 2    | browser `GET supabase /auth/v1/user` (from `setSession`) | 2071 | browser `GET /auth/v1/user`               | 4486  |
| 3    | `/dashboard` RSC                                         | 3127 | `/dashboard` RSC                          | 6547  |
| 4    | `/api/account/org-context`, alone                        | 3573 | chunks, then org-context and portal chunk | 7423  |
| 5    | billing, employees, terms (trial-welcome after terms)    | 4201 | `/api/gridmaster/dashboard`               | 9345  |
| 6    | dashboard and header data                                | 5281 | GridmasterDashboard chunk, then overview  | 11077 |

On screen:

- **Organization:** the form's button spinner until 3.1s, "Loading your
  workspace" until 3.6s, a blank screen until 4.2s, the shell with a layout
  shift, then content at 5.3s.
- **Gridmaster:** the button spinner until 6.7s, a blank screen until 9.5s, the
  heading at 9.9s, then a 0.40 layout shift when the overview lands.

Causes, confirmed in code:

1. **`setSession` re-verifies tokens the server just issued.** auth-js
   `_setSession` calls `_getUser` for any unexpired token
   (`GoTrueClient.js:2820`). The navigation cannot start until it returns,
   because the auth cookie is written only afterwards.
2. **Dashboard data is chained.**
   - `org-context` starts only once `/dashboard` mounts, and its own wave gates
     `SetupGuard`.
   - For Super Admins, employees waits on billing (`AppShell.tsx:37-43`).
   - `DashboardView` waits on employees (`DashboardPageContent.tsx:83-85`).
   - `TrialWelcomeModal` chains terms, then org data, then trial-welcome.
3. **The loading surface is not one component.**
   - "Signing you in" and "Loading your workspace" are separate instances.
   - `OnboardingGate` returns a different tree per branch (`:80`, `:86-88`,
     `:107`), so going from /login to /dashboard remounts the shell.
   - `AppShell` renders no header until permissions, org data, employees and
     (for Super Admins) billing load, then the header pushes content down.
4. **Navigation links prefetch twice.** Schedule, People, Reports and Settings
   RSC are each fetched twice during dashboard load, and the signed-in person's
   own page three times. Each is a full server render.
5. **Gridmaster extras.**
   - The login route refreshes the session unconditionally (`route.ts:233`),
     even when the token already carries `platform_role=gridmaster`.
   - Gridmasters land on `/dashboard`, so the portal loads through
     `DashboardPageContent` and extra lazy chunks rather than `/gridmaster`.
   - `org-context` is fetched though a Gridmaster has no organization.
   - The `dg_auth_transition` flag is never cleared on this path
     (`OnboardingGate.tsx:243` clears it only for users with an organization).
   - The overview does not reserve its space, which causes the 0.40 layout
     shift.

## The fix

Remove waits from the critical path and give each sign-in one stable loading
surface. Server authorization does not change.

It must not break:

- **Session and tenant boundaries:** the middleware's unverified-decode fallback
  for non-Gridmasters, per-session organization isolation (`switch_org` stays
  the authorization boundary) and session revocation.
- **Navigation behavior:** the soft navigation after a same-organization
  sign-in, and the hard navigation after an organization switch.
- **Records and prompts:** the sign-in audit rows, the terms prompt and trial
  activation.

Out of scope, recorded as follow-ups:

- the MFA paths (about 10 to 11 sequential waves after the code);
- mobile sign-in (early navigation, duplicate `bootstrap` and
  `session-presence`, sequential auth reads);
- the 750 KB of JavaScript on `/login`;
- the dark-mode flash on the subdomain;
- the production security policy that blocks a background worker;
- cold starts on rarely used Gridmaster functions (about 1s per route on first
  hit).

## Build steps

- [x] **Step 1 - the browser takes the server's session without re-fetching
      the user.**
  - Spike first, then pick one mechanism:
    - the login route returns the full session with its user, and the
      client stores it through the auth client and emits `SIGNED_IN`;
    - or the login route writes the `@supabase/ssr` auth cookies on its
      response and the client adopts them.
  - Either way, the `/dashboard` request must carry the session cookie and
    `AuthProvider` must see the user without another `/auth/v1/user`.
  - Applies to the organization and Gridmaster forms, not the MFA paths.
  - _Done when:_ a unit or route test shows the chosen path, a local
    sign-in (organization and Gridmaster) makes no `/auth/v1/user` request
    between the login response and the `/dashboard` request, and the
    existing auth and per-session organization integration tests pass.
- [ ] **Step 2 - dashboard data starts together.**
  - Load org context with permissions and bootstrap as soon as the session
    exists, or derive it from them.
  - Employees and `DashboardView`'s queries no longer wait on billing,
    org-context or employees when the organization id is already known from
    the token.
  - Terms comes from one source; trial-welcome starts alongside it.
  - _Done when:_ tests show the queries are enabled from the token's
    organization id, and a local sign-in shows them starting in one wave
    after `/dashboard` commits.
- [ ] **Step 3 - one loading surface, no blank frame.**
  - One loading screen at a stable point in the tree, with a label that
    never goes backwards.
  - `OnboardingGate` keeps the same tree shape across its branches.
  - The header area reserves its height while it loads.
  - The auth-transition flag is cleared on every path that consumes it
    (the Gridmaster portal and `/accept-terms`).
  - _Done when:_ view tests show the loading screen is not remounted across
    the gate's states and the flag is cleared on the Gridmaster path, and a
    Playwright trace of local sign-in shows no empty-body frame between the
    form and the dashboard.
- [ ] **Step 4 - navigation prefetches once.**
  - Find why the header's links prefetch twice (a header remount versus the
    router cache) and make each route prefetch at most once per sign-in,
    without dropping prefetch for later navigation.
  - _Done when:_ a local sign-in's network log shows each navigation RSC
    prefetch once.
- [ ] **Step 5 - Gridmaster path.**
  - The login route skips the refresh when the token already carries
    `platform_role=gridmaster` (and keeps it when the claim is missing).
  - Gridmasters land on `/gridmaster`.
  - No `org-context` request for a Gridmaster.
  - The portal's dashboard data and its lazy chunk load in parallel.
  - The overview reserves its space.
  - _Done when:_ route tests cover the refresh skip and the missing-claim
    fallback, and a local Gridmaster sign-in reaches `/gridmaster` with no
    `org-context` request.

## Verify

- **Tests:** `npm run type-check`, `npm run test:web`, `npm run lint`, plus the
  auth e2e specs.
- **Local:** run the sign-in on a local dev server and confirm the request
  order for an organization sign-in, an organization-switch sign-in and a
  Gridmaster sign-in.
- **Production:** after release, repeat the browser-pane capture against the
  table above. Success is the organization sign-in reaching content in four
  waves or fewer, the Gridmaster portal in five or fewer, with no blank frame
  and layout shift under 0.1.
