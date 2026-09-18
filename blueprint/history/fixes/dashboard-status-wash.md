# Dashboard cards tinted by context, in the Apple Health idiom

**Type:** Fix

**Status:** verified

## The problem

The admin dashboard is clean now but every card is the same white surface,
so nothing on the page says at a glance what is healthy and what needs a
hand. The user's reference is Apple Health's Insights page: a plain headline
and subtitle at the top, then a column of rounded cards, each washed with a
context colour and haloed by a soft glow of the same colour (red for heart,
lavender for sleep, green when a ring is ahead), each card opening with its
own small "Fitness ›" title, its figures large, its sub-sections split by
hairlines, and a one-sentence summary at the bottom. Dark mode keeps the
glow on a black page.

## The fix

- The hero summary leaves its card: `summary.title` and `summary.description`
  render as the page's headline block under the period toggle.
- `DashboardCard` (dashboard-local) replaces the shared `Card` on this
  screen: the title sits inside the surface as a small pressable "Title ›"
  row (the See all affordance, as in the reference), the surface takes the
  tone's soft fill, and a wrapper casts a soft shadow in the tone's colour
  (a colored `shadowColor` on iOS and Android 28+). An optional summary
  sentence sits under a hairline at the bottom. Neutral cards keep the plain
  surface and the ordinary card shadow.
- Tones by context: Coverage green ≥ 90, amber ≥ 70, red below, neutral when
  not configured; Overtime watch red; Open shifts red with an urgent shift,
  amber otherwise; Pending approvals and Unpublished changes amber; Your
  schedule blue; Recent activity neutral.
- The Coverage card (the former hero) shows the figure and meter when
  configured, then two stat columns (open gaps, pending approvals) under a
  hairline, tappable when non-zero.
- Cards sit 16pt apart (their titles are inside now); the skeleton mirrors
  the new card shape.

## Build steps

- [x] **1. `DashboardCard` and the page headline**
  - New component with tone tint, glow, inner title row and summary slot;
    `AdminHomeScreen` renders the headline block and passes tones.
  - Tests: DashboardCard renders its title row and calls `onOpen`; the
    AdminHome suite still passes with the headline in place.

- [x] **2. Cards, coverage card, skeleton**
  - The six cards move onto `DashboardCard` with their tones; the coverage
    card carries figure, meter and stats; `DashboardSkeleton` follows.
  - Done when the dashboard suites, `type-check` and lint pass, and the
    device shows tinted, glowing cards in light mode.

- [x] **3. Alerts swipe follow-ups (added from device review)**
  - One open swipe at a time, a 12pt gap before the actions, and the list
    bleeds past the gutter so a swiped row's actions meet the screen edge.

- [x] **4. From tinted cards to one page wash (device review, four rounds)**
  - Colour moved off the cards entirely: first to coloured halos, then to a
    two-hue rule (red broken, amber waiting, no green or blue), then to one
    subtle diagonal gradient fixed behind the whole page, status bar to
    bottom edge, with a stop per section in that section's tone. `Screen`
    gained `pageBackground` and `stickyHeaderBackground` so the header
    paints the same slice of the wash and drops its shadow seam. Card titles
    returned above their surfaces with See all.

## Verify

- `npx vitest run src/features/dashboard --root apps/mobile`.
- Simulator: a headline and sentence above the cards; Overtime watch washed
  red with a red halo, Your schedule blue, Recent activity plain; each card's
  title reads "Title ›" and opens the full screen.

## Outcome

- Commits on `dev` (2026-09-17): `14a3c573` (tinted cards, first cut),
  `f88c28cf` (alerts swipe registry and gap), `77ff3fc6` (the page wash and
  `Screen.pageBackground`/`stickyHeaderBackground`), `f7101cdc` (diagonal,
  seamless through the header).
- Evidence: full mobile suite 142 files / 1142 tests, mobile `type-check` and
  lint clean, repo-wide checks green in the pre-push hook; device captures of
  the dashboard (dark, with live coverage data) and the swiped alert row
  inspected against each round of feedback.
- Rule recorded for later work: colour on the dashboard is the page's, not a
  card's, and it means one of two things: red for broken, amber for waiting.

## Follow-up rounds (2026-09-17, after the archive)

- `a8e026b1`: the wash reduced to two colours at a time.
- `67d9974d`: status colours dropped; the page took the login page's brand
  aurora (`GradientBackdrop kind="aurora"`).
- `93c8fd93`: the aurora recoloured by the period's coverage percentage only
  (green ahead, amber close, red behind; absent when not configured), the
  status-gradient model and per-section tones removed.
- `d17ed516`: wash hues one step deeper down each ramp so red reads red rather
  than pink at the aurora's alphas.
- Device check: 92% (green) and 47% (red) coverage captured in dark mode; the
  wash runs unbroken through the sticky header.
- `211e47e9`, then `c259f36e`: the period toggle's track off the neutral grey
  that read as a patch on the wash; see-through first, then filled with the
  theme's ground (white in light, black in dark) at the user's call.
- `0c840776`: the Coverage card and the Coverage by wings card said the same
  thing twice. One Coverage card now: figure and meter, the two stats, then
  the first three focus areas with their meters; See all opens the full
  breakdown. `CoverageSectionRow` has its own file; the second card is gone.
- `d602e905`: Your schedule leads the dashboard, Coverage second.
- `dac8809f`: the schedule strip lost its card. `DashboardCard` gained
  `surface={false}` (title and See all, no box); the shift pills are the
  section's only shapes and the strip runs to the screen edges.
- `ea5d929d`, `3883c75a`, `747d454b`, `8b1a711c`: the pills tried the card
  shadow in place of a hairline; the strip's ScrollView clipped the cast to
  a hard line under each pill, padding for it did not read as fixed, and
  the pills ended as flat fills with no edge and no cast. (`3883c75a` named
  a spacing key that does not exist; the hook refused the push and
  `747d454b` corrected it.)
- `fc781b3b`: the headline under the toggle ("21 urgent coverage gaps" and
  its sentence) removed; the Coverage card says it with the figure, meter
  and stats. `DashboardHeadline` and its skeleton block are gone; the API
  keeps `heroSummary` for the web.
- `b2e8a8c0`: the Coverage card closes with open gaps and pending approvals;
  the focus-area breakdown sits between the figure and the stats.
- `6608457a`, `c59355f6`, `5d84f147`: the shift pills took the quiet
  `raised` lift with room in the strip for its cast, then a subtle edge. The
  room first grew the strip's ScrollView 24pt upward over the "See all" row
  and swallowed its taps; it is 8pt above and 20pt below now.
- `1c810add`: blue means normal. Coverage at or above 90% paints the brand
  aurora itself, the login page's wash, so a calm page says nothing is wrong
  and only amber and red carry news. The wash moved into a shared
  `PageWash`, and the staff home (`HomeScheduleScreen`) carries the same
  aurora through its sticky header, always blue.
- `afe63cb3`, `f0509e2b`: every skeleton redrawn to the screen it stands in
  for (alerts as mailbox rows, request cards without the icon, people rows
  with two lines and a chevron, team rows with the 48pt avatar and a badge,
  the staff home's open-shifts strip, md controls on shift detail, dashboard
  rows as text with a figure and a chevron), and a shared defect fixed: a
  percentage-wide `SkeletonLine` inside a row was a percentage of nothing
  and vanished, so titles and labels beside fixed-width neighbours rendered
  as blank space.
- `ef6e7fd2`: the request sheets drew their footer shell (hairline, padding)
  around an always-truthy empty fragment until a choice was made; the footer
  is passed only when it has an error or actions to show.
- `b8a03895`, `8cdee3d4`, `510474b5`: the swap sheet's discard question
  never appeared on device. It was a root-level Modal, which UIKit refuses
  while the page sheet is presented; nested inside the sheet it was no
  better, and the sheet's swipe-veto remount (a key bump so iOS re-presents
  a card it has already dismissed) also ran on Close and tore the card down
  mid-presentation. Settled on an in-sheet overlay: `ConfirmationModal`
  gained `presentation="inline"`, `FullPageSheet` an `overlay` slot above
  its header and footer, and Close only calls `onDismiss`. Verified on
  device: pick a target, Close, "Discard this request?" over the sheet.
- `c987c8f4`: the same defect on the drop sheet: "Submit this call-off?"
  was a root-level Modal while the bottom sheet's Modal was up, so Submit
  did nothing. `BottomSheetModal` gained the `overlay` slot too, and the
  shift detail builds both confirmations once (`requestConfirmations`) and
  renders them inline inside whichever sheet is up, as ordinary modals only
  when none is. Verified on device: Call off, Sick, Submit, the question
  over the sheet; Cancel; Close.

## Completion pass (2026-09-17, after the follow-up rounds)

- Repo-wide pre-push hook on `ab275d62`: type-check clean; tests green in
  every workspace (mobile 142 files / 1142 tests, web 437 / 3733, all
  packages passing).
- `npm run lint`: 0 errors, 5 pre-existing warnings in files this work did
  not touch. `npm run lint:rules`: passing.
- Web Playwright, chromium, against the local dev server and seeded local
  Supabase: 70 of 71 passed in 17.7 minutes; the one miss
  (`dashboard-states` "progress bar while the organization bootstrap is in
  flight", a 1.5 s timing assertion) passed alone on a rerun, so it was load
  from the concurrent hook run, not a regression.
- Device pass (signed in, iPhone 17, light): dashboard drill-ins (Coverage,
  Your schedule, Open shifts, an open-shift row to Requests, Available);
  alerts swipe actions with Read applied and the row closing; shift detail
  with Drop shift and Swap; the drop sheet's X closing in one tap; the Swap
  page sheet opening from a clean state and after Drop, X. Captures in
  `blueprint/reference/mobile/`, matrix rows updated. Two defects found and
  fixed on the way (the strip's frame over See all, the empty sheet footer);
  three observations left open in the matrix README.
