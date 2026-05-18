# DubGrid

Multi-tenant employee scheduling platform for care facilities. Replaces spreadsheet-based scheduling with a modern web app supporting multiple organizations, real-time collaboration, and comprehensive role-based access control.

## Features

- **Schedule Grid** — 1-week, 2-week, and month views with drag-and-drop shift management
- **Multi-Tenant** — Subdomain-based org isolation (e.g., `acme.dubgrid.com`)
- **RBAC** — Four-tier role hierarchy (Gridmaster > Super Admin > Admin > User) with 25 granular admin permissions
- **Draft/Publish Workflow** — All edits are drafts until published; discard or recover across sessions
- **Recurring Shifts** — Day-of-week templates and repeating series (daily, weekly, biweekly)
- **Real-Time Collaboration** — Live sync via Supabase Realtime with cell locks and presence indicators
- **Dashboard Analytics** — KPI cards, coverage charts, shift breakdowns, activity feeds with expandable detail views
- **Staff Management** — Full employee lifecycle (add, edit, bench, terminate) with certifications, roles, and focus areas
- **Staff Detail Pages** — Tabbed views per employee: Overview, Schedule, Activity
- **Coverage Tracking** — Define minimum staffing requirements; visualize coverage status per section
- **Shift Requests** — Pickup and swap request workflow with admin approval
- **Gridmaster Portal** — Platform-wide org management, user impersonation, audit logs, permission configuration
- **Invite-Only Registration** — No public sign-up; 72-hour invitation tokens linked to employee records
- **Password Reset & Email Verification** — Forgot password flow, password strength meter, email verification for new accounts
- **Print Export** — Configurable print layout with legend, focus area selection, and date range

## Tech Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Framework     | [Next.js 16](https://nextjs.org) + React 19           |
| Monorepo      | npm workspaces + TurboRepo                            |
| Language      | TypeScript                                            |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com)            |
| Database      | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS) |
| SSR           | @supabase/ssr v0.9                                    |
| State         | [TanStack React Query v5](https://tanstack.com/query) |
| Drag & Drop   | @dnd-kit/core                                         |
| Mobile        | [Expo](https://expo.dev) SDK 54 + React Native (Expo Router) |
| Email         | [Resend](https://resend.com)                          |
| Billing       | [Stripe](https://stripe.com) (subscriptions + webhooks) |
| Rate Limiting | [@upstash/ratelimit](https://upstash.com) + Redis     |
| Validation    | [Zod](https://zod.dev)                                |
| JWT           | [jose](https://github.com/panva/jose)                 |
| Notifications | [Sonner](https://sonner.emilkowal.dev) v2             |
| Analytics     | [@vercel/analytics](https://vercel.com/analytics) + [PostHog](https://posthog.com) |
| Error Tracking| [Sentry](https://sentry.io)                           |
| Testing       | [Vitest](https://vitest.dev) + Testing Library        |
| Deployment    | [Vercel](https://vercel.com)                          |

## Prerequisites

- Node.js 22.13.x (npm 10.9.x) — see `engines` in `package.json`
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- A Supabase project (or use local dev with `supabase start`)

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Set up environment variables:**

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional: browser-restricted Google Maps Places key for org address autocomplete
# NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-restricted-google-maps-key
```

3. **Start Supabase locally:**

```bash
supabase start
```

4. **Reset database (runs migrations + seed):**

```bash
npm run db:reset
```

5. **Start the development server:**

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
│   │   └── __tests__/              # Web unit + component tests
│   ├── public/                     # Static web assets
│   ├── messages/                   # next-intl locale messages
│   ├── middleware.ts               # Edge middleware for RBAC + subdomain routing
│   └── next.config.ts              # Next.js config + security headers
│
├── mobile/
│   ├── app/                        # Expo Router entrypoints
│   └── src/
│       ├── features/               # auth, schedule, people, requests, profile, notifications, onboarding
│       └── shared/                 # mobile-wide providers, navigation, API client, theme, UI shells
│
packages/                           # Platform-neutral workspaces (built with tsc → dist/)
├── api-client/                     # HTTP client primitives (headers, JSON requests, errors)
├── authz/                          # Permission logic — roles, perms, JWT claim extraction
├── contracts/                      # Shared Zod schemas + inferred API contract types
├── data-access/                    # Supabase queries + data mapping (shared mobile data layer)
├── db-types/                       # DB-row TypeScript types
├── design-tokens/                  # Shared design values
├── domain/                         # Platform-neutral domain types/enums + pure logic
├── mobile-api-core/                # Framework-neutral mobile backend orchestration
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

| Script                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start the web app through TurboRepo                      |
| `npm run dev:web`         | Start the Next.js web app through TurboRepo              |
| `npm run dev:web:lan`     | Start the Next.js web app on `0.0.0.0` for phone access  |
| `npm run dev:webpack`     | Start the web app with the Webpack dev server            |
| `npm run dev:mobile`      | Start the Expo mobile app in tunnel mode for Expo Go     |
| `npm run dev:mobile:phone`| Start the Expo mobile app in tunnel mode for Expo Go     |
| `npm run dev:mobile:lan`  | Start the Expo mobile app in LAN mode                    |
| `npm run build`           | Dependency-aware production build for the web app        |
| `npm run build:packages`  | Build all `packages/*` workspaces (tsc → `dist/`)        |
| `npm run start`           | Start the web production server                          |
| `npm run lint`            | Run ESLint                                               |
| `npm run type-check`      | Run workspace type-checks through TurboRepo              |
| `npm test`                | Run workspace tests through TurboRepo                    |
| `npm run test:web`        | Run web workspace tests                                  |
| `npm run test:mobile`     | Run mobile + contracts workspace tests                   |
| `npm run test:e2e`        | Run Playwright end-to-end tests                          |
| `npm run test:e2e:ui`     | Run Playwright tests with interactive UI                 |
| `npm run test:load`       | Run the k6 schedule load test                            |
| `npm run test:load:auth`  | Run the k6 auth-flow load test                           |
| `npm run test:load:stress`| Run the k6 schedule load test in stress mode             |
| `npm run analyze`         | Build the web app with bundle analysis                   |
| `npm run gen:types`       | Generate Supabase TypeScript types from the local DB     |
| `npm run seed`            | Seed the local database (runs `seed.ts` → SQL seed files)|
| `npm run db:reset`        | Reset local Supabase DB (runs migrations + seed)         |
| `npm run db:reset:remote` | Reset remote Supabase DB (for staging environments)      |
| `npm run doctor:mobile`   | Diagnose the mobile app's local environment setup        |
| `npm run use:local`       | Switch .env.local to local Supabase credentials          |
| `npm run use:mobile:local`| Generate `apps/mobile/.env.local` for local phone testing|
| `npm run use:mobile:remote`| Copy remote mobile envs into `apps/mobile/.env.local`   |
| `npm run use:remote`      | Switch .env.local to remote Supabase credentials         |

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

## Database

All schema lives in exactly **4 migration files** — never create additional files:

- `001_schema.sql` — Enums, tables, foreign keys, indexes, realtime subscriptions
- `002_functions_triggers.sql` — Functions, triggers, auth hooks, RPCs
- `003_rls_policies.sql` — Row-Level Security policies for all tables
- `004_grants.sql` — Grants for anon, authenticated, service_role, and supabase_auth_admin

## Deployment

Deployed on **Vercel** with a hosted **Supabase** backend. Edge middleware runs at the CDN layer for low-latency RBAC checks and subdomain routing.

Key configuration:
- All routes are simple pages (no catch-all routes) to enable static prerendering
- Security headers configured in `apps/web/next.config.ts`
- Custom access token hook must be enabled in the Supabase dashboard

## Mobile On A Real Phone

For the first stable phone workflow, use Expo Go against the hosted backend:

1. Run `npm run use:mobile:remote`
2. Run `npm run dev:mobile`
3. Scan the QR code with Expo Go on your phone

Important:

- `apps/mobile/.env.local` must point `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_API_BASE_URL` at a backend your phone can reach.
- `127.0.0.1` and `localhost` only point back to the phone itself in Expo Go, so they will not reach services running on your laptop.
- If Expo Go shows an `exp://192.168.x.x:8081` URL again, you are in LAN mode. Use `npm run dev:mobile` or `npm run dev:mobile:phone` instead.
- If you want a local backend instead of the hosted one, run `npm run use:mobile:local`. It rewrites the repo's current local Supabase/web URLs to your laptop's private LAN IP and copies the local anon key into `apps/mobile/.env.local`.
- For local phone testing, start the web app with `npm run dev:web:lan` so your phone can reach the API host written into `apps/mobile/.env.local`.

## Documentation

| Document | Description |
| -------- | ----------- |
| [PRD.md](PRD.md) | Product requirements, feature specs, and implementation status |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layered architecture, and technical decisions |
| [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md) | Four-tier role hierarchy, 25 admin permissions, race condition mitigations |
| [SYSTEM_FLOWCHARTS.md](SYSTEM_FLOWCHARTS.md) | Mermaid-based diagrams for auth, JWT hook, org validation, and request flows |
| [CLAUDE.md](CLAUDE.md) | Development workflow rules, React/Next.js/security best practices |
| [AGENTS.md](AGENTS.md) | Repo conventions and guidance for AI coding agents |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branching, commit, PR, testing, and monorepo contribution conventions |
| [SECURITY.md](SECURITY.md) | Security policy and vulnerability disclosure process |
| [CHANGELOG.md](CHANGELOG.md) | Release history (Keep a Changelog format) |
| [docs/api-reference.md](docs/api-reference.md) | API surface — Route Handlers and the `/api/mobile/v1` mobile API |
| [docs/authentication.md](docs/authentication.md) | Auth flows — login, JWT hook, invitations, verification |
| [docs/cookies-and-gdpr.md](docs/cookies-and-gdpr.md) | Cookie consent, GDPR data export, and account deletion |
| [docs/secrets-rotation.md](docs/secrets-rotation.md) | Secret rotation procedures per environment |
| [docs/architecture/folder-structure.md](docs/architecture/folder-structure.md) | Monorepo + `apps/web` feature-module folder layout |

## License

Proprietary — DubGrid is confidential software. All rights reserved.
