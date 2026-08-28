# DubGrid

Multi-tenant employee scheduling platform for care facilities. DubGrid replaces spreadsheet-based scheduling with connected web and Expo mobile apps, real-time collaboration, and comprehensive role-based access control.

## Current Product State

DubGrid is an active, full-stack monorepo rather than a starter application. The web app is the primary scheduling and organization-management surface; the companion Expo app gives staff and managers access to schedules, requests, people, alerts, and account settings on the go. Both clients use the same authenticated API contracts, organization boundaries, and shared domain packages.

## Features

- **Schedule Grid** — 1-week, 2-week, and month views with drag-and-drop shift management
- **Multi-Tenant** — Wildcard subdomain-based organization isolation (e.g., `acme.dubgrid.com`). Per-session organization context: switching organizations only affects the calling device.
- **RBAC** — Four-tier role hierarchy (Gridmaster > Super Admin > Admin > User) with 25 per-person admin permissions, plus self-action and admin-tier guards
- **Free Trial** — 14-day trial that starts on the first super admin login; non-super-admins are gated until billing is active
- **Draft/Publish Workflow** — All edits are drafts until published; discard or recover across sessions
- **Recurring Shifts** — Day-of-week templates and repeating series (daily, weekly, biweekly)
- **Real-Time Collaboration** — Live sync via Supabase Realtime with cell locks and presence indicators
- **Web + Mobile** — Next.js web app plus an Expo mobile app for schedules, people, requests, alerts, and account settings
- **Dashboard Analytics** — KPI cards, coverage charts, shift breakdowns, activity feeds with expandable detail views
- **Staff Management** — Full employee lifecycle (add, edit, bench, terminate) with certifications, roles, and focus areas
- **Staff Detail Pages** — Tabbed views per employee: Overview, Schedule, Activity
- **Coverage Tracking** — Define minimum staffing requirements; visualize coverage status per section
- **Shift Requests** — Pickup, swap, and call-off request workflow with admin approval and a full request board
- **Gridmaster Portal** — Platform-wide org management, user impersonation, audit logs, permission configuration, and org-lifecycle notifications
- **Onboarding Gate** — Role-aware onboarding rendered inline (no standalone route); non-admins on an unconfigured org see a setup-pending screen
- **Test Sandbox** — Clone an org's config into an isolated, time-limited sandbox you enter via an HttpOnly cookie (no JWT/session-context hop)
- **Invite-Only Registration** — No public sign-up; 72-hour invitation tokens linked to employee records
- **Password Reset & Email Verification** — Forgot password flow, password strength meter, email verification for new accounts
- **Account Security** — TOTP multi-factor authentication, session/device management, security activity alerts, and account-recovery flows
- **Resilient Auth & Onboarding** — Explicit recovery states for slow or failed organization bootstrap, rather than an empty authenticated shell
- **Notification Inbox** — Searchable, filterable web and mobile inboxes with bulk actions, archiving, and push/deep-link support
- **Print & Export** — Configurable print layout with legend, focus area selection, and date range; PDF/CSV export plus an iCalendar (`.ics`) feed

## Tech Stack

| Layer          | Technology                                                                         |
| -------------- | ---------------------------------------------------------------------------------- |
| Framework      | [Next.js 16](https://nextjs.org) + React 19                                        |
| Monorepo       | npm workspaces + TurboRepo                                                         |
| Language       | TypeScript                                                                         |
| Styling        | [Tailwind CSS v4](https://tailwindcss.com)                                         |
| Database       | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS)              |
| SSR            | @supabase/ssr v0.9                                                                 |
| State          | [TanStack React Query v5](https://tanstack.com/query)                              |
| Drag & Drop    | @dnd-kit/core                                                                      |
| Mobile         | [Expo](https://expo.dev) SDK 54 + React Native (Expo Router)                       |
| Email          | [Resend](https://resend.com)                                                       |
| Billing        | [Stripe](https://stripe.com) (subscriptions + webhooks)                            |
| Rate Limiting  | [@upstash/ratelimit](https://upstash.com) + Redis                                  |
| Validation     | [Zod](https://zod.dev)                                                             |
| JWT            | [jose](https://github.com/panva/jose)                                              |
| Notifications  | [Sonner](https://sonner.emilkowal.dev) v2                                          |
| Analytics      | [@vercel/analytics](https://vercel.com/analytics) + [PostHog](https://posthog.com) |
| Error Tracking | [Sentry](https://sentry.io)                                                        |
| Testing        | [Vitest](https://vitest.dev) + Testing Library                                     |
| Deployment     | [Vercel](https://vercel.com)                                                       |

## Prerequisites

- Node.js 22.13.x (npm 10.9.x) — see `engines` in `package.json`
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

4. **Reset database (runs migrations + seed):**

```bash
npm run db:reset
```

5. **Start Redis locally:**

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

6. **Start the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
apps/
├── web/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── components/             # Shared web UI
│   │   ├── features/               # Domain-first server/client feature modules
│   │   ├── hooks/                  # Web-only React hooks
│   │   ├── lib/                    # Data access, utilities, integrations
│   │   ├── types/                  # Web TypeScript types
│   │   ├── proxy.ts                # Next.js request proxy for RBAC, CSP, billing, and subdomain routing
│   │   └── __tests__/              # Web unit + component tests
│   ├── public/                     # Static web assets
│   ├── messages/                   # next-intl locale messages
│   └── next.config.ts              # Next.js config + security headers
│
├── mobile/
│   ├── app/                        # Expo Router entrypoints
│   └── src/
│       ├── features/               # auth, schedule, people, requests, profile, notifications, onboarding
│       └── shared/                 # mobile-wide providers, navigation, API client, theme, UI shells
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
├── schedule-core/                  # Schedule transformation/calculation logic
│
supabase/
├── migrations/
│   ├── 001_schema.sql              # Enums, tables, FKs, indexes
│   ├── 002_functions_triggers.sql  # Functions, triggers, hooks, RPCs
│   ├── 003_rls_policies.sql        # Row-level security policies
│   └── 004_grants.sql              # Grants + default privileges
├── seed_arden_wood.sql             # Seed data — Arden Wood demo org
├── seed_calm_haven.sql             # Seed data — Calm Haven demo org
├── seed_gridmaster.sql             # Seed data — gridmaster account
└── config.toml                     # Supabase local config

seed.ts                             # Root seed runner (executes the SQL seed files)
```

## Available Scripts

| Script                           | Description                                               |
| -------------------------------- | --------------------------------------------------------- |
| `npm run dev`                    | Start the web app through TurboRepo                       |
| `npm run dev:web`                | Start the Next.js web app through TurboRepo               |
| `npm run dev:web:lan`            | Start the Next.js web app on `0.0.0.0` for phone access   |
| `npm run dev:webpack`            | Start the web app with the Webpack dev server             |
| `npm run dev:mobile`             | Start the Expo mobile app in LAN mode                     |
| `npm run dev:mobile:phone`       | Start the Expo mobile app in tunnel mode for Expo Go      |
| `npm run dev:mobile:lan`         | Start the Expo mobile app in LAN mode                     |
| `npm run build`                  | Dependency-aware production build for the web app         |
| `npm run build:packages`         | Build all `packages/*` workspaces (tsc → `dist/`)         |
| `npm run start`                  | Start the web production server                           |
| `npm run lint`                   | Run ESLint                                                |
| `npm run format:check`           | Check Prettier formatting without writing files           |
| `npm run type-check`             | Run workspace type-checks through TurboRepo               |
| `npm test`                       | Run workspace tests through TurboRepo                     |
| `npm run test:web`               | Run web workspace tests                                   |
| `npm run test:mobile`            | Run mobile + contracts workspace tests                    |
| `npm run test:e2e`               | Run Playwright end-to-end tests                           |
| `npm run test:e2e:ui`            | Run Playwright tests with interactive UI                  |
| `npm run test:load`              | Run the k6 schedule load test                             |
| `npm run test:load:auth`         | Run the k6 auth-flow load test                            |
| `npm run test:load:stress`       | Run the k6 schedule load test in stress mode              |
| `npm run analyze`                | Build the web app with bundle analysis                    |
| `npm run gen:types`              | Generate Supabase TypeScript types from the local DB      |
| `npm run seed`                   | Seed the local database (runs `seed.ts` → SQL seed files) |
| `npm run db:reset`               | Reset local Supabase DB (runs migrations + seed)          |
| `npm run db:reset:mobile`        | Reset the local DB and Android mobile storage             |
| `npm run db:reset:remote`        | Reset remote Supabase DB (for staging environments)       |
| `node scripts/doctor-mobile.mjs` | Diagnose the mobile app's local environment setup         |
| `npm run use:local`              | Switch .env.local to local Supabase credentials           |
| `npm run use:mobile:local`       | Generate `apps/mobile/.env.local` for local phone testing |
| `npm run use:mobile:remote`      | Copy remote mobile envs into `apps/mobile/.env.local`     |
| `npm run use:remote`             | Switch .env.local to remote Supabase credentials          |
| `npm run deps:audit`             | Run the dependency advisory check                         |
| `npm run deps:scan`              | Run the supply-chain scan                                 |

`npm test` runs the workspace suites in parallel through Turbo. If a resource-constrained machine hits unrelated Vitest timeouts, rerun serially before treating it as a product regression:

```bash
npx turbo run test --concurrency=1
```

## Emails

Transactional and Supabase auth emails are authored as [react-email](https://react.email) components in `apps/web/src/emails/`. From the web workspace:

- `npm --workspace @dubgrid/web run email:dev` — preview email components locally
- `npm --workspace @dubgrid/web run email:build` — regenerate the Supabase auth templates under `supabase/templates/*.html`

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

All schema lives in exactly **4 migration files** — never create additional files:

- `001_schema.sql` — Enums, tables, foreign keys, indexes, realtime subscriptions
- `002_functions_triggers.sql` — Functions, triggers, auth hooks, RPCs
- `003_rls_policies.sql` — Row-Level Security policies for all tables
- `004_grants.sql` — Grants for anon, authenticated, service_role, and supabase_auth_admin

## Deployment

Deployed on **Vercel** with a hosted **Supabase** backend. The Next.js request proxy runs at the CDN layer for low-latency RBAC checks and subdomain routing.

Key configuration:

- All routes are simple pages (no catch-all routes) to enable static prerendering
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

| Document                                                                       | Description                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [PRD.md](PRD.md)                                                               | Product requirements, feature specs, and implementation status               |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                             | System design, layered architecture, and technical decisions                 |
| [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md)                                 | Four-tier role hierarchy, 25 admin permissions, race condition mitigations   |
| [SYSTEM_FLOWCHARTS.md](SYSTEM_FLOWCHARTS.md)                                   | Mermaid-based diagrams for auth, JWT hook, org validation, and request flows |
| [CLAUDE.md](CLAUDE.md)                                                         | Development workflow rules, React/Next.js/security best practices            |
| [AGENTS.md](AGENTS.md)                                                         | Repo conventions and guidance for AI coding agents                           |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                             | Branching, commit, PR, testing, and monorepo contribution conventions        |
| [SECURITY.md](SECURITY.md)                                                     | Security policy and vulnerability disclosure process                         |
| [CHANGELOG.md](CHANGELOG.md)                                                   | Release history (Keep a Changelog format)                                    |
| [docs/api-reference.md](docs/api-reference.md)                                 | API surface — Route Handlers and the `/api/mobile/v1` mobile API             |
| [docs/authentication.md](docs/authentication.md)                               | Auth flows — login, JWT hook, invitations, verification                      |
| [docs/cookies-and-gdpr.md](docs/cookies-and-gdpr.md)                           | Cookie consent, GDPR data export, and account deletion                       |
| [docs/secrets-rotation.md](docs/secrets-rotation.md)                           | Secret rotation procedures per environment                                   |
| [docs/architecture/folder-structure.md](docs/architecture/folder-structure.md) | Monorepo + `apps/web` feature-module folder layout                           |
| [docs/operations/auth-resilience.md](docs/operations/auth-resilience.md)       | Diagnosing and recovering organization-bootstrap failures                    |

## License

Proprietary — DubGrid is confidential software. All rights reserved.
