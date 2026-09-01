# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-04 [P2] open - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Render, layout, animation, and memory cost grow with the complete organization roster.
**Suggested fix:** Replace the roster body with a virtualized list while preserving existing behavior.
**Resolution:** Not attempted. Deferred deliberately: the roster renders inside the shared `Screen`
ScrollView (sticky-header, scroll-offset, and scrollTo machinery), so virtualizing means moving the
screen onto a FlatList with the filters and tabs as `ListHeaderComponent` and reworking
`AnimatedListItem`'s index-staggered entrance for recycled rows. That is a feature-sized change to a
shared scroll architecture and needs its own spec, not a cleanup pass.

### F-17 [P2] open - Mobile dashboard remains an explicitly reduced analytics model

**File:** packages/contracts/src/mobile.ts:583-646; apps/web/src/features/mobile/server/routes/dashboard.ts
**Found:** 2026-08-31 by /audit (scope: mobile parity; lenses: quality, performance, tests)
**Why it matters:** The mobile contract deliberately omits the web dashboard's draft-versus-published metric, detailed coverage grid, and several activity-event types. The comments document the reduction, but it is still a functional gap under the requested full parity standard.
**Suggested fix:** Align the mobile dashboard payload and screens with the web dashboard metrics and activity feed after the schedule lifecycle work establishes the required draft data.
**Resolution:**

### F-25 [P2] open - Productive UI text remains below a readable minimum

**File:** apps/web/src/app/globals.css:118-122; apps/web/src/components/staff/MembersSection.tsx:1586-1654; apps/web/src/components/dashboard/OpenShiftsCard.tsx:140-221; apps/web/src/components/ScheduleGrid.tsx:3363-3390
**Found:** 2026-09-01 by /audit (scope: apps/web; lens: quality - typography)
**Why it matters:** The productive app defines 9px, 10px, and 11px type tokens and uses equivalent hard-coded sizes throughout dense scheduling, dashboard, staff, and status interfaces. A static inventory found 137 such declarations across 41 non-mock productive component files after excluding the landing mockups and appearance preview. Much of this text is also muted, bold, uppercase, or tightly packed, so ordinary labels and operational data are harder to scan and enlarge consistently.
**Suggested fix:** Make 12px the exceptional minimum for secondary metadata and 14px the default for controls, navigation, tables, and productive body text. Reserve smaller rendering only for non-text diagram detail or scaled previews, then migrate the schedule, dashboard, People, staff-detail, and status surfaces first.
**Resolution:**

### F-26 [P2] open - Shared controls bypass the typography scale

**File:** apps/web/src/components/ui/button.tsx:8-36; apps/web/src/app/globals.css:441-449; apps/web/src/components/FormField.tsx:14-23; apps/web/src/lib/styles.ts:22-53
**Found:** 2026-09-01 by /audit (scope: apps/web; lens: quality - typography)
**Why it matters:** The app has semantic font-size tokens, but its two button systems still render labels at 11px to 13px with semibold weight, while form and table label styles are duplicated with different weights. A source-wide inventory found typography size declarations in 196 web source files, so changing one token cannot reliably revise the application and equivalent controls can render with different emphasis.
**Suggested fix:** Define semantic text roles for controls, navigation, labels, metadata, table headers, and headings, then make Button, input/select, FormField, table, menu, badge, sidebar, navbar, and toolbar primitives own those roles. Remove feature-local size and weight overrides as each surface migrates.
**Resolution:**

### F-27 [P2] open - Uppercase micro-labels dominate operational hierarchy

**File:** apps/web/src/app/globals.css:1043-1052; apps/web/src/lib/styles.ts:22-53; apps/web/src/components/staff/ProfileChangeRequestQueue.tsx:124-164; apps/web/src/components/staff-detail/tabs/OverviewTab.tsx:201-240
**Found:** 2026-09-01 by /audit (scope: apps/web; lens: quality - typography)
**Why it matters:** Shared labels and table headers default to uppercase, bold weight, extra tracking, and subtle or faint colors, and feature code repeats that treatment across settings, People, profile, dashboard, schedule, and Gridmaster views. This makes routine labels visually noisy while simultaneously reducing word-shape recognition, and it conflicts with the requested quiet sentence-case treatment already applied to navigation and section titles.
**Suggested fix:** Use sentence case by default with regular or medium weight and normal tracking. Keep uppercase only where the content is genuinely code-like or where a reviewed data visualization needs a compact axis or legend treatment.
**Resolution:**
