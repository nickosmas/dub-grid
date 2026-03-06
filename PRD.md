# DubGrid

## Multi-Tenant Employee Scheduling Platform

### Product Requirements Document · v1.0

---

|                     |                                                                     |
| ------------------- | ------------------------------------------------------------------- |
| **Document Status** | Draft — For Development Handoff                                     |
| **Version**         | 1.0                                                                 |
| **Prepared For**    | Development Team                                                    |
| **Date**            | March 2026                                                          |
| **Scope**           | DubGrid — multi-tenant staff scheduling web app for care facilities |

---

## 1. Executive Summary

Care facilities typically manage employee scheduling across multiple wings or departments, often using manually maintained spreadsheets — horizontal grids covering dozens of employees across multiple shift types and sections.

This document defines the requirements for DubGrid, a multi-tenant scheduling platform that replaces spreadsheet-based scheduling. Each tenant (organization) can configure its own wings/sections, shift codes, staff roster, and scheduling conventions. The application delivers a modern, polished user experience that feels like a real application rather than a spreadsheet.

The system is self-contained with no third-party integrations required.

---

## 2. Background & Current State

### 2.1 Problem Statement

Many care facilities manage employee scheduling through manually maintained spreadsheets. These typically follow a common structure:

- A two-week date range displayed horizontally (Sunday through Saturday, two consecutive weeks)
- Staff listed vertically on the left with their name and designation code
- Each cell contains a shift code (D, E, N, X, etc.) or is blank
- The schedule is divided into labeled sections (wings/departments), each with its own staff rows and count rows
- Some staff members appear in multiple sections due to cross-department assignments
- A printed version includes the print date, date range, and a legend

### 2.2 Multi-Tenant Architecture

DubGrid supports multiple organizations, each with their own configurable structure:

- **Organizations** — Each tenant is an independent organization with its own data, staff, and settings
- **Wings/Sections** — Each organization defines its own set of schedule sections (e.g., nursing wings, departments, shift groups)
- **Shift Codes** — A default set of shift codes is provided; organizations can customize labels and add custom codes
- **Staff Roster** — Each organization maintains its own employee roster with designations, roles, and wing assignments

### 2.3 Default Schedule Sections (Configurable per Organization)

Organizations commonly structure their schedules into sections such as:

| Section Example      | Shift Types              | Notes                                                                           |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Primary Nursing Wing | Day, Evening             | Main section; largest staff count; includes supervisors, mentors, charge nurses |
| Night Shift          | Night                    | Dedicated overnight team                                                        |
| Visiting Nurses      | VN (Visiting Nurse)      | Staff assigned visiting nurse duties; may overlap with other sections           |
| Secondary Wing       | Day (SCD), Evening (SCE) | Cross-wing section; staff may appear here and in primary wing                   |

### 2.4 Key Scheduling Conventions

- Staff may appear in multiple sections in the same week (cross-wing)
- Orientation/shadow shifts are denoted with parentheses around the code, e.g. `(D)` — they do not count toward staffing totals
- Supervisors take specific shift codes (Ds/Es/Ns) distinct from general staff (D/E/N)
- Charge Nurse shifts are coded as `Dcn` or `Ecn`
- Part-time staff carry a fractional FTE weight (e.g., 0.3) displayed inline with their name
- Count rows at the bottom of each section auto-tally Day, Evening, and Night coverage per date

---

## 3. Product Goals

### 3.1 Primary Goals

- Replace spreadsheet-based scheduling with DubGrid, a polished multi-tenant web application
- Support configurable scheduling logic, shift code vocabulary, and layout conventions per organization
- Make schedule creation and editing significantly faster than manual spreadsheet editing
- Support clean printed output matching common scheduling print formats
- Operate with zero third-party dependencies or integrations

### 3.2 Non-Goals (Out of Scope)

- No payroll processing or time-clock integration
- No BambooHR or any HR system integration
- No mobile native app (web app responsive design is acceptable)
- No automated shift-filling or AI-based scheduling suggestions
- No employee-facing shift swapping or request workflows
- No real-time multi-user conflict resolution

---

## 4. Users & Roles

| Role              | Who                         | Capabilities                                                                              |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Super Admin       | Platform owner / IT         | Full access to all organizations, settings, user management, and all schedule sections    |
| Admin / Scheduler | Org operations manager      | Full access: create/edit/delete schedules, manage staff roster, print, configure settings |
| Supervisor        | Wing/department supervisors | View all schedules; limited edit access for their wing; cannot manage staff roster        |
| Staff (Read-Only) | Employees                   | View their own schedule and their section's current and upcoming schedule; no edit access |

---

## 5. Shift Code Reference

All codes below are provided as defaults and must be supported as valid cell values in DubGrid. Organizations can customize labels and add custom codes.

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

**Codes that count toward staffing totals:**

- **COUNT DAY:** `D`, `Ds`, `Dcn`, `SCD` — `(D)` excluded
- **COUNT EVE:** `E`, `Es`, `Ecn`, `SCE` — `(E)` excluded
- **COUNT NIGHT:** `N`, `Ns` — `(N)` excluded
- Orientation codes `(D)`, `(E)`, `(N)` are visually distinct and never counted

---

## 6. Staff Designations & Roles

Each staff member carries one primary designation code and may carry one or more role tags.

| Code                   | Title                  | Notes                                                            |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| `JLCSN`                | Job Level CSN          | Core certification level; most staff carry this designation      |
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

## 7. Functional Requirements

Priority levels: **Must** = required for launch, **Should** = high priority, **Could** = nice-to-have.

| ID    | Feature             | Priority | Description                                                                                                                                                                 |
| ----- | ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| FR-01 | Schedule Grid       | Must     | Display a horizontal two-week grid (Sun–Sat × 2) as the default view, with a toggle to collapse to a single-week view.                                                      |
| FR-02 | Schedule Sections   | Must     | Support configurable schedule sections rendered as separate, labeled blocks within each organization.                                                                       |
| FR-03 | Shift Code Entry    | Must     | Allow entry of all defined shift codes per cell: D, E, N, X, Ds, Es, Ns, Dcn, Ecn, SCD, SCE, VN, V, Ofc, T, A, (D), (E), (N), 0.3, E/Ns. Organizations can extend this set. |
| FR-04 | Cross-Wing Staff    | Must     | Staff who appear in multiple wings must be visually linked. A "Ghost Shift" indicator should show cross-wing assignments on a single row.                                   |
| FR-05 | Shift Count Row     | Must     | Each section must auto-calculate and display COUNT rows: Count Day, Count Eve, and/or Count Night as applicable per section.                                                |
| FR-06 | Seniority Sorting   | Must     | Staff rows must be sortable by seniority (hire date / seniority rank), defaulting to most senior at top.                                                                    |
| FR-07 | Staff Designations  | Must     | Each staff record must store and display designation codes (JLCSN, DCSN, CSN III, etc.) and role tags (Supv, Mentor, CN, SC. Mgr., etc.).                                   |
| FR-08 | Skills / Role Tags  | Must     | Support tagging staff with role qualifiers: Mentor, Supervisor, Charge Nurse, Activity Coordinator, Visiting CS Nurse, Part-time (with FTE weight).                         |
| FR-09 | Orientation Mode    | Must     | Cells marked as orientation/shadowing (parenthetical codes like `(D)`) must render distinctly and not count toward staffing counts.                                         |
| FR-10 | Part-Time Weight    | Must     | Part-time staff (e.g., 0.3 FTE) must display their FTE fraction and be configurable per employee.                                                                           |
| FR-11 | Print Layout        | Must     | Provide a print-optimized view matching the original two-week horizontal format, including all sections, shift counts, and a legend. Must support landscape printing.       |
| FR-12 | Schedule Legend     | Must     | A legend mapping all shift codes and visual indicators must be visible on-screen and included in the print layout.                                                          |
| FR-13 | Staff Management    | Must     | Admin can add, edit, and deactivate staff. Fields: full name, designation, role tags, skills, FTE, wing assignment, seniority rank, hire date.                              |
| FR-14 | Date Navigation     | Must     | Users can navigate backward and forward by the current view span (1 or 2 weeks). A "Today" button returns to the current period.                                            |
| FR-15 | Wing Filter         | Must     | Users can filter the schedule view by wing/section: All, or any individual section configured for the organization.                                                         |
| FR-16 | Print Date Header   | Must     | Printed schedules must include the printed date and the schedule date range in the header (e.g., `printed: 1/26                                                             | Feb 22 – Mar 7`). |
| FR-17 | No Integrations     | Must     | The system must operate fully standalone with no third-party integrations, APIs, or external data dependencies.                                                             |
| FR-18 | Staff Schedule View | Should   | Staff members can view their own schedule for the current and upcoming period in a read-only view (to be enforced via RBAC in a future phase).                              |
| FR-19 | Shift Notes         | Could    | Allow a freeform note per cell (e.g., "covers SN if SC short") that displays as a tooltip or inline annotation.                                                             |

---

## 8. Data Model

| Entity           | Key Fields                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Employee`       | id, name, designation, roles[], skills[], fte_weight, wing, seniority_rank, hire_date, is_active                   |
| `SchedulePeriod` | id, start_date (Sunday), end_date (Saturday+13), label                                                             |
| `ShiftEntry`     | id, employee_id, date, shift_code, section, is_orientation, notes                                                  |
| `Section`        | id, organization_id, name, display_order, shift_types                                                              |
| `ShiftCode`      | id, organization_id, code, label, counts_toward_day, counts_toward_eve, counts_toward_night, is_off, is_cross_wing |
| `StaffCount`     | Derived. Computed per section per date from ShiftEntry records filtered by shift type.                             |

### 8.1 Cross-Wing Logic

A staff member may have `ShiftEntry` records in multiple sections for the same date. The UI must:

- Show the primary section assignment on the main schedule row
- Show a cross-wing indicator (Ghost Shift) in the alternate section row for the same employee
- Staffing counts in each section must only count the shift if the employee is actively assigned to that section on that date

---

## 9. UI & UX Requirements

### 9.1 Schedule Grid

- Two-week view is the default; single-week toggle available in the toolbar
- Columns represent dates (Sun–Sat); rows represent staff members
- Each section is a visually distinct labeled block within the same scrollable view
- Today's date column is highlighted
- Staff rows alternate in subtle background shading for readability
- Clicking a cell opens a shift picker with all valid codes

### 9.2 Staff Name Column

- Displays: full name, designation code, role tags (e.g., Supv, Mentor)
- FTE weight shown for part-time staff (e.g., `0.3`)
- Seniority rank shown (e.g., #1, #2...) with most senior at top

### 9.3 Count Rows

- Pinned at the bottom of each section
- Auto-calculated from shift entries in real time
- Labeled: COUNT DAY / COUNT EVE / COUNT NIGHT per section as applicable

### 9.4 Print View

- Landscape orientation
- Header: organization name, printed date, schedule date range
- All sections included with their count rows
- Legend printed at the bottom: shift codes and visual indicators
- Font size adjusted for legibility when printed

### 9.5 Toolbar

- Date range navigator: back / today / forward (steps by active view span)
- View toggle: 1W / 2W
- Wing filter: All / or any configured section for the organization
- Print button
- Add Staff button (admin only)

---

## 10. Non-Functional Requirements

- **Performance:** Schedule grid for 50+ employees over 14 days must render in under 1 second
- **Compatibility:** Must work in current versions of Chrome, Safari, and Edge
- No external API calls or third-party data dependencies
- Data must persist between sessions (local storage, IndexedDB, or a lightweight backend)
- Must be deployable as a standalone web app with no proprietary cloud dependency
- Print output must be faithful to the on-screen layout

---

## 11. Future Phases

The following capabilities are explicitly out of scope for the initial launch but are confirmed for future implementation. Development decisions for Phase 1 should not preclude or complicate these additions.

### 11.1 Authentication & Role-Based Access Control (RBAC)

Authentication and a comprehensive RBAC system will be implemented in a future phase. The intended access model:

| Role              | Who                         | Intended Permissions                                                                          |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| Super Admin       | Platform owner / IT         | Full access to all organizations, data, settings, user management, and all schedule sections  |
| Scheduler / Admin | Org operations manager      | Create, edit, and publish schedules; manage full staff roster; access all sections            |
| Supervisor        | Wing/department supervisors | View all schedules; edit shifts within their assigned wing/section only; cannot manage roster |
| Staff (Read-Only) | Employees                   | View their own schedule and their section's current and upcoming schedule; no edit access     |

**Phase 1 build note:** For initial launch, DubGrid will operate without authentication (single shared admin session). The data model and permission logic should be architected to accommodate RBAC retrofit without a schema migration. Specifically: all data writes should be attributable to a user ID field (nullable for Phase 1), and UI components should be built with permission-gating hooks in place even if they are not enforced yet.

---

## 12. Open Questions for Development

- **Data persistence:** Local browser storage, or a small server-side database? What happens if the browser is cleared?
- **Multi-user editing:** Will multiple admins edit the schedule simultaneously, and if so, how should conflicts be handled?
- **Historical schedules:** Should past schedule periods be archived and viewable?
- **FTE counts:** Should staffing COUNT rows reflect FTE-weighted headcounts (e.g., 0.3 + 1 + 1 = 2.3), or always whole-person counts?
- **Sheltered Care cross-staff:** When a Skilled Nursing Wing employee is assigned SCD/SCE, should they disappear from Skilled Nursing Wing counts that day?

---

## 13. Appendix — Example Seed Staff Roster

The following example staff entries illustrate the data model for seeding an initial roster. Each organization should define its own roster during onboarding.

| Name (Example) | Designation | Roles                | Notes                                    |
| -------------- | ----------- | -------------------- | ---------------------------------------- |
| Employee A     | JLCSN       | DCSN                 | Director CSN                             |
| Employee B     | JLCSN       | Mentor               |                                          |
| Employee C     | JLCSN       | Supv                 |                                          |
| Employee D     | JLCSN       | Supv                 | Also in secondary wing                   |
| Employee E     | JLCSN       | Mentor, Supv         | Cross-wing assignment                    |
| Employee F     | JLCSN       | Supv, CN             | Also visiting nurse; VN shifts           |
| Employee G     | STAFF       |                      | Primary wing only                        |
| Employee H     | STAFF       |                      | SCD/SCE; primarily secondary wing        |
| Employee I     | CSN III     |                      | Also visiting nurse (VN shifts)          |
| Employee J     | CSN II      |                      | Cross-wing assignment                    |
| Employee K     | JLCSN       | SC. Mgr.             | Secondary wing manager; Dcn shifts       |
| Employee L     | JLCSN       | DVCSN                | Director visiting nurses; VN-only shifts |
| Employee M     | —           | Activity Coordinator | Non-clinical                             |
| Employee N     | —           | SC/Asst/Act/Cor      | 0.3 FTE part-time                        |
| Employee O     | JLCSN       | Supv                 | Night shift only                         |

---

_DubGrid — Confidential_
