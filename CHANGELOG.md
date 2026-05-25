# Changelog

All notable changes to DubGrid are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Trial activation + welcome flow** — 14-day trial clock starts on the first super_admin login via the idempotent `start_trial_for_org` RPC; `/api/auth/start-trial` calls it after a successful login; `/api/trial-welcome` sends a welcome email via Resend and controls whether the welcome modal is shown; `trial_started_at` records the activation timestamp; `trial_pending` billing state gates non-super-admins from accessing the app before the trial is active.
- **Org soft-delete (Danger Zone) and archived_at access revocation** — super_admins can delete their own organization from Settings → Danger Zone; `/api/organizations/delete` marks the org archived, cancels the Stripe subscription, and writes an audit entry; `archived_at` now revokes access in middleware, `get_my_organizations`, the JWT hook, and `switch_org`; deletions are reversible by a gridmaster.
- **Post-login soft nav, AuthSplash, and resilient logout** — login redirects via soft `router.replace("/dashboard")` rather than `window.location`; `markAuthTransition()` flag plus the `<AuthSplash>` bridge prevent `ProtectedRoute` from bouncing to `/login` during the auth-settle gap; logout always redirects to `/login` in a `finally` block with no splash.
- **Self-action and admin tier guards** — users cannot demote, bench, terminate, or remove their own account (enforced at RPC, API, UI, and mobile layers); admins cannot modify admin/super_admin/gridmaster roles or assign privileged roles; `isSelfAction` and `assertNotSelf` helpers live in `@dubgrid/domain`.
- **Per-session org isolation** — `user_sessions.active_org_id` drives JWT claims per session; `switch_org` only affects the calling device; `profiles.org_id` is now only the default for new sign-ins.
- **Gridmaster org-lifecycle notifications** — gridmaster portal surfaces org-lifecycle events (trial expiry, suspension, archival) as in-app notifications routed to gridmaster accounts.
- **OnboardingGate** — role-aware inline onboarding gate; replaces the old 8-step wizard and the standalone `/setup` route; components live in `apps/web/src/features/onboarding/` and `components/onboarding/`; includes `OnboardingGate`, `OnboardingWizard`, `WizardShell`, per-role step lists, and a post-onboarding `PersonaLandingCard` dashboard card; PostHog telemetry tracks step completion.
- **Per-recipient email rate limiting** — `emailTargetLimiter` (5 emails/hr per recipient address) applied to all email-sending routes, preventing abuse of transactional email via repeated API calls.
- **CSRF origin guards and HttpOnly sandbox cookie** — `validateCsrfOrigin` enforces the `Origin` header on all mutation endpoints; the test sandbox session uses an HttpOnly cookie to prevent JavaScript-based sandbox-to-production privilege escalation.
- **react-email rebrand** — all transactional emails (invite, trial welcome, notification, impersonation notice, demo request) migrated to react-email components in `apps/web/src/emails/`; `npm run email:build` (web workspace) regenerates `supabase/templates/*.html`.
- **Dependency security pins** — `protobufjs` pinned to 7.5.9 (CVE fix via `@opentelemetry/otlp-transformer` override); `fast-uri` pinned to `^3.1.2` (CVE fix via `ajv` override); `react`/`react-dom` pinned to 19.2.3 across the monorepo to deduplicate a single copy.
- **Stripe replay idempotency** — webhook handler and checkout-complete route use Stripe's idempotency keys to prevent duplicate subscription state on replayed events.
- **Route boundaries** — every segment `error.tsx` delegates to `<ErrorBoundary>` and `not-found.tsx` delegates to `<NotFoundBoundary>` from `components/RouteBoundary.tsx`; no segment re-renders the chrome on error.
- **Notification inbox overhaul (web + mobile)** — promoted notifications from a 360px bell dropdown to a full inbox surface with search, filter, sort, pagination, archive, bulk actions, and per-row CTAs.
  - **Schema:** `notifications` gained `priority` (low/normal/high/critical), `archived_at`, `group_key`, `action_url`, `action_label`; new `pg_trgm` GIN index on `(title || ' ' || message)`, partial index for the active inbox view, and `notifications` added to the `supabase_realtime` publication.
  - **RPCs:** `get_notifications` rewritten with keyset pagination + filters (category/type/priority/read) + ILIKE search + group-window counts; new `get_notification_facets`, `mark_notifications_read/unread`, `archive_notifications`, `unarchive_notifications`, `delete_notifications`; users can soft-delete their own notifications.
  - **Web:** dedicated `/notifications` page with sidebar facets, search, sort toggle, bulk-select, and grouped-row badges; bell dropdown caps to 10 items with a "View all" link; bell subscribes to `postgres_changes` via Realtime and falls back to a 60s poll only on `CHANNEL_ERROR`/`TIMED_OUT`.
  - **Mobile:** `NotificationsScreen` rewritten as an inbox with filter chips, debounced search, infinite scroll via `useInfiniteQuery`, and per-row archive toggles; new `NotificationDetailScreen` at `/alerts/[id]`; `usePushResponseHandler` registers `setNotificationHandler` (banner + sound, no badge override), invalidates the inbox query on push, and deep-links taps to the detail screen.
  - **API:** `/api/notifications` serves GET (cursor + filters + facets), PATCH (single + bulk read/unread/archive/unarchive); `/api/mobile/v1/notifications/actions` exposes the same bulk verbs to mobile.
- **Monorepo refactor** — split the single-app codebase into npm workspaces orchestrated by Turborepo:
  - `apps/web` (`@dubgrid/web`) — Next.js 16 web app; everything moved from repo-root `src/` to `apps/web/src/`, `middleware.ts` to `apps/web/middleware.ts`, `next.config.ts` to `apps/web/next.config.ts`.
  - `apps/mobile` (`@dubgrid/mobile`) — new Expo SDK 54 / React Native app (Expo Router).
  - 10 platform-neutral `packages/*` workspaces: `api-client`, `authz`, `client-errors`, `contracts`, `data-access`, `db-types`, `design-tokens`, `domain`, `mobile-api-core`, `schedule-core`.
- **Mobile app and versioned API** — new Expo mobile client communicating exclusively with `/api/mobile/v1/*`; framework-neutral orchestration lives in `@dubgrid/mobile-api-core`.
- **Server-API data access** — browser no longer touches Supabase data tables directly; all data access goes through Route Handlers; each web feature is organized as `features/<feature>/{client,server,shared}`.
- **Test sandbox** — clone an org's config into an isolated `workspace_kind='sandbox'` org with a 30-day TTL; new `features/test-sandbox/` + `/api/test-sandbox/` (CSRF + rate-limited); sandboxes are excluded from mobile login.
- Shared form primitives (`CountrySelect`, `UsStateSelect`, `EmailInput`, `PhoneInput`, `PostalCodeInput`) plus US-state and timezone helper libraries.
- Realtime cache invalidation via CDC on config tables (`useRealtimeInvalidation` hook).
- `StaleDataBanner` component warns when the Realtime connection is lost or data is stale (60s threshold).
- Comprehensive audit logging on all schedule-definition config mutations (jobs, shift codes, employees, departments, coverage).
- Gridmaster: force logout endpoint, audit log entries for `viewed_all_users`.
- Schema: `organizations` sandbox columns (`workspace_kind`, `sandbox_source_org_id`, `sandbox_owner_user_id`, `sandbox_expires_at`, `sandbox_template_version`); `organization_memberships.landing_card_dismissed_at` and `onboarding_step_telemetry`; `shift_categories` partial unique indexes on `upper(abbr)` (global + per-focus-area); `dismiss_landing_card()` function.
- Org-scoped constraint on the `notifications` table.

### Changed
- **Supabase auth rate limits raised** — `sign_in_sign_ups` 30 to 200 per 5min per IP, `token_refresh` 150 to 1000 per 5min per IP (required because login/refresh runs server-side through shared Vercel egress IPs); updated in `supabase/config.toml` for local dev. **Production deploy requires manually updating Supabase Dashboard → Authentication → Rate Limits to match.**
- Admin permissions expanded to **25** (from 24): added `canEditScheduleIndicators`, `canViewScheduleDefinitions`, `canManageScheduleDefinitions`; `schedule_notes` RLS now gates on `canEditScheduleIndicators`.
- `complete_onboarding` is now idempotent; `change_user_role` hard-blocks self-role-change (raises `P0001`); `get_my_organizations` returns `workspace_kind` and filters archived memberships.
- `/staff` route renamed to `/people` (`apps/web/src/app/people/`); settings sub-route is `/settings/staff-config`.
- Old 8-step onboarding wizard and standalone `/setup` route removed; onboarding now renders inline via `OnboardingGate`.
- The single `src/lib/db.ts` data layer replaced by the `apps/web/src/lib/db/` barrel over domain modules.
- `usePermissions` channel naming changed from random ID to deterministic (uid-based).
- All UPDATE queries in the data layer include an `org_id` WHERE clause.
- Per-person permissions model confirmed: a member's permissions are stored as `admin_permissions` JSONB on `organization_memberships` (set per-person on the People page); departments do not grant permissions.

### Security
- `org_id` safety clauses on all UPDATE queries prevent cross-org mutations.
- Self-role-change is hard-blocked at the database (`change_user_role` raises `P0001`).
- Custom time format validation prevents malformed schedule data.
- CSRF origin validation enforced on all mutation endpoints.
- Sandbox-to-production privilege escalation prevented via `forbidIfSandboxCookie` guard on destructive org mutations.
- Self-action and admin tier guards enforced at RPC, API, UI, and mobile layers.

---

## [0.1.0] — 2026-04-05

### Added
- Department hierarchy: two-type model (scheduled + management)
  - Scheduled departments contain focus areas as children
  - Management departments for non-schedule staff (HR, admin)
  - Department permission templates (JSONB) on management departments
  - Permission union: department permissions merged with direct user permissions
- People Hub: unified directory of employees, app-only users, and pending invitations
- 24 granular admin permissions (expanded from 16) with view/manage pattern
- Onboarding wizard upgrades and gridmaster portal improvements
- Session tracking (user_sessions table, track-session API route)
- Direct permission assignment for user-role members via department membership
- GDPR data export and account deletion endpoints
- Calendar export (iCalendar .ics format)
- Schedule export (PDF/CSV)
- Shift request approvals audit table
- Feature flags editor (per-org overrides)
- Organization suspension with middleware enforcement (Redis-cached)
- Publish history with JSONB change tracking

### Security
- org_id safety clauses on all UPDATE queries prevent cross-org mutations
- Schedule-cell `org_id` changed from nullable to NOT NULL
- Custom time format validation prevents malformed schedule data

---

## [0.0.1] — 2026-03-01

### Added
- Initial release: multi-tenant scheduling platform
- Four-tier RBAC (Gridmaster > Super Admin > Admin > User)
- Schedule grid with 1-week, 2-week, and month views
- Draft/publish workflow with optimistic locking
- Recurring shifts and shift series
- Real-time collaboration (cell locks, presence, live sync)
- Dashboard analytics with expandable detail views
- Staff management with full employee lifecycle
- Staff detail pages (Overview, Schedule, Activity, Reports)
- Coverage requirements and status visualization
- Shift requests (pickup, swap, calloff) with approval workflow
- Gridmaster portal (org management, impersonation, audit logs)
- Invite-only registration with 72-hour tokens
- Password reset and email verification flows
- Print export with configurable layout
- Subdomain-based multi-tenancy
- Edge middleware for JWT verification and RBAC
- Row-Level Security on all tables
