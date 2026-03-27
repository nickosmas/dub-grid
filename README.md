# DubGrid

Multi-tenant employee scheduling platform for care facilities. Replaces spreadsheet-based scheduling with a modern web app supporting multiple organizations, real-time collaboration, and comprehensive role-based access control.

## Features

- **Schedule Grid** — 1-week, 2-week, and month views with drag-and-drop shift management
- **Multi-Tenant** — Subdomain-based org isolation (e.g., `acme.dubgrid.com`)
- **RBAC** — Four-tier role hierarchy (Gridmaster > Super Admin > Admin > User) with 16 granular admin permissions
- **Draft/Publish Workflow** — All edits are drafts until published; discard or recover across sessions
- **Recurring Shifts** — Day-of-week templates and repeating series (daily, weekly, biweekly)
- **Real-Time Collaboration** — Live sync via Supabase Realtime with cell locks and presence indicators
- **Dashboard Analytics** — KPI cards, coverage charts, shift breakdowns, activity feeds with expandable detail views
- **Staff Management** — Full employee lifecycle (add, edit, bench, terminate) with certifications, roles, and focus areas
- **Staff Detail Pages** — Tabbed views per employee: Overview, Schedule, Activity, Reports
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
| Language      | TypeScript                                            |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com)            |
| Database      | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime + RLS) |
| SSR           | @supabase/ssr v0.9                                    |
| State         | [TanStack React Query v5](https://tanstack.com/query) |
| Drag & Drop   | @dnd-kit/core                                         |
| Email         | [Resend](https://resend.com)                          |
| Rate Limiting | [@upstash/ratelimit](https://upstash.com) + Redis     |
| Validation    | [Zod](https://zod.dev)                                |
| Notifications | [Sonner](https://sonner.emilkowal.dev) v2             |
| Analytics     | [@vercel/analytics](https://vercel.com/analytics)     |
| Testing       | [Vitest](https://vitest.dev) + Testing Library        |
| Deployment    | [Vercel](https://vercel.com)                          |

## Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- A Supabase project (or use local dev with `supabase start`)

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Set up environment variables:**

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
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
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Organization dashboard
│   ├── schedule/           # Schedule grid
│   ├── staff/              # Staff roster + staff/[id] detail
│   ├── settings/           # Organization configuration
│   ├── gridmaster/         # Gridmaster portal
│   ├── login/              # Authentication
│   ├── forgot-password/    # Password reset request
│   ├── reset-password/     # Password reset form (via email link)
│   ├── verify-email/       # Email verification for new accounts
│   ├── accept-invite/      # Invitation acceptance
│   ├── onboarding/         # New user org assignment polling
│   ├── setup/              # Organization setup wizard
│   ├── request-demo/       # Demo request form (landing page)
│   ├── profile/            # User profile
│   └── api/                # API route handlers
├── components/             # UI components
│   ├── auth/               # Auth UI (PasswordInput, PasswordStrength, AuthCard)
│   ├── dashboard/          # Dashboard cards, charts, expanded views
│   ├── gridmaster/         # Gridmaster portal components
│   ├── staff/              # Staff list components
│   ├── staff-detail/       # Staff detail page + tabs
│   ├── landing/            # Landing page feature mockups
│   └── ui/                 # Base UI components (shadcn/ui)
├── hooks/                  # Custom React hooks
├── lib/                    # Data access, utilities, business logic
├── types/                  # TypeScript type definitions
└── __tests__/              # Unit + component tests

supabase/
├── migrations/
│   ├── 001_schema.sql              # Enums, tables, FKs, indexes
│   ├── 002_functions_triggers.sql  # Functions, triggers, hooks, RPCs
│   ├── 003_rls_policies.sql        # Row-level security policies
│   └── 004_grants.sql              # Grants + default privileges
├── seed.ts                         # Seed data for local development
└── config.toml                     # Supabase local config

middleware.ts               # Edge middleware for RBAC + subdomain routing
```

## Available Scripts

| Script                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start Next.js dev server                                 |
| `npm run build`           | Production build                                         |
| `npm run start`           | Start production server                                  |
| `npm test`                | Run unit + component tests (Vitest)                      |
| `npm run test:e2e`        | Run Playwright end-to-end tests                          |
| `npm run test:e2e:ui`     | Run Playwright tests with interactive UI                 |
| `npm run seed`            | Seed the local database with test data                   |
| `npm run db:reset`        | Reset local Supabase DB (runs migrations + seed)         |
| `npm run db:reset:remote` | Reset remote Supabase DB (for staging environments)      |
| `npm run use:local`       | Switch .env.local to local Supabase credentials          |
| `npm run use:remote`      | Switch .env.local to remote Supabase credentials         |

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
- Security headers configured in `next.config.ts`
- Custom access token hook must be enabled in Supabase dashboard

## Documentation

| Document | Description |
| -------- | ----------- |
| [PRD.md](PRD.md) | Product requirements, feature specs, and implementation status |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, layered architecture, and technical decisions |
| [RBAC_SYSTEM_DESIGN.md](RBAC_SYSTEM_DESIGN.md) | Four-tier role hierarchy, 16 admin permissions, race condition mitigations |
| [SYSTEM_FLOWCHARTS.md](SYSTEM_FLOWCHARTS.md) | Mermaid-based diagrams for auth, JWT hook, org validation, and request flows |
| [CLAUDE.md](CLAUDE.md) | Development workflow rules, React/Next.js/security best practices |

## License

Proprietary — DubGrid is confidential software. All rights reserved.
