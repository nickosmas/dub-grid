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
