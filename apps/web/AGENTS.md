# Web App Agent Instructions

Scope: `apps/web`, package `@dubgrid/web`.

Next.js 16 App Router. Routes under `apps/web/src/app`. The Next.js request
proxy is `apps/web/src/proxy.ts`. API Route Handlers live under
`apps/web/src/app/api`.

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
    proxy.ts                        # Request proxy: RBAC + org isolation (jwtVerify + decodeJwt fallback), CSP
    app/                            # Next.js App Router
      api/                          # Route Handlers (154 files; see internal/api-reference.md)
        auth/                       # login, recovery-request, sign-out, start-trial, etc.
        cron/                       # expire-requests, trial-expiry, sandbox-cleanup (CRON_SECRET)
        mobile/v1/                  # Mobile API (auth, bootstrap, dashboard, org-status, me, org,
                                    #   people, management-users, profile, notifications,
                                    #   shift-requests, push-tokens, session-presence)
        gridmaster/                 # Gridmaster-only API routes (+ platform-flags, audit-log)
      (app)/                        # Route group holding every authed and auth-flow page
        layout.tsx                  # NavigationGuardProvider + AppShell
        gridmaster/                 # /gridmaster portal (platform_role only)
        dashboard/ people/ schedule/ alerts/   # Main authed app routes
        settings/ reports/ profile/ account/   # More authed routes
        login/ auth/ onboarding/ accept-terms/ # Auth flows and gates
      request-demo/ privacy/ terms/ cookie-policy/  # Public pages
    components/
      onboarding/OnboardingGate.tsx # Client-side onboarding interstitial (NOT SetupLockGate)
      AuthSplash.tsx                # Auth-settle bridge for post-login soft nav
      AuthProvider.tsx              # Auth context
      RouteBoundary.tsx             # ErrorBoundary + NotFoundBoundary
      ConfirmDialog.tsx             # Destructive-action confirmation
      EmptyState.tsx                # Only empty-state primitive (size: default|compact|inline)
      CustomSelect.tsx              # Always use instead of native <select>
      PageContainer.tsx             # Canonical authed-page wrapper
      CookieConsent.tsx             # CONSENT_VERSION must be bumped on cookie/policy changes (mirror in mobile)
      NavigationGuardProvider.tsx   # useNavigationGuard: in-app link + tab-close guard
      PermissionsEditor.tsx         # Per-admin permission switches (People page + gridmaster)
      ButtonSpinner.tsx             # ButtonLoading: spinner replaces the icon, label unchanged
      Modal.tsx                     # Task/info dialogs; shared Base UI focus lifecycle
      settings/shared.tsx           # SectionCard
      ui/editor-action-row.tsx      # EditorActionRow
      ui/switch.tsx                 # Switch (replaces hand-rolled toggles)
      ui/number-field.tsx           # NumberField: minus / value / plus stepper, never type="number"
      ui/numeric-badge.tsx          # NumericBadge: the one count-pill contract (design-tokens)
      ui/use-unsaved-changes-prompt.tsx  # useUnsavedChangesPrompt for Modal dismissal
      activity/                     # Date-navigated activity log (org, person, gridmaster)
      dashboard/ staff/ staff-detail/ settings/ profile/ account/  # Feature UI
      auth/                         # Auth card primitives (dg-auth-* classes only)
      gridmaster/                   # Gridmaster portal UI components
    emails/                         # React Email components (source of truth)
      InviteEmail.tsx  TrialWelcomeEmail.tsx  NotificationEmail.tsx  etc.
    features/                       # Feature modules (account, billing, dashboard,
                                    #   employees, gridmaster, mobile, notifications,
                                    #   onboarding, organization, permissions, reports,
                                    #   schedule, settings, test-sandbox)
    hooks/                          # Shared React hooks (useAsyncAction, useSchedulePresence,
                                    #   useOrgRealtimeInvalidation, useStepUpAction, ...)
    lib/                            # Server + client utilities
      api-auth.ts                   # requireAuthenticated* — local JWT verify, no getUser() call
      auth/verify-token.ts          # JWKS keyset + local ES256 verification (shared with proxy)
      auth/revocation.ts            # Redis revocation markers — the other half of local verify
      auth/security-audit.ts        # Security-event audit writes (no secrets)
      auth/integrity-contract.ts    # Pinned auth-action redirect destinations
      audit/                        # Audit registry, audience scoping, day counts
      feature-flags.ts              # Platform kill switches (Redis + data cache)
      csrf.ts                       # validateCsrfOrigin — call on all mutating Route Handlers
      cache.ts                      # Upstash Redis cache helpers
      rate-limit.ts                 # Per-email / per-IP / global login limits, recovery, invite, api limiters
      sandbox-cookie.ts             # Cookie-based Test Sandbox (not switch_org)
      auth-transition.ts            # markAuthTransition / isAuthTransitionPending
      db/                           # Data access layer (server-only)
      supabase.ts                   # Browser Supabase client
      supabase-service.ts           # Service-role client (server-only)
      env.ts                        # Public env validation (Zod); env.server.ts holds the server schema
    types/                          # App-level TypeScript types
```

## Routing Rules

- App Router only. No Pages Router.
- Simple route files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`.
- No catch-all routes (breaks Vercel static prerender). Requires explicit user approval.
- Route-specific helpers colocated, e.g. `apps/web/src/app/(app)/schedule/_lib`.
- Authed and auth-flow pages live in the `(app)` route group; only the landing and legal pages sit at the top level.

## Server and Client Component Rules

- Default to Server Components. Add `"use client"` only for browser APIs, event
  handlers, or React hooks.
- Push client boundaries to leaf components.
- Do not import server-only modules, service-role helpers, Stripe secret helpers,
  filesystem APIs, or Node-only APIs into Client Components.
- Do not expose server secrets via `NEXT_PUBLIC_*`.

## API, Auth, and Tenant Safety

- Validate input and check auth/authz inside every Route Handler or shared server helper.
- Do not rely on the request proxy alone for authorization.
- Mutating handlers must not use GET.
- Call `validateCsrfOrigin(req)` at the top of all mutating browser-facing Route Handlers.
- All mutations MUST use the effective (sandbox-redirected) `orgId` from
  `requireOrgPermissions`, never a raw request body `orgId`.
- Keep `gridmaster` access explicit and server-side.
- Apply rate limiting to public/side-effectful endpoints using `apps/web/src/lib/rate-limit.ts`.
- Sensitive actions (factor or credential changes, other-session revocation, export, account or
  org deletion, approving another person's deletion) call `requireSensitiveActionAuth(req)` and
  the UI drives `useStepUpAction`; the five-minute policy lives in `@dubgrid/authz`.
- A new mutating route must be classified in `__tests__/auth-integrity-entry-points.test.ts`
  (browser CSRF, native bearer, or signed/webhook/cron boundary) or that test fails.
- Public identity-facing failures stay generic; write security outcomes through
  `lib/auth/security-audit.ts`, never with tokens or codes in the payload.
- Read the platform kill switches with `isFeatureEnabled` before a Stripe, email, import/export,
  mobile-API, or cron side effect.

## Key Behavioral Constraints

- **OnboardingGate**: `components/onboarding/OnboardingGate.tsx`. Not `SetupLockGate`.
- **Trial activation**: `POST /api/auth/start-trial` calls `start_trial_for_org` RPC.
  Called only on first `super_admin` login. Idempotent.
- **Org soft-delete**: `archived_at` on `organizations` revokes access at the request proxy,
  `get_my_organizations`, JWT hook, and `switch_org`.
- **Post-login soft nav**: `router.replace("/dashboard")` + `AuthSplash` bridge.
  Logout: swift, no splash, always redirects to `/login`.
- **Request-proxy JWT fallback**: `jwtVerify` catch block falls back to `decodeJwt`
  (unverified) for non-gridmaster users. Never remove this fallback. RLS is the
  real security boundary.
- **Email templates**: React Email source in `src/emails/`. Run `email:build` to
  regenerate `supabase/templates/*.html`. Auth email HTML is committed there.
- **Test Sandbox**: Cookie-based via `lib/sandbox-cookie.ts`. Not `switch_org`. The POST is gated
  server-side by the caller's real role in the source org (admin+), never the cookie-widened claim.
- **Schedule presence**: `useSchedulePresence` publishes identity once and paces an `editing_cell`
  broadcast; nothing blocks on it. Do not reintroduce cell leases: the optimistic version check
  is the data-safety boundary.
- **Alerts go to their subject**: every alert row (bell popup, `/alerts`) resolves through
  `resolveAlertDestination` in `@dubgrid/domain` and marks itself read on the way; there is no
  detail modal for organization users.

## Design System

`dg-btn-*` is the button vocabulary everywhere: authenticated surfaces, public
auth flows, and the landing page. The old `dg-auth-submit` pill is retired and
must not be reintroduced.

Input and label vocabularies are not interchangeable:

- `dg-input` / `dg-label` / `dg-form-error` — authenticated app surfaces.
- `dg-auth-input` / `dg-auth-link` / `dg-auth-heading` — public auth flows
  (pairs with `<AuthCard>` and `<PageShell>`).

Every text-entry control paints its own field surface (`dg-input` does this;
an ad-hoc `<input style={...}>` must set `background: var(--dg-color-surface)`
itself, because Tailwind's preflight makes inputs transparent). Integer entry
goes through `<NumberField>` (`components/ui/number-field.tsx`), never
`type="number"`: a number input bound to numeric state cannot be emptied,
takes `e`/`+`/`-`/`.`, and changes value under the scroll wheel. Phone fields
are `type="tel"`.

Shared primitives — use before creating alternatives:
`<PageContainer>`, `<Switch>`, `<EditorActionRow>`, `<SectionCard>`,
`<EmptyState size="...">`, `<ConfirmDialog>`, `<Modal>`, `<ErrorBoundary>`,
`<NotFoundBoundary>`, `<CustomSelect>`, `<NumberField>`.

Product UI and ordinary copy use Inter (`var(--font-sans)`). The DubGrid
wordmark and landing or marketing headings use DM Sans through the explicit
`dg-font-brand-heading` boundary. Never apply DM Sans to product controls or
body copy, and never replace the wordmark's brand face. Operational dates,
times, hours, counts, and schedule figures use the bounded
`dg-tabular-nums` utility; prose must not inherit tabular figures. Email body
copy and printed schedules follow the Inter product contract, while wordmark
art remains branded. Never Geist.

## Dialogs and sheets

Use `ConfirmDialog` for a brief consequential decision, including unsaved
changes. Use `Modal` or the existing side panel for bounded editing/review,
a popover for desktop choices, and a bottom sheet for compact touch layouts.
Use a page for substantial workflows. Ordinary saves run directly; significant
side effects still receive a specific confirmation.

`Modal` and `ui/sheet` share Base UI's dialog accessibility foundation. Preserve
focus containment and restoration, including a surviving return target when
an initiating menu item disappears. `headerSafe` is deliberately non-modal so
its header remains interactive. Confirmation actions put Cancel left and the
explicit action right, omit the redundant X, and block every dismissal while
pending. Render failures in the active surface. Keep one task with at most one
brief confirmation above it; never stack unrelated editors.

Action groups follow the same semantic order in every responsive layout:
supporting or secondary actions first, then the primary action last. This maps
to secondary-left/primary-right in rows and secondary-top/primary-bottom in
stacks. Use `EditorActionRow` for editor footers where possible.

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
  `<ButtonLoading loading={save.isRunning} icon={<Save size={14} />}>Save</ButtonLoading>`.
  The spinner takes the leading icon's place and the label stays unchanged:
  never `Saving`, never `Saving…`, and there is no `loadingLabel` prop (it was
  removed on purpose; `__tests__/ButtonLoading.test.tsx` asserts "Saving" is absent).

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
- Preserve request/response contracts in `@dubgrid/contracts` (the mobile schemas are
  re-exported from its single `.` entry; there is no `./mobile` subpath).
- When changing mobile API behavior, run `npm run test:mobile` in addition to web checks.

## Environment Rules

- Variable names from `.env.example` or `apps/web/.env.example` only. Read them through
  `lib/env.ts` (public) and `lib/env.server.ts` (server), not bare `process.env`.
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
