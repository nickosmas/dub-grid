# DubGrid

## Multi-Tenant Employee Scheduling Platform

### Product Requirements Document · v3.0

---

|                     |                                                                     |
| ------------------- | ------------------------------------------------------------------- |
| **Document Status** | Living Document — Reflects Current Implementation                   |
| **Version**         | 3.0                                                                 |
| **Prepared For**    | Development Team                                                    |
| **Date**            | March 2026                                                          |
| **Scope**           | DubGrid — multi-tenant staff scheduling web app for care facilities |

---

## 1. Executive Summary

Care facilities typically manage employee scheduling across multiple wings or departments, often using manually maintained spreadsheets — horizontal grids covering dozens of employees across multiple shift types and sections.

DubGrid is a multi-tenant scheduling platform that replaces spreadsheet-based scheduling. Each tenant (organization) can configure its own focus areas (wings/sections), shift codes, staff roster, and scheduling conventions. The application delivers a modern, polished user experience with real-time collaboration, draft/publish workflows, and a comprehensive role-based access control system.

The system is self-contained with no third-party integrations required.

---

## 2. Technology Stack

| Layer         | Technology                                       |
| ------------- | ------------------------------------------------ |
| Framework     | Next.js 16, React 19, TypeScript                 |
| Styling       | Tailwind CSS v4                                  |
| Database      | Supabase (PostgreSQL + Auth + Realtime + RLS)    |
| Auth          | Supabase Auth with custom JWT claims             |
| SSR           | @supabase/ssr v0.9 for cookie-based SSR sessions |
| State/Cache   | TanStack React Query v5                          |
| Drag & Drop   | @dnd-kit/core for schedule grid interactions     |
| JWT           | jose v6 for JWT verification in middleware        |
| Email         | Resend for invitation emails                     |
| Validation    | Zod for schema validation                        |
| Notifications | Sonner v2 (toast notifications)                  |
| Testing       | Vitest + Testing Library (unit), Playwright (E2E)|
| Deployment    | Vercel                                           |

---

## 3. Background & Current State

### 3.1 Problem Statement

Many care facilities manage employee scheduling through manually maintained spreadsheets. These typically follow a common structure:

- A two-week date range displayed horizontally (Sunday through Saturday, two consecutive weeks)
- Staff listed vertically on the left with their name and designation code
- Each cell contains a shift code (D, E, N, X, etc.) or is blank
- The schedule is divided into labeled sections (wings/departments), each with its own staff rows and count rows
- Some staff members appear in multiple sections due to cross-department assignments
- A printed version includes the print date, date range, and a legend

### 3.2 Multi-Tenant Architecture

DubGrid supports multiple organizations via subdomain-based routing, each with their own configurable structure:

- **Organizations** — Each tenant is an independent organization with its own data, staff, settings, and subdomain (e.g., `acme.dubgrid.com`)
- **Focus Areas** — Each organization defines its own schedule sections (e.g., nursing wings, departments, shift groups). The label "Focus Areas" is customizable per org.
- **Shift Codes** — A default set of shift codes is provided; organizations can customize labels, colors, and add custom codes
- **Shift Categories** — Tally buckets with optional time windows for grouping shift counts
- **Staff Roster** — Each organization maintains its own employee roster with designations, certifications, roles, and focus area assignments
- **Certifications** — Customizable skill levels per organization (label is configurable)
- **Organization Roles** — Custom display roles per organization (label is configurable)
- **Coverage Requirements** — Minimum staffing rules per focus area, shift code, and day of week

### 3.3 Customizable Terminology

Organizations can customize the following labels in their settings:

| Default Term   | DB Field                              | Purpose                            |
| -------------- | ------------------------------------- | ---------------------------------- |
| Focus Areas    | `organizations.focus_area_label`      | Schedule sections / wings          |
| Certifications | `organizations.certification_label`   | Staff skill levels                 |
| Roles          | `organizations.role_label`            | Staff display roles                |

---

## 4. Users & Roles

### 4.1 Role Hierarchy

DubGrid implements a four-tier RBAC system with JWT-based claims enforced at both the edge middleware and database (RLS) levels.

| Tier | Role         | Scope    | Who                      | Capabilities                                                                                |
| ---- | ------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| 4    | Gridmaster   | Platform | Platform owner           | Global god mode — all orgs, all data, impersonation, user management, audit logs            |
| 3    | Super Admin  | Org      | Org owner                | Full org access — all settings, user management, permission configuration, schedule publish  |
| 2    | Admin        | Org      | Org operations staff     | Configurable permissions — granular access set per-user by super admin                      |
| 0    | User         | Org      | Staff / read-only users  | View schedule and staff only (canViewSchedule + canViewStaff always true)                   |

### 4.2 Admin Permissions (Granular, per-user)

Admins receive a configurable set of permissions stored as JSONB in `organization_memberships.admin_permissions`. All default to `false` except canViewSchedule and canViewStaff (always true for all roles).

| Category   | Permission                       | Delegatable | Description                                           |
| ---------- | -------------------------------- | ----------- | ----------------------------------------------------- |
| Schedule   | `canViewSchedule`                | Always on   | View the schedule grid (always true)                  |
| Schedule   | `canEditShifts`                  | Yes         | Create, edit, delete shift entries                    |
| Schedule   | `canPublishSchedule`             | Yes         | Publish draft changes                                 |
| Schedule   | `canApplyRecurringSchedule`      | Yes         | Apply recurring shift templates                       |
| Notes      | `canEditNotes`                   | Yes         | Manage schedule notes/indicators                      |
| Recurring  | `canManageRecurringShifts`       | Yes         | Configure recurring shift templates                   |
| Recurring  | `canManageShiftSeries`           | Yes         | Manage repeating shift series                         |
| Staff      | `canViewStaff`                   | Always on   | View staff roster (always true)                       |
| Staff      | `canManageEmployees`             | Yes         | Add, edit, bench, terminate employees                 |
| Config     | `canManageFocusAreas`            | Yes         | Manage focus areas / wings                            |
| Config     | `canManageShiftCodes`            | Yes         | Manage shift code definitions                         |
| Config     | `canManageIndicatorTypes`        | Yes         | Manage note/indicator type definitions                |
| Config     | `canManageOrgLabels`             | Yes         | Edit custom terminology labels                        |
| Config     | `canManageOrgSettings`           | No          | Edit org name, address, phone, employee count, timezone (super_admin only) |
| Coverage   | `canManageCoverageRequirements`  | Yes         | Manage minimum staffing requirements                  |
| Requests   | `canApproveShiftRequests`        | Yes         | Approve or reject shift pickup/swap requests          |

**Super Admin-only (never delegatable to admins):** `canManageUsers`, `canConfigureAdminPermissions`, `canManageOrgSettings`

### 4.3 Authentication Flow

- Email/password authentication via Supabase Auth
- Custom JWT access token hook writes claims at top level of JWT payload: `platform_role`, `org_role`, `org_id`, `org_slug`
- Edge middleware verifies JWT, calculates effective role, and enforces route-level access
- Subdomain routing ensures users stay within their org context
- Invitation-only registration with 72-hour expiry tokens

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

**Shift codes support:** custom colors (background, text, border), default start/end times, certification requirements, off-day designation, and assignment to shift categories for tally grouping.

---

## 6. Staff Designations & Roles

Each staff member carries one primary designation code and may carry one or more role tags. Organizations define their own certifications and roles via Settings.

| Code                   | Title                  | Notes                                                            |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| `JLCSN`                | Journal Listed CSN          | Core certification level; most staff carry this designation      |
| `DCSN`                 | Director CSN           | Director-level CSN; senior clinical oversight                    |
| `DVCSN`                | Director VCSN          | Director of Visiting CS Nursing                                  |
| `CSN III`              | CSN Level III          | Mid-tier CSN designation                                         |
| `CSN II`               | CSN Level II           | Entry-tier CSN designation                                       |
| `STAFF`                | General Staff          | Non-designated floor staff                                       |
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

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Schedule Grid           | Must     | ✅     | 1-week, 2-week, and month view. Staff rows × date columns with shift code cells. Toggle between views via toolbar.     |
| FR-02 | Focus Area Sections     | Must     | ✅     | Configurable sections with color-coded headers. Filter by focus area in toolbar. Each org defines its own sections.     |
| FR-03 | Shift Code Entry        | Must     | ✅     | Click cell to open shift edit panel. Select from org's configured shift codes. Supports custom times per entry.         |
| FR-04 | Cross-Wing Staff        | Must     | ✅     | Employees can be assigned to multiple focus areas. Grid displays assignments per focus area with filtering.             |
| FR-05 | Shift Count Row         | Must     | ✅     | Auto-calculated tally rows per section. Shift codes are grouped by shift category; counts appear at the bottom of each focus area section. |
| FR-06 | Seniority Sorting       | Must     | ✅     | Staff rows sortable by seniority within focus areas.                                                                   |
| FR-07 | Staff Designations      | Must     | ✅     | Each employee stores certifications and roles. Displayed in staff view and grid name column.                           |
| FR-08 | Skills / Role Tags      | Must     | ✅     | Certifications and roles are configurable per org. Employees tagged with multiple certifications and roles.            |
| FR-11 | Print Layout            | Must     | ✅     | Print-optimized view with customizable options. Select focus areas and date range. Landscape format with legend.        |
| FR-12 | Schedule Legend          | Must     | ✅     | Legend displaying all shift codes with colors. Included in print view via PrintLegend component.                       |
| FR-13 | Staff Management        | Must     | ✅     | Full CRUD: add (bulk import), edit, bench, activate, terminate employees. Status tracking with timestamps and notes.   |
| FR-14 | Date Navigation         | Must     | ✅     | Back/Today/Forward buttons in toolbar. Steps by active view span. Month view calendar navigation.                      |
| FR-15 | Focus Area Filter       | Must     | ✅     | Filter schedule view by focus area: All or any individual section. Staff search within filtered view.                  |
| FR-16 | Print Date Header       | Must     | ✅     | Printed schedules include organization name, print date, and schedule date range.                                      |
| FR-17 | No Integrations         | Must     | ✅     | System operates standalone. All data in Supabase. No third-party APIs or external dependencies.                        |

### 7.2 Draft/Publish Workflow

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-20 | Draft Mode              | Must     | ✅     | All schedule edits are initially drafts. Visual distinction between draft and published shifts.                         |
| FR-21 | Publish Changes         | Must     | ✅     | Super admins and permitted admins can publish all draft changes for a date range. Confirmation dialog before publish.   |
| FR-22 | Discard Drafts          | Must     | ✅     | Cancel/rollback all unpublished draft changes.                                                                         |
| FR-23 | Draft Recovery          | Should   | ✅     | Draft sessions saved to DB. Can recover unsaved drafts across browser sessions. Draft banner shows change count.       |

### 7.3 Recurring Schedules

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-24 | Recurring Shifts        | Should   | ✅     | Define recurring shift templates per employee. Apply recurring schedule to a date range.                               |
| FR-25 | Shift Series            | Should   | ✅     | Create repeating shift series: daily, weekly, or biweekly. Configurable start/end dates and occurrence limits.         |
| FR-26 | Apply Recurring Schedule | Should  | ✅     | One-click apply of recurring shift templates to selected date range. Requires `canApplyRecurringSchedule` permission.  |

### 7.4 Notes & Indicators

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-19 | Shift Notes             | Could    | ✅     | Schedule notes/indicators per cell with focus area scoping. Configurable indicator types. Draft/published status.       |

### 7.5 Real-Time Collaboration

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-27 | Real-Time Sync          | Should   | ✅     | Schedule changes sync across tabs and users in real-time via Supabase Realtime subscriptions.                          |
| FR-28 | Tab Coordination        | Should   | ✅     | Cross-tab communication for session state consistency.                                                                 |
| FR-29 | Cell Locks              | Should   | ✅     | Real-time cell lock/occupancy tracking. Shows which user is currently editing a cell.                                  |
| FR-30 | Presence Avatars        | Should   | ✅     | Active user presence indicators showing who is currently viewing the schedule.                                          |

### 7.6 Staff Schedule View

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-18 | Staff Schedule View     | Should   | 🔨     | Users with `user` role can view the schedule in read-only mode. Full per-wing scoped view not yet implemented.        |

### 7.7 Dashboard & Analytics

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-31 | Dashboard Overview      | Should   | ✅     | Main dashboard with KPI stat cards (total hours, active employees, open shifts, coverage rate).                         |
| FR-32 | Coverage by Section     | Should   | ✅     | Donut chart showing coverage status breakdown per focus area.                                                           |
| FR-33 | Open Shifts Card        | Should   | ✅     | Card listing uncovered/open shifts that need attention.                                                                 |
| FR-34 | Staff Hours Card        | Should   | ✅     | Total hours and trends visualization across the schedule period.                                                        |
| FR-35 | Shift Breakdown         | Should   | ✅     | Shift code distribution chart showing how shifts are allocated.                                                         |
| FR-36 | Activity Feed           | Should   | ✅     | Recent activity feed showing schedule changes, publishes, and user actions.                                             |
| FR-37 | Expanded Views          | Could    | ✅     | Each dashboard card expands to a detailed full-page view for deeper analysis.                                           |

### 7.8 Staff Detail Page

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-38 | Staff Detail Overview   | Should   | ✅     | Full employee profile page with personal info, certifications, focus areas, and status.                                |
| FR-39 | Staff Schedule Tab      | Should   | ✅     | Historical schedule view for an individual employee with date range filtering.                                          |
| FR-40 | Staff Activity Tab      | Should   | ✅     | Employee activity timeline showing status changes, role changes, and events.                                            |
| FR-41 | Staff Reports Tab       | Should   | ❌     | Hours reports, shift distribution charts, day-of-week patterns, and focus area distribution. Not yet implemented.      |

### 7.9 Shift Requests

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-42 | Shift Pickup Requests   | Could    | ✅     | Employees can request to pick up open shifts. Admins approve/reject via shift request board.                           |
| FR-43 | Shift Swap Requests     | Could    | ✅     | Employees can propose shift swaps with colleagues. Lifecycle: open → pending_approval → approved/rejected/cancelled/expired. |
| FR-44 | Shift Request Board     | Could    | ✅     | Admin view for managing all shift requests with filtering by status and type.                                           |

### 7.10 Coverage & Staffing

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-45 | Coverage Requirements   | Should   | ✅     | Define minimum staffing levels per focus area, shift code, and day of week.                                            |
| FR-46 | Coverage Status         | Should   | ✅     | Visual coverage panel showing actual vs. required staffing with met/unmet indicators.                                  |

### 7.11 Gridmaster Portal

| ID    | Feature                 | Priority | Status | Description                                                                                                            |
| ----- | ----------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| FR-50 | Gridmaster Dashboard    | Must     | ✅     | Platform-wide overview with organization stats, health metrics, and recent activity.                                   |
| FR-51 | Organization Management | Must     | ✅     | Create, view, and manage organizations. Organization detail view with member counts and settings.                      |
| FR-52 | All Users View          | Must     | ✅     | Platform-wide user table across all organizations with search and filtering.                                            |
| FR-53 | Audit Log               | Must     | ✅     | Global audit trail of all role changes with immutable history.                                                          |
| FR-54 | Admin Permissions Editor| Must     | ✅     | Configure granular per-admin permissions via checkbox UI. Used by super_admin and gridmaster.                           |
| FR-55 | User Impersonation      | Should   | ✅     | Gridmaster can impersonate org users with 30-minute session expiry. Full audit trail.                                  |

---

## 8. Data Model

### 8.1 Core Tables

| Entity                      | Key Fields                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `organizations`             | id, name, slug, address, phone, timezone, employee_count, focus_area_label, certification_label, role_label |
| `profiles`                  | id (FK auth.users), org_id, platform_role (enum), version, role_locked                               |
| `organization_memberships`  | user_id, org_id, org_role (enum), admin_permissions (JSONB), joined_at                               |
| `employees`                 | id, org_id, name, status (active/benched/terminated), certifications[], roles[], focus_areas[], phone, email, seniority_rank, user_id (FK auth.users, nullable) |
| `shifts`                    | emp_id, date (composite PK), org_id, draft_shift_code_ids[], published_shift_code_ids[], draft_is_delete, version (optimistic lock), series_id, from_recurring, custom_start_time, custom_end_time, focus_area_id |
| `focus_areas`               | id, org_id, name, color, display_order, break_duration_minutes                                       |
| `shift_codes`               | id, org_id, code, label, bg_color, text_color, border_color, default_start_time, default_end_time, is_off_day, certification_id, category_id |
| `shift_categories`          | id, org_id, name, time_window_start, time_window_end, display_order                                 |
| `schedule_notes`            | id, org_id, employee_id, date, focus_area_id, indicator_type_id, text, status (draft/published)     |
| `indicator_types`           | id, org_id, name, color, icon                                                                        |
| `certifications`            | id, org_id, name, abbreviation                                                                       |
| `organization_roles`        | id, org_id, name, abbreviation                                                                       |
| `recurring_shifts`          | id, org_id, emp_id, shift_code_id, day_of_week (0-6), effective_from, effective_until                |
| `shift_series`              | id, org_id, employee_id, shift_code_id, recurrence (daily/weekly/biweekly), start_date, end_date, max_occurrences |
| `coverage_requirements`     | id, org_id, focus_area_id, shift_code_id, day_of_week, min_staff                                    |
| `shift_requests`            | id, org_id, type (pickup/swap), status (open/pending_approval/approved/rejected/cancelled/expired), requester_emp_id, target_emp_id, shift dates, shift codes |

### 8.2 RBAC & Security Tables

| Entity                      | Key Fields                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `role_change_log`           | id, changed_by, target_user_id, old_role, new_role, org_id, idempotency_key (UNIQUE), created_at    |
| `jwt_refresh_locks`         | user_id, locked_until (blocks JWT refresh for 5s after role change)                                  |
| `invitations`               | id, org_id, email, employee_id (FK), invited_by, token, expires_at (72h), accepted_at               |
| `impersonation_sessions`    | id, gridmaster_id, target_user_id, org_id, started_at, expires_at (30min)                           |
| `user_sessions`             | id, user_id, device_label, ip_address, last_active_at, refresh_token_hash                           |

### 8.3 Database Security

- **Row-Level Security (RLS):** All tables have RLS policies enforcing org-scoped data access
- **Custom JWT claims:** `platform_role`, `org_role`, `org_id`, `org_slug` written at JWT top level by access token hook
- **Optimistic locking:** `shifts` table uses a `version` column to prevent concurrent overwrites
- **Idempotency:** Role changes and shift operations use idempotency keys to prevent duplicate writes
- **4-file migration strategy:** All schema in 001_schema.sql, 002_functions_triggers.sql, 003_rls_policies.sql, 004_grants.sql

---

## 9. Architecture

### 9.1 Multi-Tenant Routing

Organizations are routed via subdomains:
- `acme.dubgrid.com` → Organization "Acme" schedule
- `dubgrid.com` → Landing page / login
- `gridmaster.dubgrid.com` → Gridmaster command center

Edge middleware (`middleware.ts`) enforces:
- JWT verification and role calculation
- Subdomain-to-org matching
- Route-level access control (`/staff` and `/settings` → admin+, `/gridmaster` → gridmaster only)
- Header injection (`x-dubgrid-role`, `x-dubgrid-org-id`, `x-dubgrid-org-slug`)

### 9.2 Application Routes

| Route                    | Access Level    | Purpose                                                    |
| ------------------------ | --------------- | ---------------------------------------------------------- |
| `/`                      | Public          | Landing page                                               |
| `/login`                 | Public          | Organization user login                                    |
| `/gridmaster/login`      | Public          | Gridmaster platform login                                  |
| `/accept-invite`         | Public          | Invitation acceptance flow                                 |
| `/onboarding`            | Authenticated   | New user onboarding                                        |
| `/dashboard`             | Authenticated   | Organization dashboard with analytics                      |
| `/schedule`              | Authenticated   | Main schedule grid                                         |
| `/schedules`             | Authenticated   | Redirect alias to `/schedule`                              |
| `/staff`                 | Admin+          | Staff roster management                                    |
| `/staff/[id]`            | Admin+          | Individual staff member detail (tabs: Overview, Schedule, Activity)          |
| `/settings`              | Admin+          | Organization configuration                                 |
| `/profile`               | Authenticated   | User profile settings                                      |
| `/gridmaster`            | Gridmaster      | Platform command center                                    |
| `/privacy`               | Public          | Privacy policy                                             |
| `/terms`                 | Public          | Terms of service                                           |

### 9.3 Key Application Files

| File                              | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `src/app/schedule/page.tsx`       | Main scheduler UI — grid, toolbar, DND                     |
| `src/app/dashboard/page.tsx`      | Organization dashboard with analytics                      |
| `src/app/staff/page.tsx`          | Staff roster management                                    |
| `src/app/staff/[id]/page.tsx`     | Staff detail page with tabbed views                        |
| `src/app/settings/page.tsx`       | Organization settings (terminology, shift codes, etc.)     |
| `src/app/gridmaster/page.tsx`     | Gridmaster command center                                  |
| `src/app/login/page.tsx`          | Auth login with org subdomain validation                   |
| `src/app/accept-invite/page.tsx`  | Invitation acceptance flow                                 |
| `src/lib/db.ts`                   | Data access layer                                          |
| `src/lib/supabase.ts`             | Lazy browser Supabase client via Proxy pattern             |
| `src/lib/schedule-logic.ts`       | Schedule grid calculations and shift resolution            |
| `src/lib/dashboard-stats.ts`      | Dashboard KPI calculations                                 |
| `src/lib/staff-detail-stats.ts`   | Staff detail analytics                                     |
| `src/types/index.ts`              | All domain + RBAC TypeScript types                         |
| `src/hooks/usePermissions.ts`     | JWT claim parsing + DB admin permission fetching           |
| `src/hooks/useOrganizationData.ts`| Org, focus areas, shift codes, coverage data               |
| `src/hooks/useEmployees.ts`       | Employee list with filtering                               |
| `src/hooks/useCellLocks.ts`       | Real-time cell lock tracking                               |
| `middleware.ts`                   | Edge middleware for RBAC + subdomain routing                |

### 9.4 Component Architecture

```
AppShell.tsx (root layout — sidebar, header, navigation)
├── Header.tsx (top navigation bar)
├── MobileNavSheet.tsx (mobile navigation drawer)
│
├── DashboardView.tsx (organization dashboard)
│   ├── StatCardsRow.tsx (KPI cards)
│   ├── CoverageBySectionCard.tsx (coverage by section donut chart)
│   ├── OpenShiftsCard.tsx
│   ├── StaffHoursCard.tsx
│   ├── ShiftBreakdownCard.tsx
│   ├── ActivityFeed.tsx
│   └── expanded/*.tsx (expanded detail views)
│
├── ScheduleGrid.tsx (employee × date grid with DND)
│   ├── DraggableShift.tsx / DroppableCell.tsx
│   ├── ShiftEditPanel.tsx (shift code picker, notes)
│   ├── ShiftContextMenu.tsx (right-click actions)
│   ├── RepeatForm.tsx (shift series creation)
│   ├── DraftBanner.tsx (draft change count + publish/cancel)
│   ├── CoveragePanel.tsx (coverage status)
│   └── PresenceAvatars.tsx (active users)
│
├── MonthView.tsx (calendar month view)
│
├── StaffView.tsx (employee roster management)
│   ├── StaffToolbar.tsx (search, filter, sort)
│   ├── StaffTableRow.tsx
│   ├── AddEmployeeModal.tsx
│   ├── EditEmployeePanel.tsx
│   ├── InviteEmployeeModal.tsx
│   └── StaffDetailPanel.tsx (side panel)
│
├── StaffDetailPage.tsx (individual staff member)
│   ├── StaffDetailHeader.tsx (avatar, name, status)
│   ├── OverviewTab.tsx (profile, certs, focus areas)
│   ├── ScheduleTab.tsx (historical schedule)
│   ├── ActivityTab.tsx (timeline)
│   └── (ReportsTab planned — not yet implemented)
│
├── SettingsPage.tsx (org configuration)
│
├── ShiftRequestBoard.tsx / ShiftSwapModal.tsx
│
├── PrintOptionsModal.tsx + PrintScheduleView.tsx + PrintLegend.tsx
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
├── CreateOrganizationForm.tsx (new org registration)
└── EnhancedImpersonation.tsx (impersonate org users)
```

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

- Full-page employee profile view at `/staff/[id]`
- Header: avatar, name, status badge, certifications
- Tabs: Overview, Schedule, Activity
- Overview: personal info, focus areas, roles, certifications
- Schedule: historical shift view with date range picker
- Activity: status change timeline, events
- Reports tab planned but not yet implemented

### 10.6 Print View

- Landscape orientation with customizable options
- Select which focus areas and date range to include
- Header: organization name, printed date, schedule date range
- Legend with all shift codes and their colors
- Optimized font sizing for legibility

### 10.7 Toolbar

- Date range navigator: back / today / forward (steps by active view span)
- View toggle: 1W / 2W / Month
- Focus area filter: All or any configured section
- Staff search within active filter
- Apply Recurring Schedule button (permission-gated)
- Print button
- Edit mode toggle

---

## 11. Non-Functional Requirements

- **Performance:** Schedule grid for 50+ employees over 14 days must render in under 1 second
- **Compatibility:** Must work in current versions of Chrome, Safari, and Edge
- **Real-Time:** Supabase Realtime subscriptions keep schedule data in sync across concurrent users
- **Persistence:** All data persisted in Supabase (PostgreSQL). No local storage dependency.
- **Security:** RLS policies enforce org-scoped access at the database level. JWT claims verified in edge middleware.
- **Deployment:** Deployable on Vercel with Supabase backend
- **Print:** Print output faithful to on-screen layout with configurable options
- **Mobile:** Responsive design with mobile navigation drawer and day view
- No external API calls or third-party data dependencies

---

## 12. API Surface

DubGrid uses a thin API surface, with most operations going directly through the Supabase client (RLS-protected):

| Endpoint                         | Method | Purpose                                           |
| -------------------------------- | ------ | ------------------------------------------------- |
| `/api/validate-domain`           | GET    | Check if org subdomain slug is available           |
| `/api/send-invite-email`         | POST   | Send invitation email via Resend                   |
| Supabase RPC: `change_user_role` | POST   | Change user's organization role (with idempotency) |

All other CRUD operations use Supabase client-side queries protected by Row-Level Security policies.

---

## 13. Outstanding Work

### 13.1 Not Yet Implemented

| Feature                  | Priority | Notes                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------ |
| Wing-Scoped User View   | Could    | Staff-role users see only their assigned focus area's schedule                 |
| E2E Test Suite           | Should   | Playwright config exists but tests not yet written                             |
| Onboarding Flow          | Should   | New org setup wizard (currently a minimal placeholder)                         |
| Mobile Responsive Polish | Could    | Grid further optimized for smaller viewports                                  |
| MFA for Elevated Roles   | Should   | TOTP enforcement for gridmaster and super_admin accounts                      |
| CSV/PDF Export           | Could    | Export schedule data and staff reports to CSV/PDF                              |

### 13.2 Known Issues

- Some pre-existing test failures (AuthProvider, login page, PublicRoute, and role-level property tests)

---

## 14. Resolved Questions

These items were open questions in previous PRD versions and have been resolved during development:

| Question                         | Resolution                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Data persistence strategy?       | Supabase (PostgreSQL) with RLS. No local storage dependency.                                  |
| Multi-user editing?              | Real-time sync via Supabase Realtime. Optimistic locking on shifts (version column).          |
| Historical schedules?            | Past schedule periods are persisted and viewable by navigating date ranges.                   |
| FTE-weighted counts?             | Not yet implemented. Design decision pending.                                                 |
| Cross-staff counting?            | Employees belong to multiple focus areas. Shift entries are per-employee per-date.            |
| Authentication & RBAC?           | Fully implemented. Four-tier role hierarchy with granular admin permissions. JWT-based claims. |
| Dashboard analytics?             | Implemented with stat cards, charts, coverage tracking, and expandable detail views.          |
| Staff detail views?              | Implemented with tabs: Overview, Schedule, Activity. Reports tab planned.                     |
| Shift requests?                  | Pickup and swap requests implemented with admin approval workflow.                            |
| Coverage tracking?               | Coverage requirements and status visualization implemented.                                   |

---

## 15. Appendix — Naming Conventions

| Layer              | Convention | Examples                                                      |
| ------------------ | ---------- | ------------------------------------------------------------- |
| DB tables          | Full       | `organizations`, `organization_memberships`                   |
| DB columns         | Short      | `org_id`, `org_role`, `org_slug`                              |
| DB functions       | Short      | `caller_org_id()`, `caller_org_role()`, `switch_org()`        |
| DB enum type       | Short      | `org_role`                                                    |
| JWT claims         | Short      | `org_id`, `org_role`, `org_slug`                              |
| TypeScript types   | Full       | `Organization`, `OrganizationRole`, `OrganizationUser`        |
| TypeScript vars    | Short      | `orgId`, `orgRole`, `orgSlug`, `orgName`                      |
| Function names     | Mixed      | `fetchOrganizationRoles(orgId)`, `createOrganization(data)`   |
| UI text            | Full       | "Organization Details", "Create Organization"                 |
| HTTP headers       | Short      | `x-dubgrid-org-id`, `x-dubgrid-org-slug`                     |

---

_DubGrid — Confidential_
