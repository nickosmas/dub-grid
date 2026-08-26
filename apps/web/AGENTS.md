# Web App Agent Instructions

Scope: `apps/web`, package `@dubgrid/web`.

Next.js 16 App Router. Routes under `apps/web/src/app`. Middleware at
`apps/web/src/middleware.ts`. API Route Handlers under `apps/web/src/app/api`.

## Verified Commands

- Dev (Turbopack): `npm --workspace @dubgrid/web run dev`
- Dev LAN: `npm --workspace @dubgrid/web run dev:lan`
- Test: `npm --workspace @dubgrid/web run test`
- Typecheck: `npm --workspace @dubgrid/web run type-check`
- Build: `npm --workspace @dubgrid/web run build`
- Analyze bundle: `npm --workspace @dubgrid/web run analyze`
- Email templates: `npm --workspace @dubgrid/web run email:build`
- Root web tests: `npm run test:web`

## Directory Map

```
apps/web/
  src/
    app/                            # Next.js App Router
    middleware.ts                   # Edge RBAC + org isolation (jwtVerify + decodeJwt fallback)
      api/                          # Route Handlers
        auth/                       # login, start-trial, etc.
        mobile/v1/                  # Mobile API (auth, bootstrap, me, notifications, org,
                                    #   people, profile, push-tokens, session-presence,
                                    #   shift-requests)
        gridmaster/                 # Gridmaster-only API routes
      gridmaster/                   # /gridmaster portal (platform_role only)
      dashboard/ people/ schedule/  # Main authed app routes
      settings/ reports/ profile/   # More authed routes
      login/ auth/ onboarding/      # Public / auth flows
    components/
      onboarding/OnboardingGate.tsx # Client-side onboarding interstitial (NOT SetupLockGate)
      AuthSplash.tsx                # Auth-settle bridge for post-login soft nav
      AuthProvider.tsx              # Auth context
      RouteBoundary.tsx             # ErrorBoundary + NotFoundBoundary
      ConfirmDialog.tsx             # Destructive-action confirmation
      EmptyState.tsx                # Only empty-state primitive (size: default|compact|inline)
      CustomSelect.tsx              # Always use instead of native <select>
      PageContainer.tsx             # Canonical authed-page wrapper
      CookieConsent.tsx             # CONSENT_VERSION must be bumped on cookie/policy changes
      Modal.tsx                     # Info dialogs only
      settings/shared.tsx           # SectionCard
      ui/editor-action-row.tsx      # EditorActionRow
      ui/switch.tsx                 # Switch (replaces hand-rolled toggles)
      auth/                         # Auth card primitives (dg-auth-* classes only)
      gridmaster/                   # Gridmaster portal UI components
    emails/                         # React Email components (source of truth)
      InviteEmail.tsx  TrialWelcomeEmail.tsx  NotificationEmail.tsx  etc.
    features/                       # Feature modules (account, billing, dashboard,
                                    #   employees, gridmaster, mobile, notifications,
                                    #   onboarding, organization, permissions, reports,
                                    #   schedule, settings, test-sandbox)
    hooks/                          # Shared React hooks
    lib/                            # Server + client utilities
      api-auth.ts                   # requireAuthenticated* — local JWT verify, no getUser() call
      auth/verify-token.ts          # JWKS keyset + local ES256 verification (shared w/ middleware)
      auth/revocation.ts            # Redis revocation markers — the other half of local verify
      csrf.ts                       # validateCsrfOrigin — call on all mutating Route Handlers
      cache.ts                      # Upstash Redis cache helpers
      rate-limit.ts                 # Per-IP and per-recipient rate limiting
      sandbox-cookie.ts             # Cookie-based Test Sandbox (not switch_org)
      auth-transition.ts            # markAuthTransition / isAuthTransitionPending
      db/                           # Data access layer (server-only)
      supabase.ts                   # Browser Supabase client
      supabase-service.ts           # Service-role client (server-only)
      env.ts                        # Env validation (Zod)
    types/                          # App-level TypeScript types
```

## Routing Rules

- App Router only. No Pages Router.
- Simple route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`.
- No catch-all routes (breaks Vercel static prerender). Requires explicit user approval.
- Route-specific helpers colocated, e.g. `apps/web/src/app/schedule/_lib`.

## Server and Client Component Rules

- Default to Server Components. Add `"use client"` only for browser APIs, event
  handlers, or React hooks.
- Push client boundaries to leaf components.
- Do not import server-only modules, service-role helpers, Stripe secret helpers,
  filesystem APIs, or Node-only APIs into Client Components.
- Do not expose server secrets via `NEXT_PUBLIC_*`.

## API, Auth, and Tenant Safety

- Validate input and check auth/authz inside every Route Handler or shared server helper.
- Do not rely on middleware alone for authorization.
- Mutating handlers must not use GET.
- Call `validateCsrfOrigin(req)` at the top of all mutating browser-facing Route Handlers.
- All mutations MUST use the effective (sandbox-redirected) `orgId` from
  `requireOrgPermissions`, never a raw request body `orgId`.
- Keep `gridmaster` access explicit and server-side.
- Apply rate limiting to public/side-effectful endpoints using `apps/web/src/lib/rate-limit.ts`.

## Key Behavioral Constraints

- **OnboardingGate**: `components/onboarding/OnboardingGate.tsx`. Not `SetupLockGate`.
- **Trial activation**: `POST /api/auth/start-trial` calls `start_trial_for_org` RPC.
  Called only on first `super_admin` login. Idempotent.
- **Org soft-delete**: `archived_at` on `organizations` revokes access at middleware,
  `get_my_organizations`, JWT hook, and `switch_org`.
- **Post-login soft nav**: `router.replace("/dashboard")` + `AuthSplash` bridge.
  Logout: swift, no splash, always redirects to `/login`.
- **Middleware JWT fallback**: `jwtVerify` catch block falls back to `decodeJwt`
  (unverified) for non-gridmaster users. Never remove this fallback. RLS is the
  real security boundary.
- **Email templates**: React Email source in `src/emails/`. Run `email:build` to
  regenerate `supabase/templates/*.html`. Auth email HTML is committed there.
- **Test Sandbox**: Cookie-based via `lib/sandbox-cookie.ts`. Not `switch_org`.

## Design System

`dg-btn-*` is the button vocabulary everywhere: authenticated surfaces, public
auth flows, and the landing page. The old `dg-auth-submit` pill is retired and
must not be reintroduced.

Input and label vocabularies are not interchangeable:

- `dg-input` / `dg-label` / `dg-form-error` — authenticated app surfaces.
- `dg-auth-input` / `dg-auth-link` / `dg-auth-heading` — public auth flows
  (pairs with `<AuthCard>` and `<PageShell>`).

Shared primitives — use before creating alternatives:
`<PageContainer>`, `<Switch>`, `<EditorActionRow>`, `<SectionCard>`,
`<EmptyState size="...">`, `<ConfirmDialog>`, `<Modal>`, `<ErrorBoundary>`,
`<NotFoundBoundary>`, `<CustomSelect>`.

Font: DM Sans only (`var(--font-dm-sans)`). Never Geist.

## Double-Press

An action button that fires a request must not run it twice when it is
double-clicked. **A `useState` busy flag does not achieve that on its own**:
the flag only reaches the DOM once React re-renders, and a second click inside
that window passes a `disabled` that has not been applied yet. That is not
theoretical — reverting the latch in `ConfirmDialog` makes
`apps/web/src/__tests__/ConfirmDialog.test.tsx` fire the confirm handler twice.

`useAsyncAction` (`src/hooks/useAsyncAction.ts`) is the fix. Its latch is a
`useRef`, read and set synchronously inside the first click, so re-entry is
blocked before any render happens; the `isRunning` it returns exists only to
drive the spinner. **Do not "simplify" that ref into state** — that is the bug.

It is a no-op for a synchronous handler (returns before touching state), which
is what lets shared primitives wrap every caller's handler blindly:

- `<ConfirmDialog>` wraps `onConfirm` and `onSecondaryConfirm`. An async
  handler gets the latch and the spinner for free. Pass `isLoading` only when
  the pending flag lives somewhere else (a shared `actionLoading` keyed by
  row); an explicit `isLoading` always wins over the internal one.
- Anywhere else: `const save = useAsyncAction(handleSave)`, then
  `onClick={save.run}`, `disabled={save.isRunning}`, and
  `<ButtonLoading loading={save.isRunning} loadingLabel="Saving Draft">` —
  the progressive form of _that button's own verb_, not a generic "Saving".

`design/require-busy-button` enforces this for `<button>` elements whose
`onClick` resolves to an async function in the same file. It cannot resolve a
handler arriving as a prop, so a prop-sourced action button is still on you.

## Unsaved Changes

Nothing holding user input may be thrown away silently. Two guards, by surface —
they compose, and a modal that wants both is fine:

- **A modal guards its own dismissal.** `useUnsavedChangesPrompt` returns
  `{ requestClose, unsavedChangesDialog }`; wire `requestClose` into
  `<Modal onRequestClose>`, which is the single veto point for Escape, the
  backdrop and the X button. Render `unsavedChangesDialog` as a sibling.
- **A page-level editor guards navigation.** `useNavigationGuard(id, { isDirty })`
  registers with `NavigationGuardProvider` (mounted around `<AppShell>` in
  `app/layout.tsx`), which asks before an in-app link click and before tab
  close/refresh. Never add a bare `beforeunload` — the provider owns it, and a
  second one prompts twice.

The provider intercepts with one capture-phase click listener on `document`
rather than per-`Link` `onNavigate`, so links added later are covered by
default. That listener's skip-list (modifier clicks, `target`, `download`,
cross-origin, `mailto:`, in-page hashes) is the whole risk surface — a missed
case breaks cmd-click app-wide, so every branch has a test in
`__tests__/NavigationGuardProvider.test.tsx`. It resumes a confirmed navigation
by **replaying the original click**, not by calling `router.push`, so a
`<Link replace>` stays a replace.

Deliberately not covered, and documented as such: browser Back/Forward, and
programmatic `router.push`.

## Mobile API Contract Safety

- `apps/web/src/app/api/mobile/v1/` serves the mobile app.
- Preserve request/response contracts in `@dubgrid/contracts` (`./mobile` export).
- When changing mobile API behavior, run `npm run test:mobile` in addition to web checks.

## Environment Rules

- Variable names from `.env.example` or `apps/web/.env.example` only.
- `NEXT_PUBLIC_*` is browser-visible.
- `SUPABASE_SECRET_KEY`, Stripe, Resend, Upstash, Sentry tokens are server-only.

## Verification

- UI/component changes: `npm --workspace @dubgrid/web run test` + typecheck.
- Route handler / auth / tenant / DB / Stripe changes: typecheck + targeted tests;
  `npm --workspace @dubgrid/web run build` when build/runtime boundaries are affected.
- Mobile API contract changes: also run `npm run test:mobile`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
