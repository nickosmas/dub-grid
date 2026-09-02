# Readable dashboard schedule strip

**Type:** Fix

**Status:** verified

## The problem

The Admin and Super Admin `Your schedule` card clips shift names, jobs, and
times inside narrow fixed-height cells. Its horizontal scroll buttons overlap
the first or last visible cell, and mobile compresses all seven days into an
unreadably dense row.

## The fix

Keep the card tied to the dashboard-wide selector while mapping Today and Week
to a full seven-day schedule row and 2 Weeks to fourteen days. Let the seven-day
row fill the wider dashboard viewport without horizontal scrolling; retain
readable 160px cells and scroll snapping for fourteen days. Let scheduled
content wrap and grow to a uniform row height, keep the cells' own horizontal
padding while making the scroller touch the card borders, and place the
conditional cue buttons just inside those borders without consuming scroll
width, vertically centered on the shift-pill area, with matching arrow-circle
styling in both directions. Keep the pills self-contained and do not open shift
detail popup cards on hover or keyboard focus. Preserve the regular-user
dashboard, mobile app, full Schedule page, existing navigation, semantic
tokens, and all unrelated dirty work.

## Build steps

- [x] Repair the day strip layout and scrolling controls so content wraps and
      navigation lands on complete cells. Done when Today and Week render seven
      cells without horizontal scrolling, 2 Weeks renders fourteen 160px
      cells, and the wider dashboard has matching inset left/right arrow cues.
- [x] Remove shift detail popup cards from the dashboard schedule row. Done
      when scheduled and empty day cells remain plain `/schedule` links and
      neither pointer hover nor keyboard focus opens a popup.
- [x] Switch mobile dashboard viewports to readable horizontal scrolling. Done
      when mobile widths retain fixed-width day cells instead of compressing
      seven days into a dense row, with the same aligned cue-button navigation
      as the fourteen-day view.
- [x] Repair F-43 - Mobile header briefly renders desktop navigation outside
      the viewport. Done when the initial mobile render is CSS-safe before the
      media-query effect settles and a regression test covers the fallback.
- [x] Repair F-44 - Failed invitation resend invalidates the recipient's
      existing link. Done when a delivery failure restores the prior invitation
      token and expiry with optimistic concurrency protection and a route test
      proves the previously delivered link remains usable.
- [x] Repair F-46 - MFA reminder clips and overlaps the app header on narrow
      mobile screens. Done when the banner grows to fit at 320px while keeping
      its setup and dismiss controls accessible and the header unobstructed.
- [x] Repair F-47 - People toolbar hides primary controls in an unsignposted
      horizontal scroller. Done when mobile exposes the selector, tabs, search,
      filters, reorder, and add actions in reachable responsive rows without a
      page-width overflow.
- [x] Repair F-48 - People tables remove data columns at responsive
      breakpoints. Done when applicable roster columns remain rendered at every
      viewport inside a deliberately scrollable, stable-width table.
- [x] Auto-collapse shared sidebars on compact screens. Done when every page
      using the shared sidebar provider closes an open sidebar as the viewport
      enters the compact range through 1199px and reopens it at 1200px while
      preserving manual controls within either mode.
- [x] Add directional cues to horizontally scrollable People tables. Done when
      right, both-direction, left, and no-overflow states reflect the table's
      scroll position, each arrow pages the isolated table scroller, and the
      People and dashboard schedule cues use the same shared circle styling.
- [x] Add regression coverage and verify the responsive UI. Done when focused
      tests, web type-check, the applicable web suite, authenticated browser
      checks pass without clipping, control overlap, or popup cards at the
      requested widths and zoom levels, and an audit closes F-43 and F-44.

Automated verification passes: 100 focused tests across the schedule, header,
People toolbar/table, sidebar, MFA banner, responsive source guards, and
invitation resend route; the full root type-check (24/24 tasks); all 2,761 web
tests within the full workspace suite (22/22 tasks); and the production build
(11/11 tasks). Authenticated checks pass in light and dark themes for desktop
Week, desktop Today, desktop 2 Weeks, tablet width, and mobile widths down to
320px. The in-app controller cannot set literal browser zoom, so the 150% and
200% checks used the exact equivalent 853px and 640px CSS viewports. At 320px,
the People toolbar and every roster column remain reachable, the table has a
working right cue that becomes bidirectional after paging, and the MFA banner
does not overlap the header. The sidebar is a visible collapsed rail at 1199px
and automatically expands at 1200px while its focused test proves manual
override behavior. F-43, F-44, F-46, F-47, and F-48 were independently
re-audited and closed.

## Verify

- `rtk npx vitest run --config apps/web/vitest.config.mts apps/web/src/components/dashboard/__tests__/MyScheduleRow.test.tsx`
- `rtk npx tsc --noEmit --project apps/web/tsconfig.json`
- `rtk npm run test:web`
- Authenticated `/dashboard` checks in light and dark themes at desktop, tablet,
  and mobile widths and 100%, 150%, and 200% browser zoom.

## Findings

### readable-dashboard-schedule-strip/F-43 [P1] closed - Mobile header briefly renders the desktop navigation outside the viewport

**File:** apps/web/src/components/Header.tsx:259-260,402-505; apps/web/src/hooks/useMediaQuery.ts:18-34
**Found:** 2026-09-02 by /audit (scope: current; lenses: quality, performance, tests)
**Why it matters:** `useMediaQuery` always returns `false` for the initial render
and updates only from an effect, so a 390px viewport first takes the desktop
header branch. The fresh typography browser matrix fails with the navigation
cluster extending from x=228 to x=788; an isolated Chromium rerun reproduced
the same overflow on a different authenticated route. This violates the active
spec's mobile viewport contract and creates a visible desktop-header flash on
mobile or immediately after a viewport change.
**Suggested fix:** Give the header a CSS-safe responsive fallback that hides the
desktop header and reveals the mobile header at the breakpoint before React
effects run (or provide a hydration-safe media-query snapshot), then rerun the
authenticated matrix without adding a test wait that masks the transient.
**Resolution:** Added a CSS-first mobile breakpoint guard to the desktop header
container, so the server-rendered desktop navigation is hidden before the
client media-query effect settles. Added source regression coverage and verified
a fresh authenticated 390px dashboard load remained viewport-safe before the
mobile header appeared.
Re-reviewed 2026-09-02 by `/audit current`: the breakpoint guard overrides the
desktop header's inline flex display before hydration, the focused header and
source tests pass, and a fresh authenticated 390px load remained exactly 390px
wide before and after the mobile header appeared. No replacement defect found.

### readable-dashboard-schedule-strip/F-44 [P1] closed - Failed invitation resend invalidates the recipient's existing link

**File:** apps/web/src/app/api/organizations/invitations/route.ts:730-783; apps/web/src/app/api/organizations/invitations/route.test.ts:266-287
**Found:** 2026-09-02 by /audit (scope: current; lenses: quality, security, tests)
**Why it matters:** The resend branch persists a fresh token and expiry before
calling the email provider. If delivery fails, it returns 502/503 without
restoring the previous token, so the invitee's last delivered link stops working
even though no replacement reached them. The route test covers only successful
delivery; unlike the adjacent access-replacement path, this failure path has no
rollback or regression test.
**Suggested fix:** Refresh and send through an atomic replace/rollback flow, or
retain the prior token and restore it on delivery failure with optimistic
concurrency protection. Add a provider-failure test proving the previously
delivered invitation remains usable.
**Resolution:** The resend path now captures the existing token server-side and
restores that token, its expiry, and revocation state when email delivery fails.
The rollback is guarded by the refreshed row timestamp and generated token, so
it cannot overwrite a concurrent change. Added a provider-failure route test
that proves the prior token is restored and no resend notification is emitted.
Re-reviewed 2026-09-02 by `/audit current`: the rollback is scoped to the same
organization and invitation and guarded by both the rotated token and refreshed
timestamp, so it restores the prior usable link without overwriting a concurrent
change. All nine focused route tests pass. No replacement defect found.

### readable-dashboard-schedule-strip/F-46 [P1] closed - MFA reminder clips and overlaps the app header on narrow mobile screens

**File:** apps/web/src/components/MfaNagBanner.tsx:8-44
**Found:** 2026-09-02 by /audit (scope: full web; lenses: quality, tests)
**Why it matters:** The shared signed-in banner fixes its height at 36px while its 320px presentation contains an icon, a long sentence, a setup link, and a dismiss button. The content wraps across multiple lines but the banner cannot grow, so its leading text is clipped and the remaining lines visually run into the app header. This is visible on the authenticated dashboard and applies to every route that renders the shared header. No banner-specific regression test exists.
**Suggested fix:** Use a responsive mobile layout that lets the message wrap or shortens it while preserving an accessible setup link and dismiss control; remove the fixed height at narrow widths and add a 320px visual/layout regression test.
**Resolution:** Removed the fixed banner height and made its content wrap inside
a growing minimum-height layout. Added a focused component regression test that
checks the responsive wrapping contract and keeps the setup and dismiss actions
accessible.
Re-reviewed 2026-09-02 by `/audit current`: the banner has no fixed height, its
focused interaction test passes, and the authenticated 320px render grows to
105px with the 56px header beginning directly below it. No replacement defect
found.

### readable-dashboard-schedule-strip/F-47 [P1] closed - People toolbar hides its primary controls in an unsignposted horizontal scroller

**File:** apps/web/src/components/staff/MembersSection.tsx:1104-1366
**Found:** 2026-09-02 by /audit (scope: authenticated `/people`; lens: responsive quality)
**Why it matters:** At 320px the toolbar is a 288px-wide `overflow-x-auto` row with a 1,023px scroll width. The visible view exposes the roster selector and Add button, but the tabs, Filter, Reorder, and required 300px search field begin off-screen with no overflow cue. The signed-in mobile page confirms that these primary controls cannot be discovered or used without horizontal scrolling.
**Suggested fix:** Use a responsive toolbar composition: keep the selector/tabs and page actions in reachable rows, make search a full-width mobile row, and retain any necessary narrow sub-control scrolling only where it is visually indicated. Keep the desktop toolbar unchanged and preserve the mobile filter sheet.
**Resolution:** Reused the Schedule toolbar's compact-screen composition: a
dedicated column layout, wrapped controls, flexible search, and the shared
`ScrollableTabs` overflow cues. Authenticated 320px evidence shows selector,
tabs, Filter, Reorder, search, and Add reachable with no document overflow.
Re-reviewed 2026-09-02 by `/audit current`: the toolbar now follows the shared
Schedule toolbar's compact composition, exposes a visible scroll cue for the
tab subset, and keeps every primary control inside the 288px content width.
No replacement defect found.

### readable-dashboard-schedule-strip/F-48 [P1] closed - People tables remove data columns at responsive breakpoints instead of preserving a scrollable table

**File:** apps/web/src/components/staff/MembersSection.tsx:1602-1790,1830-2050; apps/web/src/components/staff/StaffTableRow.tsx:317-353
**Found:** 2026-09-02 by /audit (scope: authenticated `/people`; lens: responsive quality)
**Why it matters:** The table wrapper supports horizontal scrolling, but the roster conditionally applies `hidden md:table-cell` and `hidden lg:table-cell` to Focus Area, Certification, Roles, Account, Access, and Date Joined; the management roster similarly omits Department, Role, and Status when `isMobile || isTablet`. At 320px the signed-in roster exposes only ID, Name, and Employment; at 768px it still removes the role/account/access fields. The information disappears rather than remaining available through the requested horizontal scroll.
**Suggested fix:** Keep the applicable columns rendered at every viewport, assign each People table a stable usable minimum width, and let its existing table container scroll horizontally on narrow viewports. Ensure both the scheduled and management roster headers and row cells use the same visibility rules.
**Resolution:** Removed responsive column hiding from both scheduled and
management rosters, assigned stable minimum table widths, and kept horizontal
overflow inside the table container. Authenticated 320px evidence shows a 286px
viewport over a 1,286px table with every named column still present.
Re-reviewed 2026-09-02 by `/audit current`: scheduled, reorder, and management
rows retain matching header and cell visibility at every breakpoint; the 320px
authenticated roster exposes all nine named headers inside the isolated table
scroller. No replacement defect found.
