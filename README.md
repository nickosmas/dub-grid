# DubGrid

Multi-tenant employee scheduling platform for care facilities. DubGrid replaces spreadsheet-based scheduling with connected web and Expo mobile apps, real-time collaboration, and comprehensive role-based access control.

## Current Product State

DubGrid is an active, full-stack monorepo rather than a starter application. The web app is the primary scheduling and organization-management surface; the companion Expo app gives staff and managers access to schedules, requests, people, alerts, and account settings on the go. Both clients use the same authenticated API contracts, organization boundaries, and shared domain packages.

## Features

- **Schedule Grid** - 1-week, 2-week, and month views with drag-and-drop shift management
- **Multi-Tenant** - Wildcard subdomain-based organization isolation (e.g., `acme.dubgrid.com`). Per-session organization context: switching organizations only affects the calling device.
- **RBAC** - Four-tier role hierarchy (Gridmaster > Super Admin > Admin > User) with 26 per-person admin permissions, plus self-action and admin-tier guards
- **Free Trial** - 14-day trial that starts on the first super admin login; non-super-admins are gated until billing is active
- **Draft/Publish Workflow** - All edits are drafts until published; discard or recover across sessions
- **Recurring Shifts** - Day-of-week templates and repeating series (daily, weekly, biweekly)
- **Real-Time Collaboration** - Live sync via Supabase Realtime with presence avatars and a non-blocking "who is editing this cell" indicator; concurrent writes are caught by optimistic version checks, not locks
- **Web + Mobile** - Next.js web app plus an Expo mobile app for schedules, people, requests, alerts, and account settings
- **Dashboard Analytics** - KPI cards, coverage charts, shift breakdowns, activity feeds with expandable detail views
- **Staff Management** - Full employee lifecycle (add, edit, bench, terminate) with certifications, roles, and focus areas
- **Staff Detail Pages** - Tabbed views per employee: Overview, Schedule, Activity
- **Coverage Tracking** - Define minimum staffing requirements; visualize coverage status per section
- **Shift Requests** - Pickup, swap, and call-off request workflow with admin approval and a full request board
- **Gridmaster Portal** - Platform-wide org management, user impersonation, audit logs, permission configuration, and org-lifecycle notifications
- **Onboarding Gate** - Role-aware onboarding rendered inline (no standalone route); non-admins on an unconfigured org see a setup-pending screen
- **Test Sandbox** - Clone an org's config into an isolated, time-limited sandbox you enter via an HttpOnly cookie (no JWT/session-context hop)
- **Invite-Only Registration** - No public sign-up; 72-hour invitation tokens linked to employee records
- **Password Reset & Recovery** - Server-mediated, rate-limited recovery requests on web and an in-app 6-digit OTP reset on mobile, with a password strength meter; invited accounts are created pre-confirmed, so there is no separate email verification step
- **Account Security** - TOTP multi-factor authentication with a five-minute fresh-auth window for sensitive actions (MFA changes, credential updates, session revocation, data export, account deletion), session/device management, security activity alerts, and account-recovery flows
- **Resilient Auth & Onboarding** - Explicit recovery states for slow or failed organization bootstrap, rather than an empty authenticated shell
- **Alerts** - Searchable, filterable web and mobile inboxes with bulk actions, archiving, and push support; tapping an alert marks it read and goes to its subject (request board, schedule date, person, invitations, billing) through one shared destination resolver
- **Print & Export** - Configurable print layout with legend, focus area selection, and date range; PDF/CSV export plus an iCalendar (`.ics`) feed

## Tech Stack

| Layer          | Technology                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Framework      | [Next.js 16](https://nextjs.org) + React 19                                                           |
| Monorepo       | npm workspaces + TurboRepo                                                                            |
| Language       | TypeScript                                                                                            |
| Styling        | [Tailwind CSS v4](https://tailwindcss.com)                                                            |
| Database       | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS)                                 |
| SSR            | @supabase/ssr v0.9                                                                                    |
| State          | [TanStack React Query v5](https://tanstack.com/query)                                                 |
| Drag & Drop    | @dnd-kit/core                                                                                         |
| Mobile         | [Expo](https://expo.dev) SDK 54 + React Native (Expo Router)                                          |
| Email          | [Resend](https://resend.com)                                                                          |
| Billing        | [Stripe](https://stripe.com) (subscriptions + webhooks)                                               |
| Rate Limiting  | [@upstash/ratelimit](https://upstash.com) + Redis                                                     |
| Validation     | [Zod](https://zod.dev)                                                                                |
| JWT            | [jose](https://github.com/panva/jose)                                                                 |
| Notifications  | [Sonner](https://sonner.emilkowal.dev) v2                                                             |
| Analytics      | [@vercel/analytics](https://vercel.com/analytics) + [PostHog](https://posthog.com)                    |
| Error Tracking | [Sentry](https://sentry.io)                                                                           |
| Testing        | [Vitest](https://vitest.dev) + Testing Library, [Playwright](https://playwright.dev) (E2E), k6 (load) |
| Deployment     | [Vercel](https://vercel.com)                                                                          |

## Prerequisites

- Node.js 22.x with npm 10.x (`engines` in `package.json`; `.nvmrc` pins 22.13.0 and `packageManager` pins npm 10.9.2)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- A Supabase project (or use local dev with `supabase start`)

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Install Playwright browsers for end-to-end tests:**

```bash
npx playwright install chromium firefox webkit
```

3. **Set up environment variables:**

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
# Optional: browser-restricted Google Maps Places key for org address autocomplete
# NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-restricted-google-maps-key
```

4. **Start Supabase locally:**

```bash
supabase start
```

5. **Reset database (runs migrations + seed):**

```bash
npm run db:reset
```

6. **Start Redis locally:**

```bash
docker compose up -d
```

This runs Redis behind [`serverless-redis-http`](https://github.com/hiett/serverless-redis-http),
which serves the same REST protocol as Upstash, so local development uses the
identical client and code paths at ~0.5ms instead of a round trip to a hosted
region. Point `apps/web/.env.local` at it:

```
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
UPSTASH_REDIS_REST_TOKEN=local_dev_token
```

Leaving these unset also "works" — every cache helper degrades gracefully — but
session revocation (`lib/auth/revocation.ts`) is entirely Redis-backed, so it
would silently no-op and a regression in it would be invisible locally. The rate
limiter and the org-access and setup-complete memos likewise stop being exercised.

7. **Start the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

8. **Enable the git hooks (once per clone):**

```bash
npm run hooks:install
```

The pre-commit hook runs Prettier and ESLint over staged files, `commit-msg` strips AI attribution trailers, and pre-push runs `type-check` and the full test suite. See [CONTRIBUTING.md](CONTRIBUTING.md#git-hooks).

## Project Structure

```
apps/
├── web/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── components/             # Shared web UI
│   │   ├── features/               # Domain-first server/client feature modules
│   │   ├── hooks/                  # Web-only React hooks
│   │   ├── emails/                 # react-email components (source of truth for all email HTML)
│   │   ├── i18n/                   # next-intl request config
│   │   ├── lib/                    # Data access, utilities, integrations
│   │   ├── types/                  # Web TypeScript types
│   │   ├── proxy.ts                # Next.js request proxy for RBAC, CSP, billing, and subdomain routing
│   │   └── __tests__/              # Web unit + component tests
│   ├── public/                     # Static web assets
│   ├── messages/                   # next-intl locale messages
│   ├── vercel.json                 # Vercel region + cron schedules (trial-expiry, sandbox-cleanup)
│   └── next.config.ts              # Next.js config + security headers
│
├── mobile/
│   ├── app/                        # Expo Router entrypoints
│   ├── scripts/                    # App icon generation (`npm run icons`)
│   └── src/
│       ├── features/               # auth, consent, dashboard, notifications, onboarding, people, profile, schedule, shift-requests
│       └── shared/                 # mobile-wide providers, navigation, API client, theme, motion, UI primitives
│
packages/                           # 11 platform-neutral workspaces (built with tsc → dist/)
├── api-client/                     # HTTP client primitives (headers, JSON requests, errors)
├── authz/                          # Permission logic — roles, perms, JWT claim extraction
├── client-errors/                  # Shared client-facing error translation (web + mobile)
├── contracts/                      # Shared Zod schemas + inferred API contract types
├── data-access/                    # Supabase queries + data mapping (shared mobile data layer)
├── db-types/                       # DB-row TypeScript types
├── design-tokens/                  # Shared design values
├── domain/                         # Platform-neutral domain types/enums + pure logic
├── mobile-api-core/                # Framework-neutral mobile backend orchestration
├── realtime-core/                  # Shared realtime subscription and invalidation primitives
├── schedule-core/                  # Schedule transformation/calculation logic (coverage, hours, pay periods, open shifts)
│
supabase/
├── migrations/
│   ├── 001_schema.sql              # Frozen baseline: enums, tables, FKs, indexes
│   ├── 002_functions_triggers.sql  # Frozen baseline: functions, triggers, hooks, RPCs
│   ├── 003_rls_policies.sql        # Frozen baseline: row-level security policies
│   ├── 004_grants.sql              # Frozen baseline: grants + default privileges
│   ├── 005_*.sql ... 020_*.sql     # Ordered, retry-safe forward migrations (never edited once applied)
│   └── checksums.sha256            # Locks every reviewed migration (`npm run db:migrations:check`)
├── patches/                        # Historical one-time production patches (evidence only, never replayed)
├── templates/                      # Compiled Supabase auth email HTML (generated by `email:build`)
├── seed_arden_wood.sql             # Seed data — Arden Wood demo org
├── seed_calm_haven.sql             # Seed data — Calm Haven demo org
├── seed_gridmaster.sql             # Seed data — gridmaster account
└── config.toml                     # Supabase local config

e2e/                                # Playwright specs (route states, role variance, auth qualification, typography)
eslint-rules/                       # Custom ESLint rules (busy buttons, mobile metrics, copy, icons)
load-tests/                         # k6 scripts (schedule load, auth flow)
scripts/                            # Env, migration-readiness, remote reset, mobile capture, supply-chain tooling
seed.ts                             # Root seed runner (executes the SQL seed files)
```

## Available Scripts

| Script                                | Description                                                |
| ------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                         | Start the web app through TurboRepo                        |
| `npm run dev:web`                     | Start the Next.js web app through TurboRepo                |
| `npm run dev:web:lan`                 | Start the Next.js web app on `0.0.0.0` for phone access    |
| `npm run dev:webpack`                 | Start the web app with the Webpack dev server              |
| `npm run dev:mobile`                  | Start the Expo mobile app in LAN mode                      |
| `npm run dev:mobile:phone`            | Start the Expo mobile app in tunnel mode for Expo Go       |
| `npm run dev:mobile:lan`              | Start the Expo mobile app in LAN mode                      |
| `npm run build`                       | Dependency-aware production build for the web app          |
| `npm run build:packages`              | Build all `packages/*` workspaces (tsc → `dist/`)          |
| `npm run start`                       | Start the web production server                            |
| `npm run lint`                        | Run ESLint                                                 |
| `npm run lint:rules`                  | Run the unit tests for the custom rules in `eslint-rules/` |
| `npm run format`                      | Rewrite files with Prettier                                |
| `npm run format:check`                | Check Prettier formatting without writing files            |
| `npm run hooks:install`               | Point `core.hooksPath` at `.githooks/` (once per clone)    |
| `npm run type-check`                  | Run workspace type-checks through TurboRepo, then the root |
| `npm test`                            | Run workspace tests through TurboRepo                      |
| `npm run test:web`                    | Run web workspace tests                                    |
| `npm run test:mobile`                 | Run mobile, contracts, and schedule-core workspace tests   |
| `npm run test:e2e`                    | Run Playwright end-to-end tests                            |
| `npm run test:e2e:ui`                 | Run Playwright tests with interactive UI                   |
| `npm run test:load`                   | Run the k6 schedule load test                              |
| `npm run test:load:auth`              | Run the k6 auth-flow load test                             |
| `npm run test:load:stress`            | Run the k6 schedule load test in stress mode               |
| `npm run measure:auth:web`            | Measure web sign-in entry timings with Playwright          |
| `npm run measure:auth:mobile`         | Summarize captured mobile auth-entry measurements          |
| `npm run analyze`                     | Build the web app with bundle analysis                     |
| `npm run gen:types`                   | Generate Supabase TypeScript types from the local DB       |
| `npm run seed`                        | Seed the local database (runs `seed.ts` → SQL seed files)  |
| `npm run db:reset`                    | Reset local Supabase DB (runs migrations + seed)           |
| `npm run db:reset:mobile`             | Reset the local DB and Android mobile storage              |
| `npm run db:reset:remote`             | Destructively reset an explicitly non-production remote    |
| `npm run db:reset:staging`            | Same as above, reading `.env.staging`                      |
| `npm run db:seed:branch`              | Seed a Supabase preview branch (`DATABASE_URL` from env)   |
| `npm run db:migrations:check`         | Validate the local ordered migration inventory             |
| `npm run db:migrations:inspect`       | Read-only linked-production ledger/schema qualification    |
| `npm run db:migrations:inspect:local` | Read-only local ledger/schema qualification                |
| `npm run auth:templates:check`        | Diff the compiled auth email templates against remote      |
| `npm run auth:templates:push`         | Push the compiled auth email templates to remote Supabase  |
| `node scripts/doctor-mobile.mjs`      | Diagnose the mobile app's local environment setup          |
| `npm run use:local`                   | Switch .env.local to local Supabase credentials            |
| `npm run use:mobile:local`            | Generate `apps/mobile/.env.local` for local phone testing  |
| `npm run use:mobile:remote`           | Copy remote mobile envs into `apps/mobile/.env.local`      |
| `npm run use:remote`                  | Switch .env.local to remote Supabase credentials           |
| `npm run deps:audit`                  | Run the dependency advisory check                          |
| `npm run deps:scan`                   | Run the supply-chain scan                                  |
| `npm run deps:rebuild`                | Rebuild the allowlisted native dependencies                |

`npm test` runs the workspace suites in parallel through Turbo. If a resource-constrained machine hits unrelated Vitest timeouts, rerun serially before treating it as a product regression:

```bash
npx turbo run test --concurrency=1
```

## Emails

Transactional and Supabase auth emails are authored as [react-email](https://react.email) components in `apps/web/src/emails/`. From the web workspace:

- `npm --workspace @dubgrid/web run email:dev` - preview email components locally
- `npm --workspace @dubgrid/web run email:build` - regenerate the Supabase auth templates under `supabase/templates/*.html` (ten templates: confirmation, invite, magic link, recovery, reauthentication, email change, and the email-changed, password-changed, and MFA enrolled/unenrolled security notices)
- `npm run auth:templates:check` / `npm run auth:templates:push` (repo root) - compare or push those compiled templates to the linked remote project; the dashboard copy does not update itself

Runtime sending uses Resend; `apps/web/src/lib/email.ts` holds only small helpers (`sanitizeHeaderValue`, `emailBaseUrl`).

## Turbo Remote Cache

DubGrid uses TurboRepo for task orchestration and can use **Vercel-managed remote caching** for shared cache hits across local machines and GitHub Actions.

Required secrets/config:

- `TURBO_TEAM` — Vercel team slug that owns the remote cache
- `TURBO_TOKEN` — Vercel Turbo access token with access to that team

Recommended setup:

```bash
export TURBO_TEAM=your-vercel-team-slug
export TURBO_TOKEN=your-vercel-turbo-token
```

With those set:

- `npm run type-check` and `npm test` can reuse remote cache results across machines
- `npm run build` hashes the public web env inputs that affect the Next.js client bundle
- `@dubgrid/mobile` benefits from remote caching for Turbo-managed tasks like `test` and `type-check`

Important:

- Turbo remote caching helps monorepo tasks for both web and mobile code
- It does **not** replace Expo EAS for native iOS/Android builds, signing, or store submission

## GitHub Actions CI Secrets

The `build` job in `.github/workflows/ci.yml` needs the following repo secrets configured
under Settings → Secrets and variables → Actions. GitHub Actions silently substitutes an
empty string for any secret that isn't set (it does not fail the step), so a missing
secret here shows up as a confusing runtime/build failure rather than a clear error —
double-check all of these are set before relying on the `build` job passing.

| Secret                                 | Source                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project API settings (same value as `apps/web/.env.example`)   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project API settings                                           |
| `SUPABASE_SECRET_KEY`                  | Supabase project API settings (server-only, never expose to the client) |
| `NEXT_PUBLIC_SITE_URL`                 | The deployed site origin (e.g. `https://app.example.com`)               |
| `NEXT_PUBLIC_BASE_DOMAIN`              | The base domain used for subdomain routing                              |
| `NEXT_PUBLIC_SENTRY_DSN`               | Sentry project settings                                                 |
| `SENTRY_AUTH_TOKEN`                    | Sentry account → Auth Tokens (used for release/source-map upload)       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | Stripe dashboard → API keys                                             |
| `NEXT_PUBLIC_POSTHOG_KEY`              | PostHog project settings                                                |
| `NEXT_PUBLIC_POSTHOG_HOST`             | PostHog project settings                                                |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`      | Google Cloud Console → APIs & Services → Credentials                    |
| `NEXT_PUBLIC_VERCEL_URL`               | Vercel project settings                                                 |

`TURBO_TEAM`/`TURBO_TOKEN` (documented above) are also read by the `type-check`,
`test`, and `build` jobs, but are optional — CI still passes without them, just without
remote-cache reuse.

## Database

Database history is an immutable ordered migration stream:

- `001_schema.sql` through `004_grants.sql` are the frozen historical baseline.
- Every later schema change is a new, retry-safe `NNN_snake_case.sql` file.
- `supabase/migrations/checksums.sha256` locks every reviewed migration.
- Never edit an applied migration or replay `supabase/patches/` as a migration
  stream. See [Supabase migration instructions](supabase/AGENTS.md) and the
  [production migration runbook](internal/operations/production-migration-safety.md).

## Deployment

Deployed on **Vercel** with a hosted **Supabase** backend. The Next.js request proxy runs at the CDN layer for low-latency RBAC checks and subdomain routing.

Key configuration:

- All routes are simple pages (no catch-all routes) to enable static prerendering
- `apps/web/vercel.json` pins the region and schedules two crons (`/api/cron/trial-expiry` daily, `/api/cron/sandbox-cleanup` daily); `/api/cron/expire-requests` runs hourly from the `cron-expire-requests.yml` GitHub Action. All three require `CRON_SECRET`
- Static security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) live in `apps/web/next.config.ts`; the per-request Content-Security-Policy (nonce-based on authenticated pages) is built in `apps/web/src/proxy.ts`
- Custom access token hook must be enabled in the Supabase dashboard

## Mobile On A Real Phone

For the most reliable first phone workflow, use Expo Go against the hosted backend through a tunnel:

1. Run `npm run use:mobile:remote`
2. Run `npm run dev:mobile:phone`
3. Scan the QR code with Expo Go on your phone

Important:

- `apps/mobile/.env.local` must point `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_API_BASE_URL` at a backend your phone can reach.
- `127.0.0.1` and `localhost` only point back to the phone itself in Expo Go, so they will not reach services running on your laptop.
- `npm run dev:mobile` and `npm run dev:mobile:lan` use LAN mode. This is faster when the phone and computer share a reachable network; otherwise use `npm run dev:mobile:phone`.
- If you want a local backend instead of the hosted one, run `npm run use:mobile:local`. It rewrites the repo's current local Supabase/web URLs to your laptop's private LAN IP and copies the local anon key into `apps/mobile/.env.local`.
- For local phone testing, start the web app with `npm run dev:web:lan` so your phone can reach the API host written into `apps/mobile/.env.local`.

## Documentation

| Document                                                                               | Description                                                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [PRD.md](PRD.md)                                                                       | Product requirements, feature specs, and implementation status                                              |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                     | System design, layered architecture, and technical decisions                                                |
| [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md)                                         | Four-tier role hierarchy, 26 admin permissions, race condition mitigations                                  |
| [SYSTEM_FLOWCHARTS.md](SYSTEM_FLOWCHARTS.md)                                           | Mermaid-based diagrams for auth, JWT hook, org validation, and request flows                                |
| [AGENTS.md](AGENTS.md)                                                                 | Repo conventions, git policy, and commands for AI coding agents (`CLAUDE.md` imports it)                    |
| [blueprint/context/](blueprint/context/)                                               | Project overview, coding standards, and the active feature spec                                             |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                     | Branching, commit, PR, testing, and monorepo contribution conventions                                       |
| [SECURITY.md](SECURITY.md)                                                             | Security policy and vulnerability disclosure process                                                        |
| [CHANGELOG.md](CHANGELOG.md)                                                           | Release history (Keep a Changelog format)                                                                   |
| [internal/api-reference.md](internal/api-reference.md)                                 | API surface — Route Handlers and the `/api/mobile/v1` mobile API                                            |
| [internal/authentication.md](internal/authentication.md)                               | Auth flows — login, JWT hook, invitations, verification                                                     |
| [internal/cookies-and-gdpr.md](internal/cookies-and-gdpr.md)                           | Cookie consent, GDPR data export, and account deletion                                                      |
| [internal/secrets-rotation.md](internal/secrets-rotation.md)                           | Secret rotation procedures per environment                                                                  |
| [internal/mfa-provider-boundary.md](internal/mfa-provider-boundary.md)                 | MFA lifecycle contract and the Supabase provider-boundary qualification                                     |
| [internal/architecture/folder-structure.md](internal/architecture/folder-structure.md) | Monorepo + `apps/web` feature-module folder layout                                                          |
| [internal/operations/auth-resilience.md](internal/operations/auth-resilience.md)       | Diagnosing and recovering organization-bootstrap failures                                                   |
| [internal/operations/](internal/operations/)                                           | Auth entry performance, degraded-network recovery, session continuity, and the production migration runbook |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md)                                                 | Dated security audit findings and their remediation status                                                  |
| [AUTH_EDGE_CASES.md](AUTH_EDGE_CASES.md) / [POTENTIAL_BUGS.md](POTENTIAL_BUGS.md)      | Point-in-time findings logs from the May 2026 sweeps                                                        |
| [code_review.md](code_review.md)                                                       | Review priorities and checklists for this repository                                                        |

## License

Proprietary — DubGrid is confidential software. All rights reserved.
