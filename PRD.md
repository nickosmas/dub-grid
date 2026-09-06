# DubGrid

## Multi-Tenant Employee Scheduling Platform

### Product Requirements Document · v4.0

---

|                     |                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Document Status** | Living Document — Reflects Current Implementation                                   |
| **Version**         | 4.0                                                                                 |
| **Prepared For**    | Development Team                                                                    |
| **Date**            | May 2026                                                                            |
| **Scope**           | DubGrid — multi-tenant staff scheduling platform (web + mobile) for care facilities |

---

## 1. Executive Summary

Care facilities typically manage employee scheduling across multiple wings or departments, often using manually maintained spreadsheets — horizontal grids covering dozens of employees across multiple shift types and sections.

DubGrid is a multi-tenant scheduling platform that replaces spreadsheet-based scheduling. Each tenant (organization) can configure its own focus areas (wings/sections), shifts, jobs, staff roster, and scheduling conventions. The application delivers a modern, polished user experience with real-time collaboration, draft/publish workflows, and a comprehensive role-based access control system.

DubGrid ships as a **monorepo** with two product surfaces — a Next.js web application (`apps/web`) and an Expo / React Native mobile application (`apps/mobile`) — sharing platform-neutral logic through a set of internal `packages/*`. The platform integrates with a number of third-party services for billing, email, analytics, error monitoring, caching, and push notifications.

---

## 2. Technology Stack

### 2.1 Monorepo

DubGrid is an **npm workspaces** monorepo orchestrated by **Turborepo** (Node 22.13, npm 10.9.2):

| Workspace                  | Package                    | Description                                                                                        |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`                 | `@dubgrid/web`             | Next.js 16 App Router web application                                                              |
| `apps/mobile`              | `@dubgrid/mobile`          | Expo SDK 54 / React Native mobile application (Expo Router)                                        |
| `packages/domain`          | `@dubgrid/domain`          | Platform-neutral domain types, enums, and pure logic (RBAC, billing, requests, self-action guards) |
| `packages/contracts`       | `@dubgrid/contracts`       | Zod schemas + inferred types for cross-app API contracts                                           |
| `packages/db-types`        | `@dubgrid/db-types`        | Database-row TypeScript types                                                                      |
| `packages/authz`           | `@dubgrid/authz`           | Permission logic — role levels, view implications, JWT claim extraction                            |
| `packages/schedule-core`   | `@dubgrid/schedule-core`   | Schedule transformation and calculation logic                                                      |
| `packages/data-access`     | `@dubgrid/data-access`     | Supabase query + data mapping; shared mobile data layer                                            |
| `packages/mobile-api-core` | `@dubgrid/mobile-api-core` | Framework-neutral mobile backend orchestration consumed by web's `/api/mobile/v1` routes           |
| `packages/api-client`      | `@dubgrid/api-client`      | Platform-neutral HTTP client primitives                                                            |
| `packages/client-errors`   | `@dubgrid/client-errors`   | Shared client-facing error translation (friendly copy + fallbacks) for web and mobile              |
| `packages/design-tokens`   | `@dubgrid/design-tokens`   | Shared design values                                                                               |

All ten packages are private `0.1.0`, ESM, and build via `tsc` to `dist/`. `apps/web` consumes authz, client-errors, contracts, data-access, db-types, design-tokens, domain, and mobile-api-core. `apps/mobile` consumes api-client, client-errors, contracts, design-tokens, and schedule-core.

### 2.2 Web Application (`apps/web`)

| Layer         | Technology                                        |
| ------------- | ------------------------------------------------- |
| Framework     | Next.js 16, React 19, TypeScript                  |
| Styling       | Tailwind CSS v4                                   |
| Database      | Supabase (PostgreSQL + Auth + Realtime + RLS)     |
| Auth          | Supabase Auth with custom JWT claims              |
| SSR           | @supabase/ssr v0.9 for cookie-based SSR sessions  |
| State/Cache   | TanStack React Query v5                           |
| Drag & Drop   | @dnd-kit/core for schedule grid interactions      |
| JWT           | jose v6 for JWT verification in middleware        |
| Validation    | Zod for schema validation                         |
| Notifications | Sonner v2 (toast notifications)                   |
| Testing       | Vitest + Testing Library (unit), Playwright (E2E) |
| Deployment    | Vercel                                            |

### 2.3 Mobile Application (`apps/mobile`)

| Layer     | Technology                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Framework | Expo SDK 54, React Native                                                         |
| Routing   | Expo Router                                                                       |
| Backend   | Talks only to `apps/web` `/api/mobile/v1/*` (base URL `EXPO_PUBLIC_API_BASE_URL`) |
| HTTP      | `@dubgrid/api-client` primitives — 15s timeout, bearer auth, Zod response parsing |
| Push      | Expo push notifications                                                           |

### 2.4 Third-Party Integrations

DubGrid integrates with the following external services:

| Service          | Purpose                                    |
| ---------------- | ------------------------------------------ |
| Stripe           | Billing and subscription management        |
| Resend           | Transactional and invitation email         |
| PostHog          | Product analytics and onboarding telemetry |
| Sentry           | Error monitoring                           |
| Upstash Redis    | Caching and rate limiting                  |
| Vercel Analytics | Web analytics                              |
| Expo Push        | Mobile push notifications                  |

---

## 3. Background & Current State

### 3.1 Problem Statement

Many care facilities manage employee scheduling through manually maintained spreadsheets. These typically follow a common structure:

- A two-week date range displayed horizontally (Sunday through Saturday, two consecutive weeks)
- Staff listed vertically on the left with their name and designation code
- Each cell contains a worked assignment, an absence, or is blank
- The schedule is divided into labeled sections (wings/departments), each with its own staff rows and count rows
- Some staff members appear in multiple sections due to cross-department assignments
- A printed version includes the print date, date range, and a legend

### 3.2 Multi-Tenant Architecture

DubGrid supports multiple organizations via subdomain-based routing, each with their own configurable structure:

- **Organizations** — Each tenant is an independent organization with its own data, staff, settings, and subdomain (e.g., `acme.dubgrid.com`). The `organizations.workspace_kind` column flags an org as `real` or `sandbox` (the sole place "workspace" survives in code; see §7.6, FR-67).
- **Departments** — A two-type model: `scheduled` departments group focus areas, while `management` departments group operations staff. Focus areas are children of departments. (Departments do not grant permissions; permissions are per-person.)
- **Focus Areas** — Each organization defines its own schedule sections (e.g., nursing wings, departments, shift groups). The label "Focus Areas" is customizable per org.
- **Schedule Definitions** — Organizations configure shifts and jobs, with derived labels, colors, and timing metadata used throughout the schedule
- **Shift Categories** — Tally buckets with optional time windows for grouping shift counts
- **Staff Roster** — Each organization maintains its own employee roster with designations, certifications, roles, and focus area assignments
- **Certifications** — Customizable skill levels per organization (label is configurable)
- **Organization Roles** — Custom display roles per organization (label is configurable)
- **Coverage Requirements** — Minimum staffing rules per focus area, preferred shift/job, and day of week

### 3.3 Customizable Terminology

Organizations can customize the following labels in their settings:

| Default Term   | DB Field                            | Purpose                   |
| -------------- | ----------------------------------- | ------------------------- |
| Focus Areas    | `organizations.focus_area_label`    | Schedule sections / wings |
| Certifications | `organizations.certification_label` | Staff skill levels        |
| Roles          | `organizations.role_label`          | Staff display roles       |

---

## 4. Users & Roles

### 4.1 Role Hierarchy

DubGrid implements a four-tier RBAC system with JWT-based claims enforced at both the edge middleware and database (RLS) levels.

| Tier | Role        | Scope    | Who                     | Capabilities                                                                                |
| ---- | ----------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| 4    | Gridmaster  | Platform | Platform owner          | Global god mode — all orgs, all data, impersonation, user management, audit logs            |
| 3    | Super Admin | Org      | Org owner               | Full org access — all settings, user management, permission configuration, schedule publish |
| 2    | Admin       | Org      | Org operations staff    | Configurable permissions — granular access set per-user by super admin                      |
| 0    | User        | Org      | Staff / read-only users | View schedule and staff only (canViewSchedule + canViewStaff always true)                   |

### 4.2 Admin Permissions (Granular, per-user)

Admins receive a configurable set of permissions stored as JSONB in `organization_memberships.admin_permissions`. The `AdminPermissions` interface (defined in `@dubgrid/domain`) has **26 permissions**. `canViewSchedule` and `canViewStaff` are **always true** for any authenticated user regardless of role. Everything else follows a role baseline that a stored set overrides key by key: users start from all `false`; admins start from the core scheduling set (edit and publish the schedule, notes and indicators, recurring shifts, reports) with no people management or administration, so an unconfigured admin can schedule but cannot manage people. Every `canManage*` permission implies its matching `canView*` (view implications applied by `@dubgrid/authz`).

| #   | Category  | Permission                      | Delegatable | Description                                                                |
| --- | --------- | ------------------------------- | ----------- | -------------------------------------------------------------------------- |
| 1   | Schedule  | `canViewSchedule`               | Always on   | View the schedule grid (always true for all users)                         |
| 2   | Schedule  | `canEditShifts`                 | Yes         | Create, edit, delete schedule cell entries                                 |
| 3   | Schedule  | `canPublishSchedule`            | Yes         | Publish draft changes                                                      |
| 4   | Schedule  | `canApplyRecurringSchedule`     | Yes         | Apply recurring shift templates to a date range                            |
| 5   | Notes     | `canEditNotes`                  | Yes         | Manage schedule notes                                                      |
| 6   | Notes     | `canEditScheduleIndicators`     | Yes         | Manage schedule indicators (gates `schedule_notes` write RLS)              |
| 7   | Recurring | `canViewRecurringShifts`        | Yes         | View recurring shift templates                                             |
| 8   | Recurring | `canManageRecurringShifts`      | Yes         | Configure recurring shift templates                                        |
| 9   | Recurring | `canManageShiftSeries`          | Yes         | Manage repeating shift series                                              |
| 10  | Staff     | `canViewStaff`                  | Always on   | View staff roster (always true for all users)                              |
| 11  | Staff     | `canViewEmployeeDetails`        | Yes         | View individual employee detail records                                    |
| 12  | Staff     | `canManageEmployees`            | Yes         | Add, edit, bench, activate, terminate employees                            |
| 13  | Config    | `canViewFocusAreas`             | Yes         | View focus areas / wings                                                   |
| 14  | Config    | `canManageFocusAreas`           | Yes         | Manage focus areas / wings                                                 |
| 15  | Config    | `canViewScheduleDefinitions`    | Yes         | View shift and job definitions                                             |
| 16  | Config    | `canManageScheduleDefinitions`  | Yes         | Manage shift and job definitions                                           |
| 17  | Config    | `canViewIndicatorTypes`         | Yes         | View note/indicator type definitions                                       |
| 18  | Config    | `canManageIndicatorTypes`       | Yes         | Manage note/indicator type definitions                                     |
| 19  | Config    | `canManageOrgSettings`          | No          | Edit org name, address, phone, employee count, timezone (super_admin only) |
| 20  | Config    | `canViewOrgLabels`              | Yes         | View custom terminology labels                                             |
| 21  | Config    | `canManageOrgLabels`            | Yes         | Edit custom terminology labels                                             |
| 22  | Coverage  | `canViewCoverageRequirements`   | Yes         | View minimum staffing requirements                                         |
| 23  | Coverage  | `canManageCoverageRequirements` | Yes         | Manage minimum staffing requirements                                       |
| 24  | Requests  | `canApproveShiftRequests`       | Yes         | Approve or reject shift pickup/swap requests                               |
| 25  | Dashboard | `canViewDashboardAnalytics`     | Yes         | View the organization dashboard and analytics                              |
| 26  | Reports   | `canViewReports`                | Yes         | View and export the operations reports (staff hours, activity, categories) |

Permissions are **per-person**, set on the People page, not granted by departments. A member's effective permissions are their `org_role` plus their own `admin_permissions`. (`departments.permissions` exists for management departments but is vestigial; an earlier department-template union model was reverted.)

**Super Admin-only (never delegatable to admins):** `canManageUsers`, `canConfigureAdminPermissions`, `canManageOrgSettings`

### 4.3 Authentication Flow

- Email/password authentication via Supabase Auth
- Custom JWT access token hook writes claims at top level of JWT payload: `platform_role`, `org_role`, `org_id`, `org_slug`
- Edge middleware verifies JWT, calculates effective role, and enforces route-level access
- Subdomain routing ensures users stay within their org context
- Invitation-only registration with 72-hour expiry tokens
- Self-service password reset via email (forgot password → reset password flow)
- Email verification for new accounts with resend capability (60s cooldown)
- Password strength meter (4 levels: too short, weak, fair, strong; minimum 10 characters)
- Post-login soft navigation: `router.replace` + an `<AuthSplash>` bridge while the session settles, so route guards do not bounce a freshly-authenticated user back to login. Logout is fast and always redirects to `/login`.
- 14-day trial starts on the **first super admin login** via the idempotent `start_trial_for_org` RPC. Until then the org sits in a `trial_pending` billing state that gates non-super-admins. A one-time welcome modal and "trial started" email (`/api/trial-welcome`, react-email `TrialWelcomeEmail`) fire once for the super admin.
- Per-session org isolation: `user_sessions.active_org_id` drives JWT org claims per device, so `switch_org` only affects the calling device; `profiles.org_id` is just the default for new sign-ins.

---

## 5. Shift Code Reference

All codes below are provided as defaults and must be supported as valid cell values in DubGrid. Organizations can customize labels, colors, and add custom codes via Settings.

| Code                  | Name                   | Description                                                             |
| --------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `D`                   | Day Shift              | Standard daytime shift                                                  |
| `E`                   | Evening Shift          | Standard evening shift                                                  |
| `N`                   | Night Shift            | Overnight shift                                                         |
| `X`                   | Day Off                | Scheduled off day                                                       |
| `Ds` / `Es` / `Ns`    | Supervisor Shift       | Supervisor on duty for respective shift period                          |
| `Dcn` / `Ecn`         | Charge Nurse           | Charge nurse role for Day or Evening shift                              |
| `SCD`                 | Sheltered Care Day     | Day shift assignment to Sheltered Care wing                             |
| `SCE`                 | Sheltered Care Evening | Evening shift assignment to Sheltered Care wing                         |
| `VN`                  | Visiting CS Nurse      | Visiting CS Nurse covering Visiting CSNS section                        |
| `V`                   | PTO                    | Paid Time Off                                                           |
| `Ofc`                 | Office                 | Administrative/office duty (non-floor)                                  |
| `T`                   | Travel                 | Staff is traveling                                                      |
| `A`                   | CS Association (PTO)   | CS Association meeting day (counts as PTO)                              |
| `(D)` / `(E)` / `(N)` | Orientation / Shadow   | New staff in orientation, shadowing or mentoring mode                   |
| `0.3`                 | Part-Time Fraction     | Denotes part-time staffing weight (e.g., 0.3 FTE)                       |
| `E/Ns`                | Split / Transition     | Shift spanning two shift types (e.g., Eve moving into Night Supervisor) |

**Jobs + shifts support:** custom colors (background, text, border), default start/end times, certification requirements, off-day designation, and shift grouping for tally displays.

---

## 6. Staff Designations & Roles

Each staff member carries one primary designation code and may carry one or more role tags. Organizations define their own certifications and roles via Settings.

| Code                   | Title                  | Notes                                                            |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| `JLCSN`                | Journal Listed CSN     | Core certification level; most staff carry this designation      |
| `DCSN`                 | Director CSN           | Director-level CSN; senior clinical oversight                    |
| `DVCSN`                | Director VCSN          | Director of Visiting CS Nursing                                  |
| `CSN III`              | CSN Level III          | Mid-tier CSN designation                                         |
| `CSN II`               | CSN Level II           | Entry-tier CSN designation                                       |
| `STAFF`                | Staff                  | Graduated past CSN IV, not yet Journal listed                    |
| `Supv`                 | Supervisor             | Shift supervisor; assigned Ds/Es/Ns codes                        |
| `Mentor`               | Mentor                 | Qualified to supervise/guide new or orientation staff            |
| `CN`                   | Charge Nurse           | Charge nurse role; assigned Dcn/Ecn codes                        |
| `SC. Mgr.`             | Sheltered Care Manager | Oversees Sheltered Care wing scheduling and operations           |
| `Activity Coordinator` | Activity Coordinator   | Non-clinical; schedules around activity programming              |
| `SC/Asst/Act/Cor`      | Multi-role SC Staff    | Sheltered Care assistant who also serves as Activity Coordinator |

---

## 7. Functional Requirements & Implementation Status

Priority levels: **Must** = required for launch, **Should** = high priority, **Could** = nice-to-have.

Status: ✅ = Implemented, 🔨 = Partially Implemented, ❌ = Not Yet Implemented

### 7.1 Schedule Management

| ID    | Feature               | Priority | Status | Description                                                                                                                                                         |
| ----- | --------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Schedule Grid         | Must     | ✅     | 1-week, 2-week, and month view. Staff rows × date columns with schedule cells. Toggle between views via toolbar.                                                    |
| FR-02 | Focus Area Sections   | Must     | ✅     | Configurable sections with color-coded headers. Filter by focus area in toolbar. Each org defines its own sections.                                                 |
| FR-03 | Schedule Cell Editing | Must     | ✅     | Click cell to open shift edit panel. Select from the org's configured shifts and jobs. Supports custom times per entry.                                             |
| FR-04 | Cross-Wing Staff      | Must     | ✅     | Employees can be assigned to multiple focus areas. Grid displays assignments per focus area with filtering.                                                         |
| FR-05 | Shift Count Row       | Must     | ✅     | Auto-calculated tally rows per section. Assignments are grouped by shift category; counts appear at the bottom of each focus area section.                          |
| FR-06 | Seniority Sorting     | Must     | ✅     | Staff rows sortable by seniority within focus areas.                                                                                                                |
| FR-07 | Staff Designations    | Must     | ✅     | Each employee stores certifications and roles. Displayed in staff view and grid name column.                                                                        |
| FR-08 | Skills / Role Tags    | Must     | ✅     | Certifications and roles are configurable per org. Employees tagged with multiple certifications and roles.                                                         |
| FR-11 | Print Layout          | Must     | ✅     | Print-optimized view with customizable options. Select focus areas and date range. Landscape format with legend.                                                    |
| FR-12 | Schedule Legend       | Must     | ✅     | Legend displaying all derived schedule labels with colors. Included in print view via PrintLegend component.                                                        |
| FR-13 | Staff Management      | Must     | ✅     | Full CRUD: add (bulk import), edit, bench, activate, terminate employees. Status tracking with timestamps and notes.                                                |
| FR-14 | Date Navigation       | Must     | ✅     | Back/Today/Forward buttons in toolbar. Steps by active view span. Month view calendar navigation.                                                                   |
| FR-15 | Focus Area Filter     | Must     | ✅     | Filter schedule view by focus area: All or any individual section. Staff search within filtered view.                                                               |
| FR-16 | Print Date Header     | Must     | ✅     | Printed schedules include organization name, print date, and schedule date range.                                                                                   |
| FR-17 | Schedule Export       | Could    | ✅     | Export the schedule to PDF and CSV (`/api/export`) and to iCalendar (`.ics`) feed (`/api/calendar`). Reports export available via `/api/reports/operations/export`. |

### 7.2 Draft/Publish Workflow

| ID    | Feature         | Priority | Status | Description                                                                                                           |
| ----- | --------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| FR-20 | Draft Mode      | Must     | ✅     | All schedule edits are initially drafts. Visual distinction between draft and published shifts.                       |
| FR-21 | Publish Changes | Must     | ✅     | Super admins and permitted admins can publish all draft changes for a date range. Confirmation dialog before publish. |
| FR-22 | Discard Drafts  | Must     | ✅     | Cancel/rollback all unpublished draft changes.                                                                        |
| FR-23 | Draft Recovery  | Should   | ✅     | Draft sessions saved to DB. Can recover unsaved drafts across browser sessions. Draft banner shows change count.      |

### 7.3 Recurring Schedules

| ID    | Feature                  | Priority | Status | Description                                                                                                           |
| ----- | ------------------------ | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| FR-24 | Recurring Shifts         | Should   | ✅     | Define recurring shift templates per employee. Apply recurring schedule to a date range.                              |
| FR-25 | Shift Series             | Should   | ✅     | Create repeating shift series: daily, weekly, or biweekly. Configurable start/end dates and occurrence limits.        |
| FR-26 | Apply Recurring Schedule | Should   | ✅     | One-click apply of recurring shift templates to selected date range. Requires `canApplyRecurringSchedule` permission. |

### 7.4 Notes & Indicators

| ID    | Feature     | Priority | Status | Description                                                                                                       |
| ----- | ----------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| FR-19 | Shift Notes | Could    | ✅     | Schedule notes/indicators per cell with focus area scoping. Configurable indicator types. Draft/published status. |

### 7.5 Real-Time Collaboration

| ID    | Feature          | Priority | Status | Description                                                                                   |
| ----- | ---------------- | -------- | ------ | --------------------------------------------------------------------------------------------- |
| FR-27 | Real-Time Sync   | Should   | ✅     | Schedule changes sync across tabs and users in real-time via Supabase Realtime subscriptions. |
| FR-28 | Tab Coordination | Should   | ✅     | Cross-tab communication for session state consistency.                                        |
| FR-29 | Cell Locks       | Should   | ✅     | Real-time cell lock/occupancy tracking. Shows which user is currently editing a cell.         |
| FR-30 | Presence Avatars | Should   | ✅     | Active user presence indicators showing who is currently viewing the schedule.                |

### 7.6 Authentication & Account Management

| ID    | Feature                 | Priority | Status | Description                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ----------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-60 | Forgot Password         | Must     | ✅     | Email-based password reset request with enumeration protection (always shows success). Rate limited.                                                                                                                                                                                                                                                                                                              |
| FR-61 | Reset Password          | Must     | ✅     | Token-validated reset form via email link. Password strength meter (4 levels). Minimum 10 characters. Signs out after.                                                                                                                                                                                                                                                                                            |
| FR-62 | Email Verification      | Must     | ✅     | Verification page for new accounts with resend button (60s cooldown). Auto-redirects on confirmation.                                                                                                                                                                                                                                                                                                             |
| FR-63 | Onboarding Wizard       | Must     | ✅     | Role-aware composite onboarding wizard rendered **inline** via `OnboardingGate` (the standalone `/setup` route and the old 8-step wizard were deleted). Step list varies by role and org configuration state — see §7.6.1.                                                                                                                                                                                        |
| FR-64 | Invited-User Onboarding | Must     | ✅     | Polling page for newly invited users awaiting org assignment. Non-admins on an unconfigured org see a `SetupPendingScreen`.                                                                                                                                                                                                                                                                                       |
| FR-65 | Demo Request Form       | Should   | ✅     | Landing page contact form with Zod validation, CSRF protection, and branded email notification via Resend.                                                                                                                                                                                                                                                                                                        |
| FR-66 | MFA Status              | Should   | 🔨     | `/api/account/mfa-status` reports per-account MFA enrollment state and surfaces it in the profile/security UI. Full TOTP enrollment + enforcement for elevated roles not yet complete.                                                                                                                                                                                                                            |
| FR-67 | Test Sandbox            | Could    | ✅     | Clone a super admin's org config into an isolated `workspace_kind='sandbox'` org (30-day TTL) and enter it via an HttpOnly cookie (`dubgrid-sandbox`), not a JWT/subdomain hop. `/api/test-sandbox` (force-dynamic POST, CSRF-guarded) supports `enter` (reuse-or-clone), `reset` (wipe + re-clone), and `exit` (delete + clear cookie). Sandboxes are owned by the creating user and excluded from mobile login. |

#### 7.6.1 Onboarding Wizard Step Lists

The wizard is rendered by `components/onboarding/OnboardingWizard.tsx` inside a full-screen `WizardShell` overlay. `OnboardingGate` checks billing lock → onboarding status → org setup before deciding what to render. Step state is a machine (`useOnboardingState.ts`) persisted to `localStorage`; `completeOnboarding()` seeds the React Query cache and calls the idempotent `complete_onboarding` RPC.

| Role / org state               | Flow        | Steps                                                                  |
| ------------------------------ | ----------- | ---------------------------------------------------------------------- |
| super_admin + unconfigured org | SETUP       | `welcome → identity → structure → schedule → invite-team → completion` |
| super_admin + configured org   | ORIENTATION | `welcome → sa-orientation → completion`                                |
| admin                          | ORIENTATION | `welcome → orientation → completion`                                   |
| user                           | MINIMAL     | `welcome → completion`                                                 |

SETUP steps group legacy settings panels onto single wizard screens via `steps/CompositeSection.tsx`: **Identity** (OrganizationGeneral + OrganizationLabels), **Structure** (Departments + roles + certifications, requires ≥1 department), **Schedule** (display mode + ShiftCategories + Jobs, requires ≥1 category and ≥1 job), **Invite Team** (points to `/people`). After completion, a dismissable `PersonaLandingCard` "Next steps" card is shown on the dashboard (dismissal persists to `organization_memberships.landing_card_dismissed_at` via the `dismiss_landing_card` RPC). Telemetry events (`onboarding_started`, `step_completed`, `step_skipped`, `completed`, `abandoned`, `persona_landing_dismissed`) flow to PostHog via `lib/onboarding-telemetry.ts`.

### 7.7 Staff Schedule View

| ID    | Feature             | Priority | Status | Description                                                                                                    |
| ----- | ------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| FR-18 | Staff Schedule View | Should   | 🔨     | Users with `user` role can view the schedule in read-only mode. Full per-wing scoped view not yet implemented. |

### 7.8 Dashboard & Analytics

| ID    | Feature             | Priority | Status | Description                                                                                     |
| ----- | ------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------- |
| FR-31 | Dashboard Overview  | Should   | ✅     | Main dashboard with KPI stat cards (total hours, active employees, open shifts, coverage rate). |
| FR-32 | Coverage by Section | Should   | ✅     | Donut chart showing coverage status breakdown per focus area.                                   |
| FR-33 | Open Shifts Card    | Should   | ✅     | Card listing uncovered/open shifts that need attention.                                         |
| FR-34 | Staff Hours Card    | Should   | ✅     | Total hours and trends visualization across the schedule period.                                |
| FR-35 | Shift Breakdown     | Should   | ✅     | Shift code distribution chart showing how shifts are allocated.                                 |
| FR-36 | Activity Feed       | Should   | ✅     | Recent activity feed showing schedule changes, publishes, and user actions.                     |
| FR-37 | Expanded Views      | Could    | ✅     | Each dashboard card expands to a detailed full-page view for deeper analysis.                   |

### 7.9 Staff Detail Page

| ID    | Feature               | Priority | Status   | Description                                                                             |
| ----- | --------------------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| FR-38 | Staff Detail Overview | Should   | ✅       | Full employee profile page with personal info, certifications, focus areas, and status. |
| FR-39 | Staff Schedule Tab    | Should   | ✅       | Historical schedule view for an individual employee with date range filtering.          |
| FR-40 | Staff Activity Tab    | Should   | ✅       | Employee activity timeline showing status changes, role changes, and events.            |
| FR-41 | Staff Reports Tab     | Should   | Deferred | Not currently surfaced in the active staff detail experience.                           |

### 7.10 Shift Requests

| ID    | Feature                 | Priority | Status | Description                                                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-42 | Shift Pickup Requests   | Could    | ✅     | Employees can request to pick up open shifts. Admins approve/reject via shift request board.                                                           |
| FR-43 | Shift Swap Requests     | Could    | ✅     | Employees can propose shift swaps with colleagues. Lifecycle: open → pending_approval → approved/rejected/cancelled/expired.                           |
| FR-44 | Shift Request Board     | Could    | ✅     | Admin view for managing all shift requests with filtering by status and type.                                                                          |
| FR-47 | Shift Call-Off Requests | Could    | ✅     | Employees can request to call off a scheduled shift (an absence type is required). Admins approve/reject. Request types are pickup, swap, and calloff. |

### 7.11 Coverage & Staffing

| ID    | Feature               | Priority | Status | Description                                                                           |
| ----- | --------------------- | -------- | ------ | ------------------------------------------------------------------------------------- |
| FR-45 | Coverage Requirements | Should   | ✅     | Define minimum staffing levels per focus area, preferred shift/job, and day of week.  |
| FR-46 | Coverage Status       | Should   | ✅     | Visual coverage panel showing actual vs. required staffing with met/unmet indicators. |

### 7.12 Gridmaster Portal

| ID    | Feature                  | Priority | Status | Description                                                                                       |
| ----- | ------------------------ | -------- | ------ | ------------------------------------------------------------------------------------------------- |
| FR-50 | Gridmaster Dashboard     | Must     | ✅     | Platform-wide overview with organization stats, health metrics, and recent activity.              |
| FR-51 | Organization Management  | Must     | ✅     | Create, view, and manage organizations. Organization detail view with member counts and settings. |
| FR-52 | All Users View           | Must     | ✅     | Platform-wide user table across all organizations with search and filtering.                      |
| FR-53 | Audit Log                | Must     | ✅     | Global audit trail of all role changes with immutable history.                                    |
| FR-54 | Admin Permissions Editor | Must     | ✅     | Configure granular per-admin permissions via checkbox UI. Used by super_admin and gridmaster.     |
| FR-55 | User Impersonation       | Should   | ✅     | Gridmaster can impersonate org users with 30-minute session expiry. Full audit trail.             |

### 7.13 Mobile Application

The Expo / React Native mobile app (`apps/mobile`) is a first-class product surface for staff and admins on the go. It communicates exclusively with the web app's `/api/mobile/v1/*` API (bearer auth, Zod-validated responses) and never touches Supabase data tables directly. Sandbox workspaces are rejected for mobile login.

| ID    | Feature                     | Priority | Status | Description                                                                                                                                  |
| ----- | --------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-70 | Mobile Auth & Org Selection | Must     | ✅     | Email/password login and organization selection against `/api/mobile/v1/auth/*` and `/bootstrap`. `onAuthFailure` hook handles token expiry. |
| FR-71 | Mobile Schedule             | Must     | ✅     | "My schedule" and org schedule views (`me/`, `team/` tab stacks); per-shift detail screen at `shift/[employeeId]/[date]`.                    |
| FR-72 | Mobile People               | Should   | ✅     | People roster and person-detail screens with status and invitation actions (`people/` tab stack).                                            |
| FR-73 | Mobile Shift Requests       | Should   | ✅     | View, create, and act on shift pickup/swap requests, including swap-option lookup (`requests/` tab stack).                                   |
| FR-74 | Mobile Profile              | Should   | ✅     | Profile, work, account, and security screens; phone update, session list, change-requests, notification preferences.                         |
| FR-75 | Mobile Notifications        | Should   | ✅     | In-app notification list with read / read-all; Expo push token registration and session-presence reporting.                                  |
| FR-76 | Mobile Onboarding Intro     | Could    | ✅     | 3-slide first-launch intro carousel (`apps/mobile/src/features/onboarding`) — distinct from the web onboarding wizard.                       |

---

## 8. Data Model

### 8.1 Core Tables

| Entity                            | Key Fields                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`                   | id, name, slug, address, phone, timezone, employee_count, focus_area_label, certification_label, role_label, suspended_at, feature_overrides (JSONB), stripe fields, `workspace_kind` ('production'\|'sandbox', default 'production', CHECK), `sandbox_source_org_id` (FK orgs), `sandbox_owner_user_id` (FK auth.users), `sandbox_expires_at`, `sandbox_template_version` |
| `profiles`                        | id (FK auth.users), org_id, platform_role (enum), version, role_locked                                                                                                                                                                                                                                                                                                     |
| `organization_memberships`        | user_id, org_id, org_role (enum), admin_permissions (JSONB), department_ids[], archived_at, joined_at, `landing_card_dismissed_at`, `onboarding_step_telemetry` (JSONB, default `{}`)                                                                                                                                                                                      |
| `departments`                     | id, org_id, name, abbr, `type` (`scheduled` \| `management`), permissions (JSONB — management depts only); two-type model, focus areas are children of departments                                                                                                                                                                                                         |
| `employees`                       | id, org_id, first_name, last_name, status (active/benched/terminated), certification_id (FK), role_ids[], focus_area_ids[], department_ids[], phone, email, seniority, user_id (FK auth.users, nullable)                                                                                                                                                                   |
| `schedule_cells`                  | id, emp_id, date, org_id, version (optimistic lock), series_id, from_recurring, focus_area_id                                                                                                                                                                                                                                                                              |
| `schedule_cell_snapshots`         | id, cell_id, snapshot_kind (draft/published), state_kind (worked/absence/deleted), absence_type_id, custom_start_time, custom_end_time                                                                                                                                                                                                                                     |
| `schedule_cell_segments`          | id, snapshot_id, position, shift_id, job_id                                                                                                                                                                                                                                                                                                                                |
| `focus_areas`                     | id, org_id, department_id (FK), name, color_bg, color_text, sort_order, break_minutes                                                                                                                                                                                                                                                                                      |
| `assignments (derived)`           | label, name, colors, default timing, shift/category linkage, focus area linkage, required_certification_ids[]                                                                                                                                                                                                                                                              |
| `shift_categories`                | id, org_id, name, color, start_time, end_time, sort_order, focus_area_id, break_minutes                                                                                                                                                                                                                                                                                    |
| `schedule_notes`                  | id, org_id, emp_id, date, indicator_type_id, status (published/draft/draft_deleted), focus_area_id                                                                                                                                                                                                                                                                         |
| `indicator_types`                 | id, org_id, name, color, sort_order                                                                                                                                                                                                                                                                                                                                        |
| `certifications`                  | id, org_id, name, abbr, sort_order                                                                                                                                                                                                                                                                                                                                         |
| `organization_roles`              | id, org_id, name, abbr, sort_order                                                                                                                                                                                                                                                                                                                                         |
| `recurring_shifts`                | id, org_id, emp_id, state (JSONB), day_of_week (0-6), effective_from, effective_until                                                                                                                                                                                                                                                                                      |
| `shift_series`                    | id, org_id, emp_id, state (JSONB), frequency (daily/weekly/biweekly), days_of_week[], start_date, end_date, max_occurrences                                                                                                                                                                                                                                                |
| `coverage_requirements`           | id, org_id, focus_area_id, preferred_shift_id, preferred_job_id, day_of_week, min_staff                                                                                                                                                                                                                                                                                    |
| `absence_types`                   | id, org_id, label (X/V/S), name, color, border_color, text_color, sort_order                                                                                                                                                                                                                                                                                               |
| `shift_requests`                  | id, org_id, type (pickup/swap/calloff), status (open/pending_approval/approved/rejected/cancelled/expired), requester_emp_id, target_emp_id, target_shift_date, absence_type_id (required for calloff + targeted pickup), admin_user_id, expires_at                                                                                                                        |
| `recurring_shifts_draft_sessions` | id, org_id, saved_by, ... — concurrent-edit cell locks for the recurring-shifts editor                                                                                                                                                                                                                                                                                     |
| `schedule_draft_sessions`         | id, org_id, saved_by, start_date, end_date, saved_at — concurrent-edit cell locks for the schedule grid                                                                                                                                                                                                                                                                    |
| `publish_history`                 | id, org_id, published_by, start_date, end_date, change_count, changes (JSONB), published_at                                                                                                                                                                                                                                                                                |

`recurring_shifts.state` and `shift_series.state` are canonical `ScheduleCellState`
payloads. Those tables do not store `shift_id`, `job_id`, or `absence_type_id`
convenience columns. Dated schedule identity is normalized through
`schedule_cell_snapshots.absence_type_id` and `schedule_cell_segments.shift_id/job_id`.

### 8.2 RBAC & Security Tables

| Entity                   | Key Fields                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `role_change_log`        | id, changed_by, target_user_id, old_role, new_role, org_id, idempotency_key (UNIQUE), created_at |
| `jwt_refresh_locks`      | user_id, locked_until (blocks JWT refresh for 5s after role change)                              |
| `invitations`            | id, org_id, email, employee_id (FK), invited_by, token, expires_at (72h), accepted_at            |
| `impersonation_sessions` | id, gridmaster_id, target_user_id, org_id, started_at, expires_at (30min)                        |
| `user_sessions`          | id, user_id, device_label, ip_address, last_active_at, refresh_token_hash                        |

### 8.3 Database Security

- **Row-Level Security (RLS):** All tables have RLS policies enforcing org-scoped data access. `schedule_notes` write policies gate on `check_admin_permission('canEditScheduleIndicators')`.
- **Custom JWT claims:** `platform_role`, `org_role`, `org_id`, `org_slug` written at JWT top level by access token hook
- **Optimistic locking:** `schedule_cells` uses a `version` column to prevent concurrent overwrites
- **Idempotency:** Role changes and schedule operations use idempotency keys to prevent duplicate writes
- **Self-action guards:** `change_user_role` hard-blocks self-role-change at the DB layer (P0001); `@dubgrid/domain` exposes `assertNotSelf` / `isSelfAction` for the app layer
- **Sandbox isolation:** `workspace_kind='sandbox'` orgs are owned by a single user, carry a 30-day TTL, and are excluded from mobile login
- **4-file migration strategy:** All schema in 001_schema.sql, 002_functions_triggers.sql, 003_rls_policies.sql, 004_grants.sql

---

## 9. Architecture

### 9.1 Multi-Tenant Routing

Organizations are routed via subdomains:

- `acme.dubgrid.com` → Organization "Acme" schedule
- `dubgrid.com` → Landing page / login
- `gridmaster.dubgrid.com` → Gridmaster command center

The Next.js request proxy (`apps/web/src/proxy.ts`) enforces:

- JWT verification and role calculation
- Subdomain-to-org matching
- Route-level access control (`/settings` → admin+, `/gridmaster` → gridmaster only)
- Header injection (`x-dubgrid-role`, `x-dubgrid-org-id`, `x-dubgrid-org-slug`)

### 9.2 Application Routes

All routes are simple (non-catch-all) to preserve static prerendering on Vercel.

| Route                    | Access Level  | Purpose                                                             |
| ------------------------ | ------------- | ------------------------------------------------------------------- |
| `/`                      | Public        | Landing page with feature showcase                                  |
| `/login`                 | Public        | Organization / gridmaster login                                     |
| `/forgot-password`       | Public        | Password reset request (email-based)                                |
| `/reset-password`        | Public        | Password reset form (via email link token)                          |
| `/verify-email`          | Public        | Email verification for new accounts                                 |
| `/auth/verify`           | Public        | Auth callback / token verification handler                          |
| `/accept-invite`         | Public        | Invitation acceptance flow                                          |
| `/request-demo`          | Public        | Demo request / contact form                                         |
| `/onboarding`            | Authenticated | Invited-user org assignment polling                                 |
| `/dashboard`             | Authenticated | Organization dashboard with analytics                               |
| `/schedule`              | Authenticated | Main schedule grid                                                  |
| `/people`                | Authenticated | People roster management                                            |
| `/people/[id]`           | Authenticated | Individual staff member detail (tabs: Overview, Schedule, Activity) |
| `/reports`               | Authenticated | Operations reports                                                  |
| `/settings`              | Admin+        | Organization configuration                                          |
| `/settings/staff-config` | Admin+        | Staff config — focus areas, certifications, absence types, roles    |
| `/profile`               | Authenticated | User profile settings                                               |
| `/billing-required`      | Authenticated | Billing lock screen for orgs without an active subscription         |
| `/gridmaster`            | Gridmaster    | Platform command center                                             |
| `/privacy`               | Public        | Privacy policy                                                      |
| `/terms`                 | Public        | Terms of service                                                    |
| `/cookie-policy`         | Public        | Cookie policy                                                       |

The onboarding wizard is no longer a route — it renders inline via `OnboardingGate` (the former `/setup` route was deleted).

### 9.3 Key Application Files

Everything for the web app lives under `apps/web/`. UI features are organized into `apps/web/src/features/<feature>/` folders with up to `client/`, `server/`, and `shared/` subfolders. A feature's `client/api.ts` exposes typed functions that `fetch()` the app's own `/api/...` Route Handlers — the browser never touches Supabase data tables directly for these domains. Server-only logic in `server/` is invoked by those Route Handlers. The request flow is: browser → `features/*/client/api.ts` → Route Handler → `lib/db/*` (or `mobile-api-core` / `@dubgrid/data-access` for mobile).

| File / Directory                                          | Purpose                                                                                                                                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/proxy.ts`                                   | Next.js request proxy for RBAC + subdomain routing                                                                                                                                                                                                             |
| `apps/web/next.config.ts`                                 | Next.js configuration + security headers                                                                                                                                                                                                                       |
| `apps/web/src/app/schedule/page.tsx`                      | Main scheduler UI — grid, toolbar, DND                                                                                                                                                                                                                         |
| `apps/web/src/app/dashboard/page.tsx`                     | Organization dashboard with analytics                                                                                                                                                                                                                          |
| `apps/web/src/app/people/page.tsx`                        | People roster management                                                                                                                                                                                                                                       |
| `apps/web/src/app/people/[id]/page.tsx`                   | Person detail page with tabbed views                                                                                                                                                                                                                           |
| `apps/web/src/app/settings/page.tsx`                      | Organization settings                                                                                                                                                                                                                                          |
| `apps/web/src/app/gridmaster/page.tsx`                    | Gridmaster command center                                                                                                                                                                                                                                      |
| `apps/web/src/app/api/`                                   | Route Handlers — ~110 endpoints incl. `/api/mobile/v1/*`                                                                                                                                                                                                       |
| `apps/web/src/lib/db/`                                    | Server-side data-access layer — barrel (`index.ts`) over domain modules: `shared, types, mappers, organizations, config, employees, shifts, schedule, invitations, requests, notifications, sessions, admin, access`. Replaces the old single `src/lib/db.ts`. |
| `apps/web/src/features/permissions/`                      | Wraps `@dubgrid/authz` (`core`, `client`, `shared`, `usePermissions.ts`)                                                                                                                                                                                       |
| `apps/web/src/components/onboarding/`                     | Inline role-aware onboarding wizard (`OnboardingGate`, `OnboardingWizard`, `WizardShell`, steps, `PersonaLandingCard`)                                                                                                                                         |
| `apps/web/src/features/test-sandbox/`                     | Test-sandbox feature (org config cloning into a sandbox workspace)                                                                                                                                                                                             |
| `apps/web/src/components/forms/`                          | Shared form primitives: `CountrySelect`, `UsStateSelect`, `EmailInput`, `PhoneInput`, `PostalCodeInput`                                                                                                                                                        |
| `apps/web/src/lib/supabase.ts`                            | Lazy browser Supabase client via Proxy pattern                                                                                                                                                                                                                 |
| `apps/web/src/emails/`                                    | react-email components for transactional + Supabase auth emails (incl. `TrialWelcomeEmail`); `email:build` regenerates `supabase/templates/*.html`                                                                                                             |
| `apps/web/src/lib/email.ts`                               | Small email helpers (`sanitizeHeaderValue`, `emailBaseUrl`)                                                                                                                                                                                                    |
| `apps/web/src/lib/rate-limit.ts`                          | Upstash Redis rate limiters (API, schedule review, invite, demo, password reset, login, per-recipient email)                                                                                                                                                   |
| `apps/web/src/lib/onboarding-telemetry.ts`                | PostHog onboarding telemetry wrappers                                                                                                                                                                                                                          |
| `apps/web/src/lib/timezone-from-coords.ts`                | Offline timezone lookup from coordinates (`tz-lookup`)                                                                                                                                                                                                         |
| `apps/web/src/lib/us-states.ts` / `us-state-timezones.ts` | US state list + default-timezone map                                                                                                                                                                                                                           |
| `packages/domain/src/`                                    | Domain types + `permissions.ts` (`AdminPermissions`, 26 perms), role enums, billing types, `self-guard.ts`                                                                                                                                                     |
| `packages/authz/src/`                                     | Permission logic — `ROLE_LEVEL`, view implications, JWT claim extraction                                                                                                                                                                                       |
| `packages/contracts/src/`                                 | Zod API contract schemas (`schedule`, `mobile`, `staff`)                                                                                                                                                                                                       |
| `packages/mobile-api-core/src/`                           | Mobile backend orchestration (`auth`, `people-status`, `push`, `read`, `shift-requests`, `setup`, `organization`, `write`)                                                                                                                                     |
| `apps/mobile/app/`                                        | Expo Router routes (`index.tsx`, `(auth)/*`, `(tabs)/*`, `shift/[employeeId]/[date].tsx`)                                                                                                                                                                      |
| `apps/mobile/src/features/`                               | Mobile features — `auth`, `schedule`, `people`, `profile`, `shift-requests`, `notifications`, `onboarding`                                                                                                                                                     |
| `apps/mobile/src/shared/lib/api.ts`                       | Mobile API client built on `@dubgrid/api-client`                                                                                                                                                                                                               |

> `docs/architecture/folder-structure.md` describes the full feature/data-access layout. The remaining `apps/web/src/lib/*` modules (besides `lib/db/`) are compatibility shims.

### 9.4 Component Architecture (`apps/web`)

```
AppShell.tsx (root layout — sidebar, header, navigation)
├── Header.tsx (top navigation bar)
├── MobileNavSheet.tsx (mobile navigation drawer)
├── MobileSubNavContext.tsx (mobile sub-navigation context)
├── OnboardingGate.tsx (billing lock → onboarding → org setup gate)
│   └── OnboardingWizard.tsx → WizardShell.tsx → steps/* (role-aware inline wizard)
├── ImpersonationBanner.tsx (gridmaster impersonation indicator)
├── PageTransition.tsx (fade-in page animations)
│
├── Auth components (apps/web/src/components/auth/)
│   ├── AuthCard.tsx (PageShell + Card layout for auth pages)
│   ├── PasswordInput.tsx (password field with show/hide toggle)
│   └── PasswordStrength.tsx (4-level visual strength meter)
│
├── DashboardView.tsx (organization dashboard)
│   ├── DashboardHeader.tsx (title + controls)
│   ├── AlertBanner.tsx (critical issue alerts)
│   ├── StatCardsRow.tsx → StatCard.tsx (KPI cards)
│   ├── CoverageBySectionCard.tsx (coverage donut chart)
│   ├── OpenShiftsCard.tsx
│   ├── StaffHoursCard.tsx
│   ├── ShiftBreakdownCard.tsx
│   ├── ActivityFeed.tsx
│   ├── DonutChart.tsx (reusable chart)
│   └── expanded/ (full-page detail views)
│       ├── ExpandedStats.tsx
│       ├── ExpandedActivity.tsx
│       ├── ExpandedOpenShifts.tsx
│       ├── ExpandedStaffHours.tsx
│       ├── ExpandedCoverage.tsx
│       └── ExpandedBreakdown.tsx
│
├── ScheduleGrid.tsx (employee × date grid with DND)
│   ├── DraggableShift.tsx / DroppableCell.tsx
│   ├── ShiftEditPanel.tsx (canonical assignment picker, notes)
│   ├── ShiftPicker.tsx (shift/job selector)
│   ├── ShiftContextMenu.tsx (right-click actions)
│   ├── RepeatForm.tsx (shift series creation)
│   ├── DraftBanner.tsx (draft change count + publish/cancel)
│   ├── CoveragePanel.tsx (coverage intelligence sidebar)
│   └── PresenceAvatars.tsx (active users)
│
├── MonthView.tsx (calendar month view)
├── MobileDayView.tsx (mobile-web day-by-day view)
│
├── People roster (features/people/)
│   ├── PeopleView.tsx (employee roster management)
│   ├── PeopleToolbar.tsx (search, filter, sort, export)
│   ├── PeopleFilterPopover.tsx (advanced filtering)
│   ├── PersonTableRow.tsx
│   ├── PeopleContextBar.tsx (quick actions)
│   ├── PeoplePagination.tsx / PeopleEmptyState.tsx
│   ├── AddEmployeeModal.tsx / EditEmployeePanel.tsx
│   ├── InviteEmployeeModal.tsx
│   └── PersonDetailPanel.tsx (side panel)
│
├── PersonDetailPage.tsx (individual person at /people/[id])
│   ├── PersonDetailHeader.tsx (avatar, name, status, actions)
│   ├── tabs/OverviewTab.tsx (profile, certs, focus areas)
│   ├── tabs/ScheduleTab.tsx (historical schedule)
│   ├── tabs/ActivityTab.tsx (timeline)
│
├── SettingsPage.tsx (org configuration — see §10.8)
│
├── ShiftRequestBoard.tsx / ShiftSwapModal.tsx
│
├── Landing page mockups (apps/web/src/components/landing/)
│   ├── ScheduleGridMockup.tsx
│   ├── StaffViewMockup.tsx
│   ├── SettingsMockup.tsx
│   ├── PermissionsMockup.tsx
│   └── RecurringShiftsMockup.tsx
│
├── PrintOptionsModal.tsx + PrintScheduleView.tsx + PrintLegend.tsx
│
├── Shared UI
│   ├── Modal.tsx / ConfirmDialog.tsx
│   ├── CustomSelect.tsx (searchable dropdown)
│   ├── ScrollableTabs.tsx / NotificationBell.tsx
│   ├── ButtonSpinner.tsx / ProgressBar.tsx
│   └── Logo.tsx (wordmark + icon)
│
└── Toolbar.tsx (date nav, view toggle, filters, search, print)
```

### 9.5 Gridmaster Command Center

```
gridmaster/page.tsx
├── GridmasterDashboard.tsx (platform stats, recent activity)
├── AllUsersView.tsx (platform-wide user table)
├── AuditLogView.tsx (role change audit trail)
├── OrganizationDetail.tsx (org management)
│   └── AdminPermissionsEditor.tsx (per-admin permission config)
├── organization-setup/ (guided setup for new orgs — incl. parseEmployeePaste.ts)
├── EnhancedImpersonation.tsx (impersonate org users)
└── ImpersonationHistory.tsx (impersonation session log)
```

### 9.6 Mobile Application (`apps/mobile`)

```
apps/mobile/app/ (Expo Router)
├── _layout.tsx / index.tsx / alerts.tsx
├── shift/[employeeId]/[date].tsx (shift detail)
├── (auth)/login.tsx / (auth)/onboarding.tsx
└── (tabs)/_layout.tsx
    ├── me/      (my schedule)
    ├── people/  (roster + person detail)
    ├── team/    (org schedule)
    ├── requests/(shift pickup/swap)
    └── profile/ (index, work, account, security)

apps/mobile/src/
├── features/ — auth, schedule, people, profile, shift-requests,
│               notifications, onboarding (3-slide intro carousel)
└── shared/   — providers, navigation, components, theme, hooks, lib
                (lib/api.ts → @dubgrid/api-client, bearer auth, Zod parsing)
```

The mobile app talks only to `apps/web` `/api/mobile/v1/*`.

---

## 10. UI & UX

### 10.1 Schedule Grid

- Three view modes: 1-week, 2-week (default), and month view
- Columns represent dates; rows represent staff members
- Sections are color-coded by focus area
- Click a cell to open the shift edit panel with all valid codes
- Drag-and-drop shift cells between employees and dates (via @dnd-kit)
- Draft shifts are visually distinct from published shifts
- Staff search/highlight within the active focus area filter
- Today's date column is highlighted
- Real-time presence avatars and cell locks

### 10.2 Staff Name Column

- Displays: full name, certification(s), role tag(s)
- Seniority ordering (most senior at top)
- Contact info (phone, email) accessible from staff view

### 10.3 Draft/Publish Workflow

- All edits enter draft state by default
- DraftBanner shows count of pending changes
- Publish action promotes all drafts to published (requires permission)
- Discard action rolls back all draft changes
- Draft recovery saves session state to DB for cross-session restoration

### 10.4 Dashboard

- Stat cards row: total hours, active employees, open shifts, coverage rate
- Coverage by section donut chart
- Open shifts card with details
- Staff hours trend visualization
- Shift breakdown by code distribution
- Activity feed with recent changes
- Each card expands to a detailed full-page view
- Alert banner for critical issues

### 10.5 Staff Detail

- Full-page employee profile view at `/people/[id]`
- Header: avatar, name, status badge, certifications
- Tabs: Overview, Schedule, Activity
- Overview: personal info, focus areas, roles, certifications
- Schedule: historical shift view with date range picker
- Activity: status change timeline, events

### 10.6 Print View

- Landscape orientation with customizable options
- Select which focus areas and date range to include
- Header: organization name, printed date, schedule date range
- Legend with all schedule labels and their colors
- Optimized font sizing for legibility

### 10.7 Toolbar

- Date range navigator: back / today / forward (steps by active view span)
- View toggle: 1W / 2W / Month
- Focus area filter: All or any configured section
- Staff search within active filter
- Apply Recurring Schedule button (permission-gated)
- Print button
- Edit mode toggle

### 10.8 Settings

The `/settings` route hosts the organization configuration panels:

- **Organization** — Name, address, phone, employee count, timezone, custom terminology labels
- **Departments** — Two-type department model (scheduled + management); focus areas are children
- **Shift Categories** — Create/edit/delete shift categories with time windows
- **Shifts & Jobs** — Schedule definitions with colors, times, and qualification rules
- **Coverage** — Minimum staffing requirements per focus area, shift/job assignment, and day
- **Indicators** — Note/indicator type definitions with colors
- **Users** — User management, role assignment, admin permission configuration (super_admin only)

`/settings/staff-config` is a dedicated sub-route covering focus areas, certifications, absence types, and organization roles. Gridmaster impersonation controls live in the gridmaster portal, not in org settings.

### 10.9 Authentication Pages

- **Login** — Email/password login with org subdomain validation and domain selector
- **Forgot Password** — Email input with enumeration protection (always shows success)
- **Reset Password** — Token-validated form with password strength meter and min 10 char requirement
- **Email Verification** — Verification status with resend button (60s cooldown) and auto-redirect
- **Accept Invite** — Invitation token validation, account creation, employee linking
- All auth pages use consistent `AuthCard` layout with branded styling

### 10.10 Landing Page

- Feature showcase with interactive mockups (schedule grid, staff view, settings, permissions, recurring shifts)
- Demo request form with contact information
- Responsive layout with branded design

---

## 11. Non-Functional Requirements

- **Performance:** Schedule grid for 50+ employees over 14 days must render in under 1 second
- **Compatibility:** Must work in current versions of Chrome, Safari, and Edge
- **Real-Time:** Supabase Realtime subscriptions keep schedule data in sync across concurrent users
- **Persistence:** All data persisted in Supabase (PostgreSQL). No local storage dependency.
- **Security:** RLS policies enforce org-scoped access at the database level. JWT claims verified in edge middleware.
- **Deployment:** `apps/web` deploys on Vercel with a Supabase backend; `apps/mobile` ships via Expo
- **Print:** Print output faithful to on-screen layout with configurable options
- **Mobile:** Native Expo / React Native app (`apps/mobile`) plus a responsive web layout with a mobile navigation drawer and day view
- **Integrations:** The platform depends on Stripe, Resend, PostHog, Sentry, Upstash Redis, Vercel Analytics, and Expo push (see §2.4)

---

## 12. API Surface

The web app exposes roughly **110 Route Handlers** under `apps/web/src/app/api/`. The browser reaches them through each feature's `client/api.ts`; the mobile app reaches the `/api/mobile/v1/*` subset. The table below summarizes the surface by area — the exhaustive endpoint list lives in **`docs/api-reference.md`**.

| Area                           | Representative Endpoints                                                                                                                                                                                                                                                                                | Auth                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Public / unauth                | `/api/health`, `/api/validate-domain`, `/api/request-demo`, `/api/consent`, `/api/invitations/lookup`, `/api/invitations/accept`, `/api/notify-impersonation`                                                                                                                                           | Public                                |
| Auth & account                 | `/api/auth/login`, `/api/auth/organizations`, `/api/auth/data-export`, `/api/auth/delete-account`, `/api/auth/gdpr-erase`, `/api/account/identity`, `/api/account/profile`, `/api/account/sessions`, `/api/account/mfa-status`, `/api/account/notification-preferences`, `/api/account/change-requests` | Authenticated                         |
| Organization & onboarding      | `/api/onboarding`, `/api/organization/bootstrap`, `/api/organization/directory`, `/api/organizations/settings`, `/api/organizations/users`, `/api/organizations/role-change`, `/api/organizations/invitations`                                                                                          | Authenticated                         |
| Schedule & shifts              | `/api/schedule/manage`, `/api/schedule/recurring`, `/api/schedule/requests`, `/api/schedule/publish-history`, `/api/shifts/draft-summary`, `/api/shifts/publish`, `/api/shifts/discard`                                                                                                                 | Authenticated                         |
| Employees & people             | `/api/employees/manage`, `/api/employees/status`, `/api/employees/link-user`, `/api/import/employees`, `/api/people/change-requests`                                                                                                                                                                    | Authenticated                         |
| Settings / reports / dashboard | `/api/settings/config`, `/api/reports/operations`, `/api/reports/operations/export`, `/api/dashboard/analytics`, `/api/notifications`, `/api/calendar`, `/api/export`, `/api/test-sandbox`, `/api/billing`                                                                                              | Authenticated                         |
| Stripe billing                 | `/api/stripe/create-checkout`, `/api/stripe/checkout-complete`, `/api/stripe/billing-portal`, `/api/stripe/webhook`                                                                                                                                                                                     | Mixed (webhook is signature-verified) |
| Gridmaster                     | `/api/gridmaster/dashboard`, `/api/gridmaster/accounts`, `/api/gridmaster/users`, `/api/gridmaster/organizations/manage`, `/api/gridmaster/audit-log`, `/api/gridmaster/impersonation`, `/api/gridmaster/billing`, `/api/gridmaster/security`                                                           | Gridmaster                            |
| Mobile API (`/api/mobile/v1`)  | `/bootstrap`, `/auth/login`, `/auth/organization`, `/me/schedule`, `/org/schedule`, `/people`, `/people/[id]/status`, `/profile`, `/notifications`, `/shift-requests`, `/shift-requests/swap-options`, `/push-tokens`, `/session-presence`                                                              | Bearer token                          |

All API routes include:

- **Input validation** via Zod schemas (cross-app contracts in `@dubgrid/contracts`)
- **Rate limiting** via Upstash Redis (`apps/web/src/lib/rate-limit.ts`), including a per-recipient email limiter (`emailTargetLimiter`) on email-sending routes
- **CSRF protection** via Origin header validation (where applicable; e.g. demo, test-sandbox, trial-welcome)
- **Email-header safety** via `sanitizeHeaderValue()` from `apps/web/src/lib/email.ts`; email bodies are rendered from react-email components (`apps/web/src/emails/`)

Server-side data access flows through the `apps/web/src/lib/db/*` barrel; mobile orchestration flows through `@dubgrid/mobile-api-core`. The browser does not query Supabase data tables directly for these domains.

---

## 13. Outstanding Work

### 13.1 Not Yet Implemented

| Feature                      | Priority | Notes                                                                                                                       |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Wing-Scoped User View        | Could    | Staff-role users see only their assigned focus area's schedule                                                              |
| E2E Test Suite               | Should   | Playwright config exists but tests not yet written                                                                          |
| MFA Enrollment & Enforcement | Should   | `/api/account/mfa-status` reports enrollment state; full TOTP enrollment + enforcement for elevated roles still outstanding |
| Failed Login Tracking        | Should   | Account lockout after repeated failed login attempts                                                                        |
| IP Allowlisting              | Could    | Restrict gridmaster access to trusted IPs                                                                                   |

Schedule PDF/CSV export, iCalendar (`.ics`) export, and operations-report export are **implemented** (see FR-17) — they are no longer outstanding work.

### 13.2 Known Issues

- Some pre-existing test failures (AuthProvider, login page, PublicRoute, and role-level property tests)

---

## 14. Resolved Questions

These items were open questions in previous PRD versions and have been resolved during development:

| Question                   | Resolution                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data persistence strategy? | Supabase (PostgreSQL) with RLS. No local storage dependency.                                                                                                                       |
| Multi-user editing?        | Real-time sync via Supabase Realtime. Optimistic locking on `schedule_cells` (version column).                                                                                     |
| Historical schedules?      | Past schedule periods are persisted and viewable by navigating date ranges.                                                                                                        |
| FTE-weighted counts?       | Not yet implemented. Design decision pending.                                                                                                                                      |
| Cross-staff counting?      | Employees belong to multiple focus areas. Shift entries are per-employee per-date.                                                                                                 |
| Authentication & RBAC?     | Fully implemented. Four-tier role hierarchy with granular admin permissions. JWT-based claims.                                                                                     |
| Dashboard analytics?       | Implemented with stat cards, charts, coverage tracking, and expandable detail views.                                                                                               |
| Staff detail views?        | Implemented with tabs: Overview, Schedule, Activity.                                                                                                                               |
| Shift requests?            | Pickup, swap, and call-off requests implemented with admin approval workflow.                                                                                                      |
| Coverage tracking?         | Coverage requirements and status visualization implemented.                                                                                                                        |
| Password reset flow?       | Implemented. Forgot password → email link → reset form with strength meter → sign out.                                                                                             |
| Email verification?        | Implemented. Verification page with resend button (60s cooldown), auto-redirect on confirm.                                                                                        |
| Org setup/onboarding?      | Implemented. Role-aware composite onboarding wizard rendered inline via `OnboardingGate` (the old 8-step wizard and `/setup` route were removed) + invited-user polling page.      |
| Rate limiting?             | Implemented via Upstash Redis on all public API routes.                                                                                                                            |
| Branded emails?            | Authored as react-email components in `apps/web/src/emails/`; `email:build` regenerates the Supabase auth templates. `apps/web/src/lib/email.ts` keeps only header-safety helpers. |
| Mobile app?                | Native Expo / React Native app (`apps/mobile`) covering schedule, people, requests, profile, and notifications, talking to `/api/mobile/v1/*`.                                     |
| Schedule export?           | Implemented. PDF/CSV export, iCalendar (`.ics`) feed, and operations-report export.                                                                                                |
| Monorepo structure?        | npm workspaces + Turborepo. `apps/web`, `apps/mobile`, and ten shared `packages/*`.                                                                                                |
| Third-party integrations?  | Stripe, Resend, PostHog, Sentry, Upstash Redis, Vercel Analytics, and Expo push.                                                                                                   |

---

## 15. Appendix — Naming Conventions

| Layer            | Convention | Examples                                                    |
| ---------------- | ---------- | ----------------------------------------------------------- |
| DB tables        | Full       | `organizations`, `organization_memberships`                 |
| DB columns       | Short      | `org_id`, `org_role`, `org_slug`                            |
| DB functions     | Short      | `caller_org_id()`, `caller_org_role()`, `switch_org()`      |
| DB enum type     | Short      | `org_role`                                                  |
| JWT claims       | Short      | `org_id`, `org_role`, `org_slug`                            |
| TypeScript types | Full       | `Organization`, `OrganizationRole`, `OrganizationUser`      |
| TypeScript vars  | Short      | `orgId`, `orgRole`, `orgSlug`, `orgName`                    |
| Function names   | Mixed      | `fetchOrganizationRoles(orgId)`, `createOrganization(data)` |
| UI text          | Full       | "Organization Details", "Create Organization"               |
| HTTP headers     | Short      | `x-dubgrid-org-id`, `x-dubgrid-org-slug`                    |

---

_DubGrid — Confidential_
