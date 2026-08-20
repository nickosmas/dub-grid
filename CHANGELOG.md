# Changelog

All notable changes to DubGrid are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Mobile terms-acceptance gate** — `CURRENT_TERMS_VERSION` moved to `@dubgrid/domain` so both apps gate on one constant; the mobile bootstrap payload carries `acceptedCurrentTerms` (defaulting to `true` so a stale server can't lock anyone out) and `TermsGate` blocks the authed app until it's accepted via `POST /api/mobile/v1/profile/terms`. Web enforces this by redirecting to `/accept-terms` at login, which the mobile sign-in path never hit — a mobile-only user was never re-prompted when the terms version changed.
- **Mobile error boundaries and unmatched-route screen** — `app/_layout.tsx` and `app/(tabs)/_layout.tsx` export an Expo Router `ErrorBoundary`, and `app/+not-found.tsx` handles stale deep links; both render the new `RouteErrorScreen`. A render throw previously took the whole app down with no way back, and an unknown route fell through to Expo's developer-facing "Unmatched Route" screen.
- **Mobile spacing and radius ramps** — `mobileSpacingTokens` (4-48) and `mobileRadiusTokens` in `@dubgrid/design-tokens`, surfaced as `mobileSpace` / `mobileRadius`. The web ramps are `"px"` strings React Native can't consume, so mobile screens had no scale to reach for.

### Security

- **Supabase API keys migrated to publishable/secret** — the legacy `anon` / `service_role` JWTs both derived from one JWT secret, so neither could be rotated without the other. The new `sb_publishable_…` / `sb_secret_…` keys are revocable individually, and production, CI and any local admin use now hold separate secret keys. Env vars renamed to match (`SUPABASE_SECRET_KEY`, `*_PUBLISHABLE_KEY`); reads go through `apps/web/src/lib/supabase-keys` rather than sixteen scattered `process.env` lookups.
- **All 28 npm advisories cleared, including two criticals.** Most were caused by _stale_ `overrides` pins that had themselves fallen into the vulnerable ranges (axios 1.17.0, postcss 8.5.12, dompurify 3.4.11, tar, hono). `next` 16.2.10 -> 16.3.0 alone cleared nine Next.js advisories including three highs.
- **Supply-chain scanner IOCs corrected** — `flat-cache@6.1.24` was missing from the denylist entirely (it is a transitive dependency of eslint, so it reaches far more trees than the cache packages that were listed) and `@cacheable/node-cache` was pinned to a version that could never match. Added host-persistence detection, since the payload's launch agent lives under `$HOME` where scanning a checkout would never find it.
- **Removed six root-level `check_*.mjs` scripts and `deploy_migration.mjs`** — each embedded the production project's anon key, and the migration they referenced (`026_draft_schedules.sql`) has not existed since the schema was consolidated to four files.

### Fixed

- **The theme no longer flips when you sign in** — the light/dark/system preference lived in per-origin storage, so the marketing site and an org subdomain each remembered their own; starting on a light landing page and signing in with a dark OS switched you to dark mid-flow. It now travels in a root-domain `dg-theme` cookie, with a `?theme=` param covering the three login links that hop between hosts (browsers accept `domain=localhost` but then refuse to send the cookie to `sub.localhost`, so the cookie alone cannot work in local development). A blocking script adopts it ahead of next-themes' own, so the right theme lands on the first paint rather than flashing. `dg-theme` is a new essential cookie, so `CONSENT_VERSION` goes 1.1 -> 1.2 on web and mobile and every user is re-prompted once.
- **The landing-page theme toggle can get back to "System"** — it was a two-state light/dark switch, so anyone who touched it was stranded on an explicit preference with no way to follow their device again. It now cycles light -> dark -> system.
- **`npm run email:build` no longer leaves a phantom diff** — react-email's own pretty-printer uses a different style than the repo's Prettier config, so every regeneration rewrote all six Supabase auth templates with ~750 lines of formatting-only churn that looked like real work. The script now runs `prettier --write` over its output, and regenerating from a clean checkout produces no diff at all.
- **Mobile: a push tap that cold-starts the app no longer loses its destination** — `usePushResponseHandler` now also reads `getLastNotificationResponseAsync()`, which is how a tap that launches a killed app is delivered; the response listener alone only fires while the app is already running.
- **Mobile: signing out no longer leaves the device receiving the previous user's pushes** — `disablePushForCurrentDevice` revokes the Expo token before the session drops, and now runs on every sign-out path (including "Sign out all devices" and the post-password-change global sign-out), not just the Profile screen's.
- **Mobile: a slow cold-start refresh no longer reads as a silent logout** — the session-restore deadline went 4s → 12s, matching the web `AuthProvider` budget raised for the same reason (`AUTH_EDGE_CASES.md` A3).
- **Mobile: switching organizations no longer flashes the previous org's data** — the org switch now clears the query cache and resets to Home rather than marking queries stale, which kept rendering the old tenant's people and schedule until each refetch landed.
- **Mobile: a hung network probe can no longer strand the app on the splash** — `NetworkStateProvider` renders nothing until its first `expo-network` probe resolves and had no timeout; it now assumes online after 2s.
- **Mobile: returning to the foreground no longer triggers a burst of refetches** — added a 30s default `staleTime` and removed the redundant AppState listener in `useTabsGate` (which also re-subscribed on every render because it depended on the whole query object).
- **Mobile: form fields and submit buttons are reachable with the keyboard up** — `Screen` sets `automaticallyAdjustKeyboardInsets`, and `ConfirmationModal` / `BottomSheetModal` wrap in `KeyboardAvoidingView`. `BottomSheetModal` also uses live window dimensions and the real bottom safe-area inset instead of a module-scope `Dimensions` snapshot and a hardcoded per-platform pad.
- **Mobile: the admin home no longer renders a blank screen** when the dashboard query resolves empty; `AddPersonScreen` shows a skeleton instead of an empty picker beside a live validation error; the privacy screen's analytics switch no longer flashes off-then-on and surfaces save failures instead of swallowing them.
- **Mobile accessibility** — the Android tab bar reports `role="tab"` and an explicit `selected: false` (an empty state object announced nothing for unselected tabs); calendar day cells announce "Select Today, Apr 16" rather than a raw ISO date; `ProfileTextInput` falls back to its visible label; recovery codes use a real monospace face on iOS.
- **Mobile: the web tab layout no longer forks the auth gate** — `_layout.web.tsx` calls `useTabsGate` instead of re-deriving tab visibility inline (the two copies had already drifted, and the web one never mounted the push hooks).
- **Mobile: legal links follow the configured API host** instead of hardcoding `app.dubgrid.com`.
- **Mobile: an open shift's time range is consistent across tabs** — the Schedule and Requests tabs each carried a private copy of the open-shift presentation accessors, and they had drifted: only the Requests copy fell back to the shift's custom times, so the same open shift showed a time range on one tab and nothing on the other. Both now share `features/schedule/lib/openShiftPresentation.ts`.
- **Mobile: declining updated terms is possible** — the terms sheet covers the entire app, so it now offers Sign out alongside Accept; previously a user who would not accept had no way out of the app at all.
- **Mobile: the Requests tab pills meet the 44pt touch minimum** via `hitSlop`, and the alert detail screen supports pull-to-refresh and shows a skeleton instead of bare "Loading…" text.

### Changed

- **Shared-package consolidation** — `formatHoursValue` existed three times with two incompatible meanings (minutes→number in `schedule-core`, hours→string in both apps) and both were reachable inside `ScheduleScreen`; split into `toHoursValue` and `formatHoursLabel` in `schedule-core`. Time math (`getMinutesSinceMidnight`, `expandTimeRange`, entry-started predicates) now comes from `schedule-core` instead of per-file copies. Org-role labels, employment-status predicates, the hero-gradient palette, the job/role chip tone (whose mentor branch rendered differently on the schedule and requests screens), and toast tones all moved into `@dubgrid/domain` / `@dubgrid/design-tokens`.
- **Mobile dead code removed** — `@sentry/nextjs`, `@vercel/analytics`, and `next-intl` (wrong-platform, zero imports), the unread `saveSession`/`loadSession` pair, an unreferenced `meHeroCardMuted` style, and the unused `@dubgrid/contracts/mobile` export subpath.

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
  - **Schema:** `notifications` gained `priority` (low/normal/high/critical) and `archived_at`; grouping/action-link/action-label data is carried in the existing JSONB `metadata` field (`metadata.groupCount`, `metadata.actionUrl`, `metadata.actionLabel`) rather than as dedicated columns. Search is a plain `ilike` query, not a `pg_trgm` index.
  - **RPCs:** only `get_notification_facets` is a new/rewritten RPC. `get_notifications` is unchanged (still basic limit/offset, no filters/search) and is used only by the bell dropdown; the inbox's keyset pagination, filters, and ILIKE search are implemented as a direct Supabase table query in `/api/notifications/search`, not an RPC. Bulk read/unread/archive/unarchive are raw Supabase table updates in `/api/notifications/bulk`, not dedicated RPCs. There is no hard-delete (`delete_notifications`) capability.
  - **Web:** the inbox page lives at `/alerts` (`AlertsInboxPage.tsx`), not `/notifications`, with sidebar facets, search, sort toggle, bulk-select, and grouped-row badges; bell dropdown caps to 10 items with a "View all" link; bell subscribes to `postgres_changes` via Realtime and falls back to a 60s poll only on `CHANNEL_ERROR`/`TIMED_OUT`.
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
