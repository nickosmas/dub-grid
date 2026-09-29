# DubGrid - Project Overview

<!-- blueprint:source-hash b5d523fed3103cbbc315c940ba71258f2c9b07f42da2e94c5c42cc426593fe70 -->

> Multi-tenant employee scheduling for care facilities, delivered through a
> connected Next.js web app and Expo mobile app.

## Problem

Care facilities need more than a shared scheduling spreadsheet. Concurrent
editing, tenant isolation, role-based access, staff lifecycle changes, shift
requests, and auditable schedule history all require a connected system with
clear authorization and recovery behavior. DubGrid provides that system for
organization staff, managers, and platform operators.

## Users

- **Staff** - view schedules, submit pickup, swap, and call-off requests, and
  receive alerts on web and mobile.
- **Managers and Admins** - build and publish schedules, manage people, review
  requests, run reports, and configure the organization. Admin capabilities are
  assigned per person through a 25-permission set.
- **Super Admins** - have full control inside one organization, including Admin
  permissions and billing.
- **Gridmasters** - operate the cross-organization platform, including
  impersonation, platform audit, feature controls, and tenant lifecycle. This is
  an internal platform role, not an organization admin portal.
- **Organizations** - are isolated tenants with their own subdomain, data,
  settings, terminology, and subscription state.

## Features

Items appear in build-plan order. Items 1 through 39 and 41 through 43 are
shipped. Item 40 is in progress.

| Item | Status      | Outcome                                                                                                                         |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Shipped     | Multi-tenant organizations with subdomain isolation and organization-specific settings.                                         |
| 2    | Shipped     | Four-tier RBAC with per-person Admin permissions.                                                                               |
| 3    | Shipped     | Week, two-week, and month schedule views with draft and publish workflows.                                                      |
| 4    | Shipped     | Realtime editor presence plus optimistic conflict detection; advisory cell locks were removed.                                  |
| 5    | Shipped     | People lifecycle, departments or focus areas, roles, and certifications.                                                        |
| 6    | Shipped     | Pickup, swap, and call-off requests with approval events and snapshots.                                                         |
| 7    | Shipped     | Shared coverage calculations and role-aware dashboard analytics.                                                                |
| 8    | Shipped     | Staff hours, activity, and other reports with CSV and PDF export.                                                               |
| 9    | Shipped     | Internal Gridmaster platform operations, impersonation, audit, and tenant controls.                                             |
| 10   | Shipped     | Stripe per-seat subscriptions with a 14-day trial beginning on first Super Admin login.                                         |
| 11   | Shipped     | Expo mobile access to schedule, people, requests, alerts, dashboard, and account surfaces, with deliberate web-only boundaries. |
| 12   | Shipped     | Invite-only, pre-confirmed account creation and member onboarding.                                                              |
| 13   | Shipped     | Web and mobile recovery, MFA/TOTP, and per-session organization isolation.                                                      |
| 14   | Shipped     | Web and mobile notification inboxes.                                                                                            |
| 15   | Shipped     | PDF, CSV, calendar, and print outputs where supported.                                                                          |
| 16   | Shipped     | Internal Test Sandbox using a cookie-selected cloned organization.                                                              |
| 17   | Shipped     | Capability-aware People forms that hide scheduling or management fields when access changes.                                    |
| 18   | Shipped     | Mobile role eligibility and a canonical shared dashboard model and experience.                                                  |
| 19   | Shipped     | Auth and onboarding correctness, journey coverage, resilience, security, and release qualification.                             |
| 20   | Shipped     | An explicit, accessible control for removing an active schedule note.                                                           |
| 21   | Shipped     | Resilient Settings display previews and content-aware configuration tables.                                                     |
| 22   | Shipped     | Qualified, conflict-free staffing of open shifts through the normal draft workflow.                                             |
| 23   | Shipped     | Overflow-safe pills, chips, badges, and segmented controls across web and mobile.                                               |
| 24   | Shipped     | Inter for product UI, DM Sans for the wordmark and marketing headings, and tabular scheduling numerals.                         |
| 25   | Shipped     | Shared web UI contracts plus route, role, state, viewport, theme, and zoom qualification.                                       |
| 26   | Shipped     | Removed duplicate Staff-page data loading.                                                                                      |
| 27   | Shipped     | Cleared the stale publish-highlight state after publication.                                                                    |
| 28   | Shipped     | Removed duplicate published-range loading on the Schedule page.                                                                 |
| 29   | Shipped     | Removed duplicate dashboard request fetching and realtime subscriptions.                                                        |
| 30   | Shipped     | Removed duplicate operations-report fetching.                                                                                   |
| 31   | Shipped     | Made publish-difference highlighting work in Month and Mobile Day views.                                                        |
| 32   | Shipped     | Made adjacent-day staffing overlap checks explicit and complete.                                                                |
| 33   | Shipped     | Exercised the staffed-call-off finalization trigger with real publish behavior.                                                 |
| 34   | Shipped     | Added final swap resolution alerts for an affected swap partner.                                                                |
| 35   | Shipped     | Shared one reference-counted mobile shift-request realtime channel.                                                             |
| 36   | Shipped     | Delayed the trial welcome until onboarding is complete.                                                                         |
| 38   | Shipped     | Unified mobile spacing, type, controls, dashboard, request exits, sheets, and qualification evidence.                           |
| 39   | Shipped     | Made alerts navigate to their subject through one shared destination contract.                                                  |
| 37   | Shipped     | Reconciled and applied the production migration suffix through 040 with scratch rehearsal and ledger verification.              |
| 41   | Shipped     | Invitation, credential, session, recovery, and security-notice hardening with Gridmaster grants that need fresh proof.          |
| 42   | Shipped     | Schedule notes on every schedule surface, each belonging to its shift.                                                          |
| 43   | Shipped     | Complete person records for managers and one Gridmaster person page with two-factor lockout recovery.                           |
| 40   | In progress | Public and internal documentation accurate for `dev`, with permanent drift gates.                                               |

Item 40 is split:

- **40a - Source-derived inventory and documentation contract:** shipped.
- **40b - Public scheduling, people, and configuration guides:** shipped.
- **40c - Public mobile, account, alerts, reports, billing, and access
  guides:** shipped; every public page is verified against source, and the
  replaced pages redirect.
- **40d - Current engineering, architecture, security, and operations
  references:** in progress.
- **40e - Cross-platform runtime qualification and permanent drift gates:**
  planned; requires recorded iOS and Android evidence.

Public documentation covers customer behavior only. Gridmaster tooling, Test
Sandbox, feature flags, migrations, environment variables, and internal HTTP
endpoints remain internal.

## Data model

### Organization

- `id` (UUID) - tenant identifier
- `subdomain` (text) - organization routing boundary
- `name` (text) - customer-facing organization name
- terminology and configuration fields - organization-specific labels and
  settings
- `workspace_kind` - the only approved use of the word "workspace" in product
  data
- has many memberships, employees, schedule records, requests, notifications,
  and audit entries

### Profile

- `id` (UUID) - Supabase Auth user identifier
- `platform_role` - platform-level role, including Gridmaster
- has memberships in one or more organizations
- has sessions and account-level security, notification, privacy, and calendar
  preferences

### Organization membership

- `org_id` and `user_id` - tenant and profile relationship
- `org_role` - Super Admin, Admin, or User
- `admin_permissions` (JSONB) - the 25-key per-person Admin capability set
- onboarding completion and tour state
- archived and access state used by admission checks
- belongs to one organization and one profile

### Employee

- `org_id` and linked user identity where present
- department or focus-area assignment, role, and certifications
- `employment_status` - active, inactive, or removed; only active staff can be
  scheduled and count toward billing
- scheduling and management access are independent capabilities
- belongs to one organization and participates in schedules and requests

### Schedule entry and recurring shift

- organization, employee or open-shift identity, date, shift, job, and absence
  facts
- draft and published state with optimistic versioning
- snapshot fields are the source of truth for schedule-cell audit history
- recurring shifts generate bounded series through the normal draft workflow

### Schedule note

- organization, employee, date, note type, and the shift it belongs to
- draft and published state; every note records its author

### Shift request

- `org_id`, requester, optional target person, and related schedule entry
- `type` - pickup, swap, or call-off
- status, approval events, and immutable request snapshots
- belongs to an employee and organization

### Notification

- organization, recipient, type, read or archived state, priority, metadata, and
  optional action destination
- destinations are resolved through the shared domain contract

### Subscription

- organization, Stripe customer and subscription identifiers, seat count, and
  trial or billing state
- the trial begins on first Super Admin login, not at signup

### Audit log

- actor, action, target, timestamp, and organization when applicable
- organization activity is customer-facing; platform audit remains internal

### Auth session

- session identity, user identity, organization, assurance, and revocation state
- drives per-session JWT claims and live authorization checks

> Schedule snapshots, organization scope, and the effective sandbox-aware
> organization ID are security and history boundaries. Later work must preserve
> them.

## Tech stack

- **Monorepo** - npm workspaces and Turborepo across `apps/web`,
  `apps/mobile`, and 11 shared packages.
- **Web** - Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS
  v4.
- **Mobile** - Expo SDK 54, Expo Router, and React Native.
- **Backend** - Supabase Postgres, Auth, Realtime, and Row Level Security with no
  ORM.
- **Data access** - direct Supabase clients on the server, TanStack Query v5 for
  client and mobile state, and the authenticated mobile HTTP API for application
  data. Mobile uses Supabase directly for Auth and Realtime, not application
  table CRUD.
- **Validation and auth** - Zod and locally verified JWTs through `jose`.
- **Scheduling UI** - `@dnd-kit` for web drag and drop.
- **Infrastructure services** - Upstash rate limiting, Stripe, Resend, Sentry,
  PostHog, and Vercel Analytics.
- **Testing** - Vitest, Testing Library, and Playwright.
- **Documentation** - Mintlify, with a source-derived inventory, an accuracy
  manifest whose pages carry evidence fingerprints, and `docs:check`,
  `docs:fingerprint`, and `docs:verify`.

## Monetization

DubGrid uses Stripe per-seat subscriptions, billed monthly. New organizations
receive a 14-day trial beginning on the first Super Admin login, then 3 grace
days before the organization locks.

> TODO: exact per-seat prices and tier breaks remain unconfirmed.

## UI/UX

- Product UI and ordinary copy use Inter. The DubGrid wordmark and landing or
  marketing headings use DM Sans.
- The interface supports dark and light themes and uses shared semantic design
  tokens across web and mobile.
- Organization-configurable terminology must come from organization settings,
  never hardcoded defaults.
- "Organization" is customer-facing terminology. Code may use `org` or
  `organization`; "workspace" is reserved for the literal `workspace_kind`
  field. Customers say "schedule notes"; code keeps `indicator`.
- Schedule data uses tabular numerals.
- Mobile has native primitives and motion while preserving the same product
  hierarchy and accessibility contract as web.

Main web surfaces:

- public landing, demo request, legal, login, invitation, recovery, and reset
  routes
- the authenticated organization app for Dashboard, Schedule, People, Reports,
  Settings, Profile, Alerts, billing recovery, and onboarding
- a separate internal Gridmaster portal
- Route Handlers under `/api`, including the authenticated mobile API

Main mobile surfaces:

- role-adaptive Home, Schedule, Requests, People, and Profile tabs
- alerts, person and shift detail, dashboard drill-ins, security, MFA, sessions,
  password, calendar, notification, privacy, onboarding, offline, and recovery
  flows
- schedule authoring and publishing, reports, billing, Gridmaster operations,
  Admin permission editing, and organization settings remain web-only

## Deployment

- **Web host:** Vercel. `apps/web/vercel.json` pins the region and the daily
  trial-expiry and sandbox-cleanup jobs.
- **Build and start:** `npm run build` and `npm run start`; the root production
  build targets the Next.js web app.
- **Database:** Supabase-hosted Postgres with an immutable ordered migration
  stream. Migrations `001` through `004` are frozen. The repository is
  checksum-locked through `075`.
- **Production boundary:** migration `075` was recorded as applied to production
  on 2026-09-28. Read the live ledger with `npm run db:migrations:inspect`
  (read-only) before any release rather than relying on this line.
- **Background jobs:** a GitHub Action expires stale requests and invitations
  hourly; Vercel runs trial-expiry and sandbox-cleanup jobs daily. They require
  `CRON_SECRET`.
- **Health:** `GET /api/health`.
- **Feature controls:** Gridmasters create and manage feature flags through the
  platform UI.
- **Native boundary:** the repository contains an Expo application, but the plan
  does not claim signed builds, store distribution, or released native versions.
- **Documentation boundary:** Mintlify publishes `docs/`; public pages are
  verified against source before release. Production, provider, and
  native-release claims require separately dated evidence.

## Open questions

- Exact per-seat billing price points and tier breaks are unconfirmed.
- Deployment domain details are unconfirmed.
- Item 40e cannot complete until both iOS and Android runtime evidence is
  recorded.
- The Privacy Policy promises a self-serve data export that no screen offers.
