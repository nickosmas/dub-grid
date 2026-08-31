# DubGrid - Project Overview

<!-- blueprint:source-hash b25ebfe885ef7b956598dc2523ef1f83cfa13c63de1ae3f428d3759aed70c3f0 -->

> Multi-tenant employee scheduling platform for care facilities, replacing
> spreadsheet scheduling with a connected Next.js web app and Expo mobile app.

## Problem

Care facilities schedule staff on shared spreadsheets, which can't safely
handle multiple managers and staff editing concurrently, can't enforce
who's allowed to change what, and leave no audit trail of shift-change
activity (call-offs, swaps, pickups). DubGrid replaces that with a
real-time, role-based scheduling platform purpose-built for care
facilities.

## Users

- **Staff** - view their schedule, submit shift requests (pickup, swap,
  call-off), see alerts and notifications, on web and mobile.
- **Managers / Admins** - build and publish schedules, manage people and
  focus areas, review and approve requests, run reports, configure org
  settings. Admin capability is a configurable, per-person set of 25
  permissions, not a role template.
- **Super Admins** - full control within one organization, including
  managing Admin-tier permissions and billing.
- **Gridmaster (platform team)** - cross-organization platform
  administration: impersonation, audit logs, tenant lifecycle. A distinct
  platform role, never surfaced as an "admin portal" to org users.
- Organizations are multi-tenant, each isolated on its own subdomain.

## Features

Everything below is already shipped except item 17, which is an open
roadmap slot (see Open questions).

1. **Multi-tenant organizations** - subdomain-isolated tenants with their
   own settings and terminology overrides.
2. **Four-tier RBAC** - Gridmaster > Super Admin > Admin > User, with
   per-person configurable admin permissions.
3. **Schedule grid** - drag-drop week / 2-week / month views, draft/publish
   workflow, recurring shifts. Headline feature - the core product.
4. **Real-time schedule collaboration** - Supabase Realtime cell locks and
   presence so concurrent edits don't collide.
5. **Staff / people management** - lifecycle, focus areas, certifications.
6. **Shift requests** - pickup, swap, call-off with approval workflow and
   auditable request events/snapshots.
7. **Coverage tracking and dashboard analytics** - shared coverage engine
   used by both web and mobile.
8. **Reports** - staff hours, staff activity, shift-category breakdowns,
   CSV/PDF export.
9. **Gridmaster portal** - cross-org platform administration,
   impersonation, audit logs.
10. **Billing** - Stripe per-seat subscriptions with a 14-day free trial.
11. **Mobile app parity** - Expo app covering schedule, people, requests,
    alerts, dashboard. Reports, billing, the Gridmaster portal, the
    permissions editor, and org settings are deliberately web-only.
12. **Invite-only onboarding** - pre-confirmed accounts via the invitation
    flow; no public self-serve signup.
13. **Auth** - password reset (mobile uses an in-app OTP flow), MFA/TOTP,
    per-session org isolation.
14. **Notification inbox**.
15. **Print / export** - PDF, CSV, and .ics output.
16. **Test sandbox** - cookie-based cloned org for safe QA against
    non-production data.
17. **TODO** - next roadmap feature not yet named (see Open questions).

## Data model

### Organization

- `id`, `subdomain`, `name`, terminology overrides (e.g. Wings -> Focus
  Areas, Skill Levels -> Certifications)
- `workspace_kind` - the only place "workspace" appears in the schema
- relationship: has many Employees, Schedules, Focus Areas, Absence Types

### Profile / User

- `id`, `platform_role` (top-level, e.g. Gridmaster)
- relationship: has many Organization Memberships (one per org they
  belong to)

### Organization Membership

- `org_id`, `user_id`, `org_role` (Super Admin / Admin / User),
  `admin_permissions` (25-key JSONB, per-person, not department-templated)
- relationship: belongs to one Organization and one Profile

### Employee / Staff

- `org_id`, `focus_area_id`, `employment_status`, `certifications`
  (nursing-credential staff only; support staff carry no certification,
  never a catch-all "Other")
- relationship: belongs to an Organization and a Focus Area

### Schedule Entry

- `org_id`, `employee_id`, `date`, `shift_code`, draft/published state,
  snapshot fields for audit history (top-level fields like start time and
  label are derived from the snapshot, not independently patchable)
- relationship: belongs to an Employee, references a Recurring Shift when
  generated from one

### Shift Request

- `org_id`, `employee_id`, `type` (pickup / swap / call-off), `status`,
  approval events, request snapshot for audit trail
- relationship: belongs to an Employee, may reference a Schedule Entry

### Absence Type

- `org_id`, label (customizable), whether it represents a published
  absence vs. an unscheduled day
- relationship: belongs to an Organization

### Notification

- `org_id`, `user_id`, type, read state
- relationship: belongs to a Profile

### Subscription (Billing)

- `org_id`, Stripe customer id, Stripe subscription id, trial state
  (trial clock starts on first Super Admin login via `start_trial_for_org`,
  not on signup), seat count (per-seat pricing)
- relationship: belongs to an Organization

### Audit Log

- Gridmaster-level and per-org activity entries: actor, action, target,
  timestamp
- relationship: references a Profile and, where applicable, an
  Organization

> Locked: Schedule Entry snapshots are the source of truth for
> schedule-cell audit history - later features must patch through the
> snapshot upsert, not top-level fields directly.

## Tech stack

- **Next.js 16 (App Router) + React 19** - web app, TypeScript strict
- **Expo SDK 54 + Expo Router** - mobile app
- **npm workspaces + Turborepo** - monorepo across `apps/web`,
  `apps/mobile`, and 10 shared `packages/*`
- **Supabase** - Postgres, Auth, Realtime, Row Level Security (no ORM;
  RLS is the real security boundary)
- **Tailwind CSS v4** - styling, CSS-first `@theme` config, dark mode first
- **TanStack Query v5** - client-side and mobile data fetching
- **@dnd-kit** - schedule grid drag-drop
- **Zod** - input validation
- **jose** - local JWT verification (avoids a network round trip per
  request)
- **Upstash Redis + @upstash/ratelimit** - production-only rate limiting
- **Stripe** - billing
- **Resend + react-email** - transactional email
- **Sentry, PostHog, Vercel Analytics** - observability
- **Vitest + Testing Library, Playwright** - unit/integration and E2E
  testing (already configured; the testing gate is on)

## Monetization

Per-seat subscription pricing via Stripe: price scales with the number of
staff/users in an organization. New organizations get a 14-day free
trial before conversion is required.

> TODO: exact per-seat price points and any tier breaks.

## UI/UX

Dark mode first, light mode as an option. Tailwind v4 with design tokens
in `packages/design-tokens` (avatar tone, elevation, gradients, icon
tone) shared conceptually with a parallel `mobile*` token set (the two
apps don't share component code, only the visual language). Neutral
grays carry a deliberate tint - slate in light mode, zinc in dark mode.
All org-customizable terminology (Wings, Skill Levels, etc.) is read
through the org's terminology config, never hardcoded.

Main route groups (web, App Router):

- `(app)` - authenticated area: dashboard, schedule, people, reports,
  settings, profile, Gridmaster portal
- `/api` - Route Handlers (webhooks, mobile endpoints, uploads)
- `/cookie-policy`, `/privacy`, `/terms`, `/request-demo` - public pages

## Deployment

- **Host:** Vercel (web). No committed `render.yaml` or `vercel.json` -
  project configuration lives in the Vercel dashboard.
- **App type:** Next.js 16 App Router, standard Vercel build
  (`npm run build`) and start (`npm run start`).
- **Database:** Supabase-hosted Postgres, migrations in
  `supabase/migrations/`. Feature flags specifically have no incremental
  production migration path - they're created through the Gridmaster UI,
  not a migration.
- **Background jobs:** `cron-expire-requests.yml` (GitHub Action) expires
  stale shift requests on a schedule.

> TODO: env vars by name, health check path, and domain notes. Run
> `/release vercel` for a real readiness pass instead of guessing here.

## Open questions

- Item 17's real next feature(s) were not specified during `/adopt` and
  need to be named before `/feature 17` can spec anything.
- Exact per-seat billing price points / tier breaks are unconfirmed.
- Deployment env vars, health check path, and domain notes are unconfirmed.
