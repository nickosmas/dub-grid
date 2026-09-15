# Folder Structure

DubGrid is an npm workspaces monorepo orchestrated by Turborepo. There are two apps and 11 platform-neutral packages.

```
dub-grid/
├── apps/
│   ├── web/          # @dubgrid/web — Next.js 16 / React 19 / Tailwind v4
│   └── mobile/       # @dubgrid/mobile — Expo SDK 54 / React Native
├── packages/         # 11 platform-neutral shared workspaces
├── supabase/         # Supabase config, migrations (4 files only), seed
├── load-tests/       # k6 load test scripts
├── scripts/          # CLI utilities (db reset, type generation, etc.)
├── seed.ts           # Database seed
├── turbo.json        # Turborepo pipeline
└── package.json      # Root workspace config
```

---

## apps/web — Next.js Web App

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing / marketing page
│   │   ├── api/                # Route Handlers (see api-reference.md)
│   │   │   ├── auth/
│   │   │   ├── account/
│   │   │   ├── organizations/
│   │   │   ├── organization/
│   │   │   ├── employees/
│   │   │   ├── people/
│   │   │   ├── schedule/
│   │   │   ├── shifts/
│   │   │   ├── notifications/
│   │   │   ├── reports/
│   │   │   ├── billing/
│   │   │   ├── stripe/
│   │   │   ├── onboarding/
│   │   │   ├── settings/
│   │   │   ├── gridmaster/     # Gridmaster-only endpoints
│   │   │   ├── mobile/v1/      # Mobile API (bearer-token, versioned)
│   │   │   └── ...
│   │   ├── dashboard/          # /dashboard
│   │   ├── schedule/           # /schedule
│   │   ├── people/             # /people + /people/[id]
│   │   ├── notifications/      # /notifications (full inbox)
│   │   ├── reports/            # /reports
│   │   ├── settings/           # /settings + /settings/staff-config
│   │   ├── profile/            # /profile
│   │   ├── gridmaster/         # /gridmaster (platform_role = 'gridmaster')
│   │   ├── onboarding/         # /onboarding
│   │   ├── billing-required/   # /billing-required
│   │   ├── login/              # /login
│   │   ├── forgot-password/    # /forgot-password
│   │   ├── reset-password/     # /reset-password
│   │   ├── accept-invite/      # /accept-invite
│   │   ├── verify-email/       # /verify-email
│   │   ├── auth/               # /auth/callback, /auth/confirm, /auth/verify
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
│   │   ├── auth/               # AuthCard, PageShell, auth flow components
│   │   ├── forms/              # CountrySelect, PhoneInput, EmailInput, etc.
│   │   ├── gridmaster/         # Gridmaster portal components
│   │   ├── onboarding/         # OnboardingGate, PersonaLandingCard
│   │   ├── settings/           # SectionCard, EditorActionRow, shared primitives
│   │   └── ui/                 # Switch, Modal, ConfirmDialog, EmptyState, etc.
│   │
│   ├── hooks/                  # Shared React hooks
│   │   ├── usePermissions.ts   # Resolved permission set (JWT + DB, 10s TTL)
│   │   ├── useRoleChange.ts    # React Query mutation for role changes
│   │   └── useRealtimeInvalidation.ts  # CDC-driven cache invalidation
│   │
│   ├── lib/                    # Server and shared utilities
│   │   ├── db/                 # Data access layer (barrel over domain modules)
│   │   ├── api-auth.ts         # requireAuthenticatedUser, requireOrgPermissions, etc.
│   │   ├── csrf.ts             # validateCsrfOrigin
│   │   ├── rate-limit.ts       # Upstash limiters (loginLimiter, apiLimiter, etc.)
│   │   ├── supabase.ts         # Browser Supabase client (lazy, via Proxy)
│   │   ├── supabase-service.ts # Service-role Supabase client
│   │   ├── resend.ts           # Resend email client
│   │   ├── stripe.ts           # Stripe client
│   │   ├── logger.ts           # Structured logger
│   │   └── ...
│   │
│   ├── emails/                 # react-email templates
│   │   ├── InviteEmail.tsx
│   │   ├── TrialWelcomeEmail.tsx
│   │   ├── NotificationEmail.tsx
│   │   ├── ImpersonationNoticeEmail.tsx
│   │   ├── DemoRequestEmail.tsx
│   │   └── auth/               # Auth email templates (password reset, verify, etc.)
│   │
│   ├── types/                  # App-level TypeScript types
│   └── __tests__/              # Cross-cutting unit tests and test helpers
│
├── src/proxy.ts                # Next.js request proxy: JWT verification, RBAC, org suspension
├── next.config.ts              # Next.js config, security headers, CSP
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
│   ├── _layout.tsx             # Root layout (providers, auth guard)
│   ├── index.tsx               # Entry redirect
│   ├── (auth)/                 # Unauthenticated screens
│   │   ├── login.tsx
│   │   └── onboarding.tsx
│   ├── (tabs)/                 # Bottom-tab navigation
│   │   ├── home/               # Schedule / home tab
│   │   ├── team/               # Team tab
│   │   ├── people/             # People directory + person detail
│   │   ├── requests/           # Shift requests
│   │   └── profile/            # Profile, account, security, notifications
│   ├── alerts/                 # Notification inbox + detail (/alerts, /alerts/[id])
│   └── shift/[employeeId]/[date].tsx  # Shift detail screen
│
├── src/
│   ├── features/               # Mobile feature modules
│   │   ├── auth/               # Login, session, auth hooks + providers
│   │   ├── consent/            # Cookie/consent flow
│   │   ├── notifications/      # Notification inbox, push handler
│   │   ├── onboarding/         # Mobile onboarding screens
│   │   ├── people/             # People directory and detail
│   │   ├── profile/            # Profile and account screens
│   │   ├── schedule/           # Schedule display and shift detail
│   │   └── shift-requests/     # Pickup/swap/calloff request flow
│   │
│   └── shared/                 # Cross-feature mobile utilities
│       ├── components/         # Shared UI components
│       ├── hooks/              # Shared hooks
│       ├── lib/                # API clients, Supabase session helpers
│       ├── navigation/         # Navigation utilities and typed params
│       ├── providers/          # React context providers
│       └── theme/              # Design token application
│
├── assets/                     # Images and static assets
├── app.json                    # Expo config
└── package.json                # @dubgrid/mobile workspace
```

The mobile app communicates exclusively with `/api/mobile/v1/*` on the web app. It does not connect directly to Supabase data tables. Sandboxes (`workspace_kind = 'sandbox'`) are excluded from mobile login.

---

## packages — Platform-Neutral Shared Workspaces

All 11 packages must remain platform-neutral: no Next.js, Expo, React Native, DOM, or Node.js-only imports. A change to any package affects both apps.

| Package                    | Purpose                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dubgrid/api-client`      | Fetch/header utilities, query-param helpers                                                                                                                                                                    |
| `@dubgrid/authz`           | Role level constants, permission builders (`buildPerms`, `buildPermissionContext`, `unionPermissions`), JWT claim extraction (`extractJwtClaims`), `READ_ONLY_PERMS`                                           |
| `@dubgrid/client-errors`   | Platform-neutral error translation: `formatClientErrorMessage`, `isNetworkConnectionError`, canonical error copy constants                                                                                     |
| `@dubgrid/contracts`       | Zod schemas for all API contracts (main export + `./mobile` sub-export for mobile-specific schemas)                                                                                                            |
| `@dubgrid/data-access`     | Supabase query helpers and mobile data queries                                                                                                                                                                 |
| `@dubgrid/db-types`        | Generated DB type subsets (catalog, organization, requests, schedule, staff)                                                                                                                                   |
| `@dubgrid/design-tokens`   | Color and spacing tokens shared by web and mobile                                                                                                                                                              |
| `@dubgrid/domain`          | Core domain types and helpers: `Organization`, `AdminPermissions`, `PlatformRole`, `OrganizationRole`, `WorkspaceKind`, `isSelfAction`, `assertNotSelf`, billing helpers, notification metadata, request types |
| `@dubgrid/mobile-api-core` | Server-side orchestration logic for mobile API route handlers (auth, org, people-status, push tokens, shift requests, setup)                                                                                   |
| `@dubgrid/schedule-core`   | Schedule entry types, shift display logic                                                                                                                                                                      |

Build all packages (except `@dubgrid/client-errors`): `npm run build:packages`

Build `@dubgrid/client-errors` individually: `npm --workspace @dubgrid/client-errors run build`

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
│   └── 005_*.sql ...           # Immutable numbered forward migrations
├── seed.ts                     # Seed script (run via npm run seed)
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

| Command                   | What it does                                                  |
| ------------------------- | ------------------------------------------------------------- |
| `npm run dev`             | Start the web app in development mode                         |
| `npm run dev:mobile`      | Start the Expo dev server                                     |
| `npm test`                | Run all workspace tests (Vitest, via Turbo)                   |
| `npm run test:web`        | Run web app tests only                                        |
| `npm run test:mobile`     | Run mobile + contracts tests                                  |
| `npm run test:e2e`        | Run Playwright end-to-end tests                               |
| `npm run build`           | Production build (web app)                                    |
| `npm run type-check`      | TypeScript check across all workspaces                        |
| `npm run db:reset`        | Reset local Supabase DB and re-seed                           |
| `npm run db:reset:remote` | Drop/recreate remote DB, run migrations, re-seed              |
| `npm run gen:types`       | Regenerate `apps/web/src/lib/database.types.ts` from Supabase |
| `npm run build:packages`  | Build all shared packages                                     |
| `npm run lint`            | Run ESLint                                                    |
