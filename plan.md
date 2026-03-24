# Staff Detail Page — Comprehensive Employee Profile & Reports

## Overview
Create a full-page employee detail view at `/staff/[id]` with profile data, schedule history, hours analytics, account activity, and exportable reports. Clicking an employee name in the staff list navigates here.

---

## Route
- `src/app/staff/[id]/page.tsx` — Dynamic segment (NOT catch-all, safe for Vercel prerendering)

## Page Layout
Tabbed full-page layout following the SettingsPage pattern (scrollable tabs + card sections):

### Header
- Back arrow → `/staff`
- Employee avatar (initials), name, status badge (active/benched/terminated)
- Certification + role badges
- Quick actions: Edit, Bench/Activate, Invite (permission-gated)

### Tabs

#### 1. Overview
- **Profile Card**: name, email, phone, contact notes, seniority, focus areas, certification, roles, status + status note, linked user account (yes/no)
- **This Week Stats Row**: hours scheduled, shifts count, OT status (reuse `computeEmployeeWeeklyHours`)
- **Quick Glance Cards**: total recurring shifts, primary focus area, days since last status change

#### 2. Schedule
- **Date range picker** (week/month selector, defaults to current week)
- **Shift History Table**: date, shift codes (with color badges), focus area, start/end times, duration, published vs draft status, notes/indicators
- **Hours Summary**: total hours for selected range, daily breakdown, OT flag
- **Monthly Hours Bar** (SVG, no library): last 12 weeks of hours as horizontal bars

#### 3. Recurring Shifts
- **Table**: day of week, shift code, effective from/until, created/updated dates
- **Visual Weekly Pattern**: Mon–Sun grid showing recurring shift codes (colored cells)

#### 4. Activity
- **Status History**: timeline of active→benched→terminated transitions (from `status_changed_at` + `status_note`)
- **Role Change Log**: entries from `role_change_log` filtered to this user (if linked account exists)
- **Invitation History**: invitation record(s) for this employee
- **Session History**: login sessions (if linked user account) — device, IP, last active
- Empty states for unlinked employees ("No linked user account")

#### 5. Reports
- **Hours Report**: weekly hours for past 12 weeks (table + SVG bar chart)
- **Shift Distribution**: donut chart (reuse DonutChart component) — breakdown by shift code
- **Day-of-Week Pattern**: which days they work most (bar chart Mon–Sun)
- **Focus Area Distribution**: donut chart — time spent per focus area
- **Overtime Summary**: weeks with OT, total OT hours
- **Export CSV** button: downloads all employee data (profile + shifts + hours + activity) as CSV

---

## New Files

### Components
```
src/components/staff-detail/
  StaffDetailPage.tsx          — Main orchestrator (tabs, data fetching)
  StaffDetailHeader.tsx        — Back nav + employee header + actions
  OverviewTab.tsx              — Profile card + stat summaries
  ScheduleTab.tsx              — Shift history + hours + date range
  RecurringTab.tsx             — Recurring shifts table + weekly visual
  ActivityTab.tsx              — Status history, role log, sessions
  ReportsTab.tsx               — Charts + export
  HoursBarChart.tsx            — SVG horizontal bar chart (reusable)
  index.ts                     — Barrel export
```

### Route
```
src/app/staff/[id]/page.tsx    — Thin route wrapper
```

### Data Layer
```
src/lib/employee-stats.ts      — Employee-specific stat computations
```

---

## DB Layer Changes (in `src/lib/db.ts`)

### New Functions
```typescript
// Single employee by ID
fetchEmployeeById(empId: string, orgId: string): Promise<Employee | null>

// Shifts for one employee in a date range (server-side filter)
fetchEmployeeShifts(empId: string, orgId: string, start: string, end: string): Promise<ShiftRow[]>

// Role change log for a specific user
fetchEmployeeAuditLog(userId: string, orgId: string): Promise<RoleChangeLog[]>

// Session history for a specific user
fetchEmployeeSessionHistory(userId: string): Promise<UserSession[]>

// Invitation history for a specific employee
fetchEmployeeInvitations(empId: string, orgId: string): Promise<Invitation[]>
```

### New Types (in `src/types/index.ts`)
```typescript
// Employee shift row (flattened for detail view)
interface EmployeeShiftRow {
  date: string
  shiftCodeIds: number[]
  focusAreaId: number | null
  startTime: string | null
  endTime: string | null
  status: 'published' | 'draft'
  notes: string | null
  durationHours: number
}

// Hours summary for a time period
interface HoursSummary {
  weekLabel: string
  weekStart: string
  totalHours: number
  shiftCount: number
  overtimeHours: number
}

// Shift distribution entry
interface ShiftDistribution {
  shiftCodeId: number
  name: string
  abbr: string
  count: number
  percentage: number
  color: string
}

// Day pattern entry
interface DayPattern {
  day: string        // "Mon", "Tue", etc.
  dayIndex: number   // 0-6
  count: number
  percentage: number
}
```

---

## Stat Computation (new `src/lib/employee-stats.ts`)

```typescript
// Compute weekly hours for past N weeks
computeEmployeeHoursHistory(shifts, shiftCodeMap, weeks): HoursSummary[]

// Compute shift code distribution
computeShiftDistribution(shifts, shiftCodeMap): ShiftDistribution[]

// Compute day-of-week work pattern
computeDayPattern(shifts): DayPattern[]

// Compute focus area distribution
computeFocusAreaDistribution(shifts, focusAreas, shiftCodeMap): { name, hours, pct, color }[]

// Compute overtime summary
computeOvertimeSummary(hoursHistory): { weeksWithOT, totalOTHours, avgOTPerWeek }

// Generate CSV export string
generateEmployeeCSV(employee, shifts, hours, activity): string
```

---

## Navigation Changes

### Staff List (`StaffTableRow.tsx`)
- Make employee name a `<Link href={`/staff/${emp.id}`}>` instead of just text
- Keep existing click-to-expand behavior for the row itself
- Name click → navigates to detail page

---

## Permission Gating

- **View page**: requires `canViewStaff` (all authenticated users have this)
- **Edit actions**: gated by `canManageEmployees`
- **Activity tab session/role data**: only visible if employee has a linked user account AND viewer is super_admin+ or gridmaster
- **Export**: available to all who can view staff

---

## Implementation Order

1. Add new types to `src/types/index.ts`
2. Add new DB functions to `src/lib/db.ts`
3. Create `src/lib/employee-stats.ts` with computation functions
4. Create route page `src/app/staff/[id]/page.tsx`
5. Build `StaffDetailPage.tsx` (orchestrator + tabs)
6. Build `StaffDetailHeader.tsx`
7. Build `OverviewTab.tsx` (profile + stats)
8. Build `ScheduleTab.tsx` (shift table + hours)
9. Build `RecurringTab.tsx` (recurring shifts)
10. Build `ActivityTab.tsx` (status history, audit log, sessions)
11. Build `ReportsTab.tsx` (charts + export)
12. Build `HoursBarChart.tsx` (SVG chart)
13. Update `StaffTableRow.tsx` — link employee name to detail page
14. Run tests
