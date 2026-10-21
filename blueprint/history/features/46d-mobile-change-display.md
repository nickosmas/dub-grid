# 46d - Mobile change display

**Type:** Feature
**Status:** complete
**Branch:** `feature/46d-mobile-change-display` (cut from `dev` at 90f480cd)

### Goal

The mobile app describes a published shift change the way the web does:
Before and After headings, every field that tells the two apart, "Was"
blocks in Your Week told once per day, and a "What changed" sheet with the
day bar in shift detail.

### Decisions

- The server computes each entry's whole-day change with the shared
  schedule-core model, from the cell's earliest in-window "from" to its
  newest "to", the same rule as the web (staff are assumed to have seen
  nothing in between). A first publication carries none.
- The name lookup moves to `lib/server/schedule-context.ts` so the mobile
  API (a feature module) can use it; the app routes re-export it.
- `change.shiftChange` is optional in the contract, so an app talking to an
  older server keeps its previous-shift summary and sheet.
- With what changed hidden (46f), `shiftChange` is null and a removed
  shift's entry is left out entirely, since that entry is the removed shift
  itself (a gap in 46f found while building this).

### Build steps

- [x] **1. Contract and server.** `shiftChangeSchema` in `@dubgrid/contracts`;
      `fetchMobileScheduleEntries` adds `change.shiftChange`; the visibility
      rule nulls it and drops hidden removals.
      _Done when_ the entry test reads a modified day's Before and After, a
      removal's empty After and no change for a first publication, and the
      visibility test drops a hidden removal.
- [x] **2. Native views.** `ShiftChangeCard` (Before and After, Shift 1 /
      Shift 2 / Absence labels, Added and Removed tags, break lines, the day
      bar) and `ShiftChangeWas`.
      _Done when_ component tests cover a whole-day change, an empty side
      and a Was block.
- [x] **3. Screens.** Your Week shows the Was block once per day for changed
      and removed days; shift detail's footer opens "What changed" with the
      card and the day bar. Both fall back to the older summary without
      `shiftChange`.
- [x] **4. Simulator check.** A published change for the QA staff account,
      seen in Your Week and the shift detail sheet on the iOS simulator.

### Evidence

iOS simulator (iPhone 16 Pro Max), 2026-10-21, the main checkout's Metro
and web server at `a191bbd1`, signed in as `qa-regular` in Calm Haven. QA
Regular's Sat, Oct 24 was republished from Day Shift to Evening Shift:

- Your Week shows the Evening Shift with its Edited chip and, under it, a
  WAS heading, "Day Shift" and "7:00 AM - 3:30 PM (8.5 hrs) · Skilled
  Nursing".
- Shift detail shows a "What changed" row; its sheet shows BEFORE (Day
  Shift, 7:00 AM - 3:30 PM (8.5 hrs) · Skilled Nursing) and AFTER (Evening
  Shift, Sat 3:30 PM - Sun 12:00 AM (8.5 hrs) · Skilled Nursing) with the
  shift and times marked. A single-shift day has no day bar, as on the web
  (the bar is for days with more than one item). The footer names the
  publisher, staff's default under 46f.
- The day was put back to Day Shift afterwards with a second publish.

### Verify

`npm run type-check`, `npm run lint`, `npm run test:mobile` and the mobile
server tests pass.

### Out of scope

- The Team tab's per-member row and the Home hero keep their one-line
  summaries.
