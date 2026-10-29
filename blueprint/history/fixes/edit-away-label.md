# Fix: "Change return date" undersold the Away dialog

**Type:** Fix
**Status:** verified

## The problem

Owner report, 2026-10-29 (the owner picked "Edit time away" over "Edit away", which read oddly): an Away person's ⋯ menu offered "Change return
date" (or "Set return date" without one), but its dialog edits the return
date and the absence on those days, and was titled "Change X's return date?".

## The fix

- `@dubgrid/domain` `describeStatusAction("setReturnDate")`: the label is
  **Edit time away** and the title "Change X's time away?", with or without a
  date. A save that keeps a date reads "Time away updated"; setting a first
  date and clearing one keep "Return date set" and "Return date cleared".
- The web and mobile dialogs opened from that item use the same title.
- The roster page names **Edit time away** in the card's ⋯ menu.

Swept the other Change, Set, Edit and Update labels on web and mobile: Set
and Change end date (suspension end only), Edit plan, Set last day (confirms
an Offboard with a last day), Change trial (trial days only), Change role and
Change email each name what their dialog changes, so nothing else moved.

## Checks

- Domain 89 of 89, web status and staff suites 107 of 107, mobile people
  suites 164 of 164.
- Browser, local Calm Haven: Diane Patterson (Away) shows **Edit time away** and
  **Offboard** in the ⋯ menu; Edit time away opens "Change Diane Patterson's time
  away?" with Return date and Absence. Closed without saving.
