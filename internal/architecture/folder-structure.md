# Folder Structure

DubGrid is an npm workspaces monorepo orchestrated by Turborepo. There are two apps and 11 platform-neutral packages.

```
dub-grid/
├── apps/
│   ├── web/          # @dubgrid/web — Next.js 16 / React 19 / Tailwind v4
│   └── mobile/       # @dubgrid/mobile — Expo SDK 54 / React Native
├── packages/         # 11 platform-neutral shared workspaces
├── supabase/         # Supabase config, ordered migrations, seed SQL, compiled auth templates
├── e2e/              # Playwright specs and helpers (route states, role variance, auth qualification)
├── eslint-rules/     # Custom ESLint rules with their own node:test suite (`npm run lint:rules`)
├── load-tests/       # k6 load test scripts
├── scripts/          # CLI utilities (env sync, migration readiness, remote reset, mobile capture, supply-chain scan)
├── blueprint/        # AI Blueprint workflow: plans, context, history, reference screenshots
├── .githooks/        # pre-commit, commit-msg, pre-push (enable with `npm run hooks:install`)
├── seed.ts           # Database seed runner
├── turbo.json        # Turborepo pipeline
└── package.json      # Root workspace config
```

---

## apps/web — Next.js Web App

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (providers, fonts, theme cookie adoption)
│   │   ├── page.tsx            # Landing / marketing page
│   │   ├── sitemap.ts, opengraph-image.tsx, twitter-image.tsx, icon.png
│   │   ├── globals.css         # Tailwind v4 @theme tokens + the dg-* class vocabulary
│   │   ├── api/                # Route Handlers (see api-reference.md)
│   │   │   ├── auth/ account/ organizations/ organization/ onboarding/
│   │   │   ├── employees/ people/ import/ invitations/ users/
│   │   │   ├── schedule/ shifts/ export/ calendar/ reports/ dashboard/
│   │   │   ├── notifications/ send-notification/
│   │   │   ├── billing/ stripe/ trial-welcome/ settings/ feature-flags/
│   │   │   ├── cron/           # expire-requests, trial-expiry, sandbox-cleanup
│   │   │   ├── gridmaster/     # Gridmaster-only endpoints
│   │   │   ├── mobile/v1/      # Mobile API (bearer-token, versioned)
│   │   │   ├── test-sandbox/ consent/ request-demo/ validate-domain/ health/
│   │   │   └── shared/         # Helpers shared by several handlers
│   │   ├── (app)/              # Route group: every authenticated and auth-flow page
│   │   │   ├── layout.tsx      # AppShell, NavigationGuardProvider, gates
│   │   │   ├── dashboard/      # /dashboard
│   │   │   ├── schedule/       # /schedule (+ _components, _hooks, _lib)
│   │   │   ├── people/         # /people + /people/[id]
│   │   │   ├── alerts/         # /alerts (the notification inbox)
│   │   │   ├── reports/        # /reports
│   │   │   ├── settings/       # /settings (?section=...); staff-config/ only redirects
│   │   │   ├── profile/        # /profile
│   │   │   ├── account/        # /account
│   │   │   ├── gridmaster/     # /gridmaster (platform_role = 'gridmaster')
│   │   │   ├── onboarding/     # /onboarding (invited member waiting for org setup)
│   │   │   ├── billing-required/ accept-terms/ goodbye/
│   │   │   ├── login/ forgot-password/ reset-password/ accept-invite/
│   │   │   └── auth/           # /auth/callback, /auth/confirm, /auth/verify
│   │   ├── request-demo/       # /request-demo
│   │   ├── cookie-policy/      # /cookie-policy
│   │   ├── privacy/            # /privacy
│   │   └── terms/              # /terms
│   │
│   ├── features/               # Domain feature modules (server/client/shared split)
│   │   ├── account/            # Account settings, sessions, change requests
│   │   ├── billing/            # Stripe billing integration
│   │   ├── dashboard/          # Dashboard analytics
│   │   ├── employees/          # Employee lifecycle and management
│   │   ├── gridmaster/         # Gridmaster portal features
│   │   ├── mobile/server/      # Mobile API server logic + route handlers
│   │   │   └── routes/         # Handler modules for /api/mobile/v1/*
│   │   ├── notifications/      # Notification dispatch and inbox (client + server)
│   │   ├── onboarding/         # OnboardingGate, OnboardingWizard, WizardShell
│   │   ├── organization/       # Org settings, directory, invitations
│   │   ├── permissions/        # RBAC permission context building
│   │   ├── reports/            # Operational reports
│   │   ├── schedule/           # Schedule grid, draft/publish workflow
│   │   ├── settings/           # Org config editors
│   │   └── test-sandbox/       # Test sandbox creation and management
│   │
│   ├── components/             # Shared UI components
│   │   ├── AppShell, Header, Modal, ConfirmDialog, EmptyState, CustomSelect, PageContainer,
│   │   │   ScheduleGrid, ShiftEditPanel, Toolbar, StaffView, PermissionsEditor, ...  (top level)
│   │   ├── account/            # Profile, security, appearance, notifications, data-privacy panels
│   │   ├── activity/           # Date-navigated activity log table, period navigator, stats
│   │   ├── auth/               # AuthCard, EmailPasswordForm, StepUpDialog, TermsAcceptanceCard, ...
│   │   ├── dashboard/          # DashboardView, role dashboards, cards, expanded/ detail views
│   │   ├── gridmaster/         # Gridmaster portal views, organization-detail/, organization-setup/
│   │   ├── landing/            # Landing page mockups and screenshots
│   │   ├── onboarding/         # OnboardingGate, OnboardingWizard, WizardShell, steps/, SetupPendingScreen
│   │   ├── organization/       # Location fields, timezone select, change review
│   │   ├── profile/            # ProfilePage, MFASetup, MFAVerify, SessionList, CalendarSubscriptionCard
│   │   ├── schedule/, schedule-grid/  # Open-shift staffing modal, grid helpers, badges, publish diff
│   │   ├── settings/           # SettingsPage, SettingsShell, one panel per settings section, shared.tsx (SectionCard)
│   │   ├── staff/, staff-detail/      # People roster, panels, filters; person detail page and tabs
│   │   ├── test-sandbox/       # CreateSandboxDialog, SandboxBanner
│   │   └── ui/                 # Base UI-backed primitives: switch, sheet, number-field, numeric-badge,
│   │                           #   status-pill, editor-action-row, table, pagination, popover, tooltip, ...
│   │
│   ├── hooks/                  # Shared React hooks
│   │   ├── useAsyncAction.ts   # Double-press latch (ref-based, synchronous)
│   │   ├── useSchedulePresence.ts        # Editor presence (identity + editing_cell broadcast)
│   │   ├── useOrgRealtimeInvalidation.ts # Reference-counted CDC invalidation (realtime-core)
│   │   ├── useAccountRealtimeInvalidation.ts, useNotificationsRealtime.ts, useGridmasterRealtimeInvalidation.ts
│   │   ├── useOrganizationData.ts        # Org bootstrap query
│   │   ├── useStepUpAction.tsx           # Sensitive-action step-up flow
│   │   ├── useMediaQuery.ts, useIdleTimer.ts, useLogout.ts, useRoleChange.ts, ...
│   │   └── usePermissions.ts   # Re-export of features/permissions/usePermissions
│   │
│   ├── lib/                    # Server and shared utilities
│   │   ├── db/                 # Data access layer (barrel over domain modules)
│   │   ├── auth/               # verify-token (JWKS/ES256), revocation (Redis), security-audit, contracts
│   │   ├── audit/              # Audit registry, audience, enrichment, day counts
│   │   ├── server/             # Server-only helpers (schedule draft safety)
│   │   ├── api-auth.ts         # requireAuthenticatedUser, requireOrgPermissions, requireSensitiveActionAuth, ...
│   │   ├── csrf.ts             # validateCsrfOrigin
│   │   ├── rate-limit.ts       # Upstash limiters (login, IP, surge, recovery, invite, api, ...)
│   │   ├── env.ts, env.server.ts # Zod-validated public and server environment
│   │   ├── feature-flags.ts    # Platform kill switches (Redis + data cache)
│   │   ├── supabase.ts         # Browser Supabase client (lazy, via Proxy)
│   │   ├── supabase-service.ts # Service-role Supabase client
│   │   ├── resend.ts           # Resend email client
│   │   ├── stripe.ts           # Stripe client
│   │   ├── logger.ts           # Structured logger
│   │   └── ...                 # schedule, staff, dashboard, colors, timezone, cache, sentry helpers
│   │
│   ├── emails/                 # react-email templates
│   │   ├── InviteEmail.tsx, TrialWelcomeEmail.tsx, NotificationEmail.tsx,
│   │   │   ImpersonationNoticeEmail.tsx, DemoRequestEmail.tsx
│   │   ├── auth/               # Supabase auth templates: confirmation, invite, magic link, recovery,
│   │   │                       #   reauthentication, email change, and the four security notices
│   │   ├── components/         # EmailLayout, EmailButton, theme
│   │   └── static/             # Wordmark and lockup PNGs
│   │
│   ├── i18n/                   # next-intl request config (messages live in apps/web/messages/)
│   ├── types/                  # App-level TypeScript types
│   ├── test-utils/             # Shared test helpers
│   └── __tests__/              # Cross-cutting unit tests
│
├── src/proxy.ts                # Next.js request proxy: JWT verification, RBAC, org suspension, CSP
├── src/instrumentation.ts, instrumentation-client.ts, sentry.*.config.ts
├── scripts/                    # generate-auth-email-templates (email:build), generate-wordmark-lockup
├── next.config.ts              # Next.js config, security headers
├── vercel.json                 # Region + cron schedules
├── vitest.config.mts           # Vitest config (jsdom environment)
└── package.json                # @dubgrid/web workspace
```

All former `src/...` paths from the pre-monorepo layout now live under `apps/web/src/...`.

Route Handlers are thin. Business logic lives in the corresponding `features/<name>/server/` module. New feature code goes in `features/<name>/` first; use `shared/` only for genuinely cross-feature code.

---

## apps/mobile — Expo Mobile App

```
apps/mobile/
├── app/                        # Expo Router file-based navigation
│   ├── _layout.tsx             # Root layout (fonts, providers, consent + terms gates, ErrorBoundary)
│   ├── index.tsx               # Entry redirect
│   ├── +not-found.tsx          # Unmatched-route fallback
│   ├── (auth)/                 # Unauthenticated screens
│   │   ├── login.tsx
│   │   ├── forgot-password.tsx # Native reset request
│   │   ├── reset-password.tsx  # 6-digit code + new password
│   │   └── onboarding.tsx
│   ├── (tabs)/                 # Bottom-tab navigation (_layout, _layout.android, _layout.web)
│   │   ├── home/               # Dashboard (admin) or personal schedule (staff), plus drill-ins
│   │   ├── team/               # Team schedule
│   │   ├── people/             # People directory, add person, person detail
│   │   ├── requests/           # Shift requests
│   │   └── profile/            # Profile, work, account, security, password, two-factor, sessions, notifications, privacy
│   ├── alerts/                 # Alerts list (/alerts); /alerts/[id] forwards to the alert's subject
│   ├── person/[id]/            # Person detail and person schedule outside the tab stack
│   └── shift/[employeeId]/[date].tsx  # Shift detail screen
│
├── src/
│   ├── features/               # Mobile feature modules
│   │   ├── auth/               # Login, session, MobileRealtimeProvider
│   │   ├── consent/            # ConsentGate + TermsGate
│   │   ├── dashboard/          # Admin dashboard cards, hero, drill-in screens
│   │   ├── notifications/      # Alerts list with swipe actions, push handler
│   │   ├── onboarding/         # 3-slide first-launch intro
│   │   ├── people/             # People directory and detail
│   │   ├── profile/            # Profile and account screens
│   │   ├── schedule/           # Schedule display and shift detail
│   │   └── shift-requests/     # Pickup/swap/calloff request flow
│   │
│   ├── shared/                 # Cross-feature mobile utilities
│   │   ├── components/         # AppText/Text, Button, PressableRow, Chip, sheets, skeleton/, ...
│   │   ├── hooks/              # useAsyncAction, useUnsavedChangesGuard, useMobileContentState, ...
│   │   ├── lib/                # API client, env, Supabase session helpers, in-app browser
│   │   ├── motion/             # useMotionPreference, usePressAnimation, AnimatedListItem, Collapsible
│   │   ├── navigation/         # Navigation utilities and typed params
│   │   ├── providers/          # AuthSessionProvider, NetworkStateProvider, theme mode
│   │   └── theme/              # tokens.ts adapter over the mobile* design tokens, useElevation
│   └── test/                   # Vitest shims (react-native emulation, reanimated stub, navigation)
│
├── assets/                     # Images, icons, splash
├── scripts/                    # generate-app-icons.mjs (`npm run icons`)
├── app.json                    # Expo config (scheme dubgridmobile, com.dubgrid.mobile)
└── package.json                # @dubgrid/mobile workspace
```

The mobile app communicates exclusively with `/api/mobile/v1/*` on the web app for data. It uses Supabase Auth directly (sign-in, session restoration, TOTP, the recovery OTP) and Supabase Realtime through `@dubgrid/realtime-core`, but never reads or writes data tables. Sandboxes (`workspace_kind = 'sandbox'`) are excluded from mobile login.

---

## packages — Platform-Neutral Shared Workspaces

All 11 packages must remain platform-neutral: no Next.js, Expo, React Native, DOM, or Node.js-only imports. A change to any package affects both apps.

| Package                    | Purpose                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dubgrid/api-client`      | Fetch/header utilities, query-param helpers                                                                                                                                                                                                                                 |
| `@dubgrid/authz`           | Role level constants, permission builders (`buildPerms`, `buildPermissionContext`), the `VIEW_IMPLICATIONS` map, `READ_ONLY_PERMS` / `ADMIN_DEFAULT_PERMS`, JWT claim extraction (`extractJwtClaims`), and the five-minute sensitive-action assurance policy                |
| `@dubgrid/client-errors`   | Platform-neutral error translation (`formatClientErrorMessage`, `isNetworkConnectionError`, canonical error copy) and the bounded auth-recovery retry policy                                                                                                                |
| `@dubgrid/contracts`       | Zod schemas for all API contracts (`schedule`, `mobile`, `staff`, `mfa`; one `.` export)                                                                                                                                                                                    |
| `@dubgrid/data-access`     | Supabase query helpers and mobile data queries                                                                                                                                                                                                                              |
| `@dubgrid/db-types`        | Generated DB type subsets (catalog, organization, requests, schedule, staff)                                                                                                                                                                                                |
| `@dubgrid/design-tokens`   | Avatar, elevation, gradient, icon, pill, numeric-badge, and motion tokens plus the `mobile*` spacing, type, and control ramps                                                                                                                                               |
| `@dubgrid/domain`          | Core domain types and helpers: `Organization`, `AdminPermissions` (26 keys), `PlatformRole`, `OrganizationRole`, `WorkspaceKind`, `isSelfAction`, `assertNotSelf`, password rules, terms version, alert destinations, billing helpers, notification metadata, request types |
| `@dubgrid/mobile-api-core` | Server-side orchestration logic for mobile API route handlers (auth, dashboard, org, people-status, push tokens, read, shift requests, setup, write)                                                                                                                        |
| `@dubgrid/realtime-core`   | Org-scoped channel names, reference-counted subscriptions, Postgres-changes helpers, debounced invalidation                                                                                                                                                                 |
| `@dubgrid/schedule-core`   | Schedule entry types, coverage and hours engines, pay periods, open-shift derivation, shift display logic                                                                                                                                                                   |

Build all packages: `npm run build:packages` (the web and mobile `predev`/`prebuild` hooks run it for you). Build one: `npm --workspace @dubgrid/<name> run build`.

---

## supabase — Database

```
supabase/
├── config.toml                 # Local dev config (auth hooks, rate limits)
├── migrations/
│   ├── 001_schema.sql          # Enums, tables, FKs, indexes, Realtime
│   ├── 002_functions_triggers.sql  # Functions, triggers, JWT hook, RPCs
│   ├── 003_rls_policies.sql    # RLS enable + all policies
│   ├── 004_grants.sql          # Grants + default privileges
│   ├── 005_*.sql ... 020_*.sql # Immutable numbered forward migrations
│   └── checksums.sha256        # Locks every reviewed migration
├── patches/                    # Historical one-time production patches (evidence only)
├── seed_arden_wood.sql, seed_calm_haven.sql, seed_gridmaster.sql  # Local seed SQL (run by root seed.ts)
└── templates/                  # Compiled Supabase auth email HTML
                                # (generated by npm run email:build in apps/web)
```

Migrations 001-004 are the frozen historical baseline. Every schema change is
an immutable, retry-safe migration at the next number (`005_*.sql` and later).
Never edit an applied migration. Historical files under `supabase/patches/` are
evidence only and are not a second migration stream.

---

## Root-Level Scripts

Key commands defined in the root `package.json`:

| Command                         | What it does                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                   | Start the web app in development mode                                                  |
| `npm run dev:mobile`            | Start the Expo dev server                                                              |
| `npm test`                      | Run all workspace tests (Vitest, via Turbo)                                            |
| `npm run test:web`              | Run web app tests only                                                                 |
| `npm run test:mobile`           | Run mobile, contracts, and schedule-core tests                                         |
| `npm run test:e2e`              | Run Playwright end-to-end tests                                                        |
| `npm run build`                 | Production build (web app)                                                             |
| `npm run type-check`            | TypeScript check across all workspaces                                                 |
| `npm run db:reset`              | Reset local Supabase DB and re-seed                                                    |
| `npm run db:reset:remote`       | Drop/recreate a non-production remote DB, run migrations, re-seed (refuses production) |
| `npm run db:migrations:check`   | Validate the ordered migration inventory against `checksums.sha256`                    |
| `npm run db:migrations:inspect` | Read-only linked-project ledger and schema qualification                               |
| `npm run gen:types`             | Regenerate `apps/web/src/lib/database.types.ts` from Supabase                          |
| `npm run build:packages`        | Build all shared packages                                                              |
| `npm run lint`                  | Run ESLint                                                                             |
| `npm run hooks:install`         | Enable the repo's git hooks for this clone                                             |
