# Changelog

All notable changes to DubGrid are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Notification inbox overhaul (web + mobile)** — promoted notifications from a 360px bell dropdown to a full inbox surface with search, filter, sort, pagination, archive, bulk actions, and per-row CTAs.
  - **Schema:** `notifications` gained `priority` (low/normal/high/critical), `archived_at`, `group_key`, `action_url`, `action_label`. New `pg_trgm` GIN index on `(title || ' ' || message)`, partial index for the active inbox view, and `notifications` is now in the `supabase_realtime` publication.
  - **RPCs:** `get_notifications` rewritten with keyset pagination + filters (category/type/priority/read) + ILIKE search + group-window counts; new `get_notification_facets`, `mark_notifications_read/unread`, `archive_notifications`, `unarchive_notifications`, `delete_notifications`. Users can now soft-delete their own notifications.
  - **Web:** dedicated `/notifications` page (`apps/web/src/app/notifications/`) with sidebar facets, search, sort toggle, bulk-select + Mark read/unread/Archive/Delete, and grouped-row badges. Bell dropdown caps to 10 items with a "View all" link. The bell now subscribes to `postgres_changes` on `notifications` (Realtime) and falls back to a 60s poll only when the channel reports `CHANNEL_ERROR`/`TIMED_OUT`.
  - **Mobile:** rewrote `NotificationsScreen` as an inbox with filter chips (All/Unread/Schedule/Requests/System/Archived), debounced search, infinite scroll via `useInfiniteQuery`, and per-row archive toggles. New `NotificationDetailScreen` at `/alerts/[id]` and `ProfileNotificationsScreen` (Profile → Notifications) wiring the existing `notification_preferences` API. New `usePushResponseHandler` registers `setNotificationHandler` (banner + sound, no badge override), invalidates the inbox query on incoming pushes, and deep-links taps to the notification's detail screen.
  - **API surface:** `/api/notifications` now serves GET (cursor + filters + facets), PATCH (single + bulk read/unread/archive/unarchive), and DELETE; new `/api/mobile/v1/notifications/actions` exposes the same bulk verbs to mobile.
- **Monorepo refactor** — split the single-app codebase into npm workspaces orchestrated by Turborepo:
  - `apps/web` (`@dubgrid/web`) — the Next.js 16 web app; everything moved from repo-root `src/` to `apps/web/src/`, `middleware.ts` → `apps/web/middleware.ts`, `next.config.ts` → `apps/web/next.config.ts`
  - `apps/mobile` (`@dubgrid/mobile`) — new Expo SDK 54 / React Native app (Expo Router)
  - 9 platform-neutral `packages/*` workspaces: `api-client`, `authz`, `contracts`, `data-access`, `db-types`, `design-tokens`, `domain`, `mobile-api-core`, `schedule-core`
- **Mobile app + API** — new Expo mobile client talking exclusively to a versioned `/api/mobile/v1/*` API surface on the web app; framework-neutral orchestration lives in `@dubgrid/mobile-api-core`
- **Server-API data access** — UI data access moved behind the app's own Route Handlers; each web feature is organized as `features/<feature>/{client,server,shared}` and the browser no longer touches Supabase data tables directly
- **Test sandbox** — clone an org's config into an isolated `workspace_kind='sandbox'` org with a 30-day TTL; new `features/test-sandbox/` + `app/api/test-sandbox/` (CSRF + rate-limited); sandboxes are excluded from mobile login
- Role-aware onboarding wizard rewrite — `components/onboarding/` with `OnboardingGate`, `OnboardingWizard`, `WizardShell`, and per-role step lists; post-onboarding `PersonaLandingCard` dashboard card; PostHog onboarding telemetry
- Shared form primitives — `components/forms/` (`CountrySelect`, `UsStateSelect`, `EmailInput`, `PhoneInput`, `PostalCodeInput`) plus US-state / timezone helper libs
- Realtime cache invalidation via CDC on config tables (useRealtimeInvalidation hook)
- StaleDataBanner component for connection loss / stale data warnings
- Comprehensive audit logging on all schedule-definition config mutations (jobs, shift codes, employees, departments, coverage)
- Gridmaster: force logout, audit log for viewed_all_users
- Schema: `organizations` sandbox/workspace columns (`workspace_kind`, `sandbox_source_org_id`, `sandbox_owner_user_id`, `sandbox_expires_at`, `sandbox_template_version`); `organization_memberships.landing_card_dismissed_at` and `onboarding_step_telemetry`; `shift_categories` partial unique indexes on `upper(abbr)` (global + per-focus-area); `dismiss_landing_card()` function
- Org-scoped constraint on notifications table

### Changed
- **Rate limits relaxed for legitimate bursty workflows** — `apiLimiter` raised from 10 to **30 req/10s per user** (covers bulk membership edits, back-to-back settings saves, mobile retry storms); `inviteLimiter` raised from 100/h per user to **200/h per org** and re-keyed by `invite:${orgId}` in `send-invite-email` so all super-admins in an org share one bucket during go-live onboarding. Per-account brute-force defense (`loginLimiter` 15/15m per email hash) unchanged.
- **Supabase auth rate limits raised** — `sign_in_sign_ups` 30 → **200 per 5min per IP**, `token_refresh` 150 → **1000 per 5min per IP**. Required because login/refresh runs server-side through Vercel egress IPs (Supabase sees only a few shared IPs, so the per-IP cap was effectively a global tenant-wide cap). Updated in `supabase/config.toml` for local dev. **⚠️ Production deploy requires manually updating the Supabase Dashboard → Authentication → Rate Limits to match: `Sign in / Sign up` = 200, `Token refresh` = 1000.**
- Admin permissions expanded to **25** (from 24) — added `canEditScheduleIndicators`, `canViewScheduleDefinitions`, `canManageScheduleDefinitions`; `schedule_notes` RLS now gates on `canEditScheduleIndicators`
- `complete_onboarding` is now idempotent; `change_user_role` hard-blocks self-role-change (raises P0001); `get_my_organizations` returns `workspace_kind` and filters archived memberships
- `/staff` route renamed to `/people` (`apps/web/src/app/people/`); the settings sub-route is `/settings/staff-config`
- Old 8-step onboarding wizard and the standalone `/setup` route removed — onboarding now renders inline via `OnboardingGate`
- The single `src/lib/db.ts` data layer replaced by the `apps/web/src/lib/db/` barrel over domain modules
- usePermissions channel naming changed from random ID to deterministic (uid-based)
- All UPDATE queries in the data layer now include an `org_id` WHERE clause for safety

### Security
- `org_id` safety clauses on all UPDATE queries prevent cross-org mutations
- Self-role-change is hard-blocked at the database (`change_user_role` raises P0001)
- Custom time format validation prevents malformed schedule data

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
