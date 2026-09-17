# DubGrid - Project Overview

<!-- blueprint:source-hash 25304129495ef215832d359e5ac6d37218827c9e01fe607de39eeb29b159fca8 -->

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

Everything below is already shipped except item 27.

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
17. **Management-only assignment visibility** - hide schedule-assignment
    controls and their stale schedule-removal notice as soon as a person is no
    longer on the schedule; conversely, hide management-only controls when
    management access is removed. Saved capability state, not a stale form,
    determines the visible editor sections.
18. **Mobile release catch-up** - close release-delta gaps while preserving
    deliberate web-only authoring and organization-settings boundaries.
    - **18a. Mobile role certification eligibility** - expose role credential
      requirements and prevent incompatible new mobile selections before save.
    - **18b. Canonical mobile dashboard model** - share dashboard calculations
      and deliver canonical dashboard data through the authenticated mobile API.
    - **18c. Canonical mobile dashboard experience** - show those facts in
      native, read-only dashboard cards and detail screens.
19. **Authentication and onboarding release hardening** - leave no known
    correctness, performance, resilience, or security defects across the full
    web and mobile entry lifecycle.
    - **19a. Admission and onboarding state correctness** - treat durable
      per-member, per-organization completion as authoritative. A completed
      member must never be returned to onboarding after admission, refresh,
      token rotation, realtime organization changes, role changes, or a new
      session; an incomplete member cannot bypass required gates.
    - **19b. Complete authentication journey coverage** - verify invitation,
      organization entry, sign-in, session restoration, recovery, MFA,
      revocation, onboarding variants, and trial/setup gates for every role on
      web and mobile.
      - **19b1. Invitation and organization entry** - verify invitation
        acceptance, subdomain and organization selection, and signed-out and
        signed-in entry states on web and mobile.
      - **19b2. Sign-in, restoration, expiry, and revocation** - verify
        web/mobile login, session restoration, expired-session recovery,
        logout, and forced or session-specific revocation.
      - **19b3. Password recovery and reset** - verify web recovery links and
        the mobile OTP reset flow, including error and replay states.
      - **19b4. MFA enrollment and challenge** - verify TOTP enrollment,
        verification, unenrollment, required-MFA challenges, and role
        differences across web and mobile.
      - **19b5. Role-based setup, onboarding, and trial gates** - verify every
        role's setup, onboarding, and trial path without duplicating 19a's
        stale-bootstrap admission repair.
    - **19c. Authentication speed and resilience** - measure cold and warm
      entry, remove avoidable serial work and duplicate requests, prevent blank
      states, and verify slow, offline, retry, cross-tab, and token-refresh
      behavior.
      - **19c1. Web authentication entry performance** - measure and improve
        cold and warm login, proxy, session-verification, and organization-
        bootstrap paths without weakening authentication or tenant checks.
      - **19c2. Mobile authentication entry performance** - measure and improve
        cold and warm session restoration and organization bootstrap without
        treating slow restoration as logout.
      - **19c3. Degraded-network authentication recovery** - keep useful
        content or an explicit bounded recovery path visible during slow,
        offline, timeout, and retry states on web and mobile.
      - **19c4. Authentication session continuity under change** - preserve
        current identity, permissions, and tenant data through cross-tab auth,
        token rotation, foreground/resume, and organization switching.
    - **19d. Authentication security hardening** - complete four bounded
      security passes without weakening authentication performance or tenant
      isolation.
      - **19d1. Live tenant, membership, and session authorization** - verify
        stale claims, archived memberships, session revocation, tenant
        isolation, service-role boundaries, sandbox and impersonation
        boundaries, and RLS enforcement across web and mobile APIs.
      - **19d2. MFA assurance and sensitive-action reauthentication** - require
        appropriate AAL2 or fresh-auth proof for MFA changes, credentials,
        sessions, exports, account deletion, and irreversible actions.
      - **19d3. Invite, recovery, redirect, and CSRF integrity** - verify token
        expiry, single use, and replay protection; safe redirects; origin
        validation; generic failures; and public state-changing endpoints.
      - **19d4. Abuse resistance, token secrecy, and security auditability** -
        verify enumeration resistance, distributed and per-target rate limits,
        production fail-closed behavior, token secrecy, and security-event
        audit coverage.
    - **19e. Authentication release qualification** - maintain an automated
      role/state/browser matrix, run authenticated browser and native device
      checks, close confirmed defects, and disclose unavailable evidence.
20. **Explicit schedule-indicator removal** - provide a discoverable,
    accessible removal control for active shift notes/indicators in the shift
    slideover rather than relying only on clicking the selected indicator.
21. **Production display-mode layout resilience** - repair the Settings
    display-mode preview layout so choices remain fully visible, readable, and
    selectable at supported desktop widths and browser zoom levels; render role
    names as plain table text; and make Settings data tables use the Departments
    width as their desktop floor, grow for edit or dense modes, distribute columns
    across the surface, align with page headings, and show complete field values.

22. **Scheduler open-shift staffing** - when a scheduler clicks an open shift in
    the web schedule, show active staff who satisfy its focus-area, role, and
    certification requirements and have no absence or overlapping shift that
    day. Let the scheduler assign a selected person through the normal
    draft/publish workflow, while regular staff keep the existing volunteer flow.

23. **App-wide pill overflow resilience** - keep pill, chip, tag, badge, and
    segmented-choice text within its visual bounds on web and mobile. Display
    values may wrap and grow; interactive controls remain one line and truncate
    safely while retaining the full accessible value.

24. **Inter product typography** - use Inter for all product UI and ordinary
    copy across web and mobile, with Inter Variable optical sizing on web and
    native Inter 400/500/600/700 faces on mobile. Keep DM Sans for the wordmark
    and every landing or marketing title and heading, preserve the existing
    semantic type scale, use tabular numerals for scheduling data, and verify
    fallbacks, layout, browser zoom, and native text scaling.

25. **Web UI consistency and interaction resilience** - audit and repair every
    project-owned web route, component, primitive, and rendered state so
    equivalent elements share one visual and interaction contract and no known
    clipping, overlap, reflow, first-paint, loading, error, empty-state,
    keyboard, focus, or responsive defect remains. Consolidate repeated visual
    primitives, repair the confirmed dashboard and high-zoom layout defects,
    restore the Inter-aware browser audit, and qualify the complete role, theme,
    viewport, zoom, permission, loading, empty, error, and overlay matrix with
    reproducible evidence. Split this epic into bounded sub-features during
    `/feature`. Use `better-ui` for surface depth, concentric radii, optical icon
    alignment, explicit transition properties, theme-switch snapping, and
    hit-area polish. Use `emil-design-eng` for motion purpose and frequency,
    interruptible states, origin-aware popovers, gesture velocity, perceived
    loading speed, and slow-motion or device review. Preserve DubGrid's tokens,
    density, platform-specific mobile motion, and reduced-motion behavior; these
    references guide review and do not authorize a new dependency or wholesale
    visual rewrite.

26. **Mobile UI consistency and interaction resilience** - bring the Expo app
    to one spacing, typography, control-scale, and interaction contract: a
    `display`/`title` type ramp and a 36/44/52 control scale, fill-only badges,
    a redesigned admin dashboard with pressable drill-in rows and purposeful
    motion, request flows that exit on one tap (swap target selection on a
    full-page modal, confirmation for call-off only), a mechanical token
    migration of the schedule and requests screens, and a screenshot-qualified
    role, theme, text-scale, and device matrix. No new dependency; preserve the
    `mobile*` tokens and reduced-motion behavior.

27. **Production migration safety** - the final release gate after all product
    work and hardening: inventory linked production, reconcile migration
    history, rehearse on a production-shaped Supabase branch, apply only
    reviewed forward migrations, and verify health, schema, tenant isolation,
    and ledger state. This item must remain last and does not authorize a
    production mutation.

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
  `admin_permissions` (25-key JSONB, per-person, not department-templated),
  `onboarding_completed_at`, onboarding-tour state
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
  `apps/mobile`, and 11 shared `packages/*`
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

Every organization receives the same product-quality and interaction contract.
Component choice, layout, spacing, typography, responsive behavior,
accessibility, loading/error treatment, and action placement cannot drift by
tenant or data path. Intentional organization content and configuration may
differ, including data, terminology, permissions, branding, and enabled
features.

Dark mode first, light mode as an option. Tailwind v4 with design tokens
in `packages/design-tokens` (avatar tone, elevation, gradients, icon
tone) shared conceptually with a parallel `mobile*` token set (the two
apps don't share component code, only the visual language). Neutral
grays carry a deliberate tint - slate in light mode, zinc in dark mode.
All org-customizable terminology (Wings, Skill Levels, etc.) is read
through the org's terminology config, never hardcoded.

DM Sans is the brand-heading typeface for the wordmark and every landing or
marketing title and heading. Inter is the product typeface for all product UI
and ordinary copy. Web uses Inter Variable with optical sizing; mobile uses
native Inter 400/500/600/700 faces. The existing semantic size hierarchy stays
in place, and schedules, dates, times, durations, and totals use tabular
numerals.

For future web UI consistency work, `better-ui` is a reference for surfaces,
radii, optical alignment, icon state, explicit transitions, and theme-switch
behavior. `emil-design-eng` is a reference for motion purpose, interruptibility,
easing, gesture physics, perceived performance, and reduced-motion review. Both
are review guidance only: preserve DubGrid's tokens, density, platform-specific
motion, and accessibility contracts, and do not add a dependency solely to
satisfy either checklist.

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
- **Final migration gate:** after all product work and authentication release
  qualification, inventory and reconcile linked production, rehearse against a
  production-shaped Supabase branch, then apply only reviewed forward
  migrations and verify health, schema, tenant isolation, and ledger state.
  The tracked plan grants no authority to mutate production.

> TODO: env vars by name, health check path, and domain notes. Run
> `/release vercel` for a real readiness pass instead of guessing here.

## Open questions

- The project plan says there are 10 shared packages but names 11; the
  repository currently contains 11.
- Exact per-seat billing price points / tier breaks are unconfirmed.
- Deployment env vars, health check path, and domain notes are unconfirmed.
