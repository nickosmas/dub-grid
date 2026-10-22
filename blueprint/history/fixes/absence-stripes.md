# Fix: Absences are striped in their own color on the web, and connected pills join

**Type:** Fix
**Status:** verified
**Branch:** `fix/absence-stripes` (cut from `dev`, fast-forwarded onto 45c at 2ada89b9)
**Decisions (owner, 2026-10-20):** text is option (b), a deep tone of the absence's own hue; every other proposal below is approved as written
**Prototype:** [Absence stripes canvas](https://claude.ai/artifact/5Lnbu1UHXrYTudcRe8rk2m) shows all 40 color presets in light and dark, a week grid, and the mobile Your week screen (absences solid in the app)

## The problem

At a glance an absence looks like a worked shift: both are a solid pill in the
organization's color. The owner approved a diagonal stripe for absences in a
prototype: `repeating-linear-gradient(135deg, A 0, A 6px, B 6px, B 12px)`. A
and B are two tints of the absence type's own configured color, never one
hardcoded red. The Sick example uses A `#FECACA`, B `#FEE2E2` and text
`#7F1D1D`.

The owner also wants a worked shift and its absence for the rest of the day
(item 45) to read as one object. They touch, and the edges where they meet
have no border and no rounding.

Today absence fills are worked out in about 35 places, with no shared
component:

- **Web:** 22 surfaces. About 12 call `resolveShiftPillColors` in
  `apps/web/src/lib/colors.ts`, which is a private copy of
  `packages/design-tokens/src/pill-colors.ts`. The rest set their own
  `background`.
- **Mobile:** schedule-screen and shift-detail pills go through
  `buildAbsenceChip` (`apps/mobile/src/features/schedule/lib/scheduleScreenChips.ts:292`).
  The dashboard's `MyScheduleCard` works out its own colors.

## The fix

One shared, tested function in `@dubgrid/design-tokens` turns an absence
type's `{ color, text, border }` and the theme into stripe A, stripe B, text
and border. The web app calls it. Every web absence surface draws the
stripe from it, and nothing else about those surfaces changes.

### Decided points

1. **How the two tints are derived** (proposed, and drawn on the canvas):
   - **Light mode:** A is the configured color. B is A mixed 45% toward white,
     which gives exactly the approved `#FECACA` and `#FEE2E2` for Red.
   - **Pale colors:** if A and B sit closer than 1.15:1, A is darkened toward
     slate until they separate. Otherwise very pale presets lose their stripes:
     Ice, Pearl and Cloud are only 8 to 11 RGB steps apart. 31 of the 40
     presets need this nudge; it is barely visible on most.
   - **Dark mode:** A is today's dark pill color for that type (the existing
     `toDarkPillColors`). B is A mixed 40% toward the dark page (`#18181B`).
2. **Text contrast.** Text must reach at least 4.5:1 against both tints. The
   darker-contrast tint is always A (darker in light mode, lighter in dark
   mode), so the function checks against A and a test asserts both for every
   preset in both modes. The tightest results on the canvas: 4.6:1 in light
   (Yellow, Lime, Cyan, Melon, Mint) and 4.5:1 in dark (Sky).
   **Decision needed:** in light mode, which text color should absences use?
   - (a) The organization's stored `text_color` (default slate `#1E293B`), as
     pills use today, falling back to a derived tone only when it fails 4.5:1.
   - (b) A deep tone of the absence's own hue, like the approved `#7F1D1D`.
     This is what the canvas shows.

   Dark mode keeps today's derived text either way.

3. **Mobile app: no stripes** (owner, 2026-10-20). Stripes were built with
   React Native's `experimental_backgroundImage` and tried on the iOS
   simulator, but on small phone pills they read coarse. The owner's call:
   the Expo app keeps its solid absence pills. Only the web app is striped,
   including its phone-width Day view.
4. **Print.**
   - Both print paths already force `print-color-adjust: exact` and light
     colors (`print-document.ts:36`, `globals.css:1924`), so stripes print the
     same as on screen in the light tints.
   - When a browser drops background graphics anyway, every pill loses its
     fill, solid or striped. Proposed: print absences with a dashed border, so
     they still read as absences in black and white. The label already names
     the absence.
5. **Which absences get stripes.** Proposed: every absence type, including a
   plain "Off" type, so the rule is simply "striped means absence".
   Alternatives: let an organization switch stripes off per type (needs a
   column and a migration, so out of scope here), or exempt the default gray
   only.
6. **Two pills not in the organization's color.** The deleted-absence ghost
   pill (fixed danger tint, `ScheduleGrid.tsx:3984`) and the Gridmaster
   read-only absence chip (fixed warning tint, `ReadOnlyScheduleView.tsx:242`;
   no type color reaches it) never use the type's color. Proposed: stripe both
   using their fixed tint as the base, so stripes keep meaning "absence".

### Joined pills (owner, 2026-10-20)

Pills in one cell touch only when they are connected in time:

- Two worked shifts join when the first ends exactly as the second starts
  (`timesMeet` in `apps/web/src/lib/attached-pill.ts`). A double shift with a
  gap between its parts stays two separate pills, because joining them would
  read as one continuous block.
- The absence for the rest of the day always joins the last shift, since it
  starts when that shift ends.
- Times come from the pill's custom time, then the job's default, then the
  shift's default. An unset custom part is stored as `""`, so it falls
  through to the defaults.
- Joined pills touch with no border and square corners on the meeting edge:
  bottom and top when stacked, right and left side by side. The cell layout
  has no gap; unjoined pills get spacing before them, so a tall stack never
  pushes into the cell's padding.
- Draft and publish-difference rings still wrap each pill.
- Stacked pills share spare height by line count, so a one-line shift stays
  short beside a pill that also shows a time or a job.

This applies in the grid, phone-width Day view (absence join only, since that
view has no shift times), print and the admin dashboard row.

### Must not break

- Organization terminology. Copy says "absence", never "off day".
- Text fitting on both platforms.
- Dark-mode remaps for worked shifts.
- Draft and publish-difference borders and rings.
- QA-account hiding.
- The Settings color picker swatches stay solid. They are shared with Jobs and
  Shift Categories, and they show a color choice, not an absence.
- Month view draws no absences today (`MonthView.tsx:378`), and that stays as
  it is.

### Overlap with 45c

45c landed on `dev` (2ada89b9) before implementation began and this branch
now includes it. It had changed
`MobileDayView`, `PrintScheduleView`, `MyScheduleRow`, `UserDashboard` and
`ReadOnlyScheduleView`. Step 5 covers those surfaces.

## Build steps

- [x] **1. Shared stripe colors.** Add `resolveAbsenceStripes(color, isDark)`
      to `packages/design-tokens/src/pill-colors.ts`. It returns
      `{ stripeA, stripeB, text, border }` plus `absenceStripeCss(a, b)` for
      web.
      Export them from the package index and rebuild the package.
      Tests in `pill-colors.test.ts`: - Red gives `#FECACA` and `#FEE2E2`. - Every one of the 40 presets passes 4.5:1 text contrast against both
      tints in light and dark. - Every pair is separated by at least 1.15:1. - Bad or missing hex falls back safely. - The CSS is exactly the approved `repeating-linear-gradient`.

      **Done when** the package tests pass and type-check is clean.

- [x] **2. Web grid.** Stripe the whole-day absence pill
      (`ScheduleGrid.tsx:2780`), the item-45 absence pill (`:3820`) and the
      drag overlay (`:2499`, which also gains its missing dark remap). Attach
      the item-45 absence to its shift, stacked and side by side, as described
      above. Add a test for the attached-edge styling.
      **Done when** Week and 2 Weeks show striped absences in light and dark,
      the attached pair touches with no inner border, and grid tests pass.
- [x] **3. Web editor and pickers.** Stripe the absence fills in
      `ShiftEditPanel` (whole-day card `:2822`, rest-of-day card `:3429`),
      `ShiftPicker` absence buttons (`:536`, also fixing their invisible
      transparent border), `RepeatForm` badge (`:490`, also adding its missing
      dark remap) and `ShiftRequestBoard` call-off chip (`:584`).
      **Done when** each shows stripes in both themes.
- [x] **4. People, Settings and Gridmaster.** Stripe the absence fills in
      `RecurringScheduleCard` (person page and profile), `RecurringScheduleSection`
      (staff editor), the Settings Absence Types row preview (`AbsenceTypes.tsx:274`)
      and the Gridmaster Config tab table (`ConfigTab.tsx:366`). Point web's
      `lib/colors.ts` pill helpers at the package versions where they are the
      same code, so there is one copy.
      **Done when** each shows stripes in both themes and the web suite passes.
- [x] **5. Day view, print, dashboards and fixed-tint chips.** Stripe `MobileDayView` (`:439`), the
      print grid (`PrintScheduleView` through `PrintShiftPill`, with the dashed
      print border), `MyScheduleRow`, `UserDashboard` (`buildAbsenceSegment`),
      the deleted-absence ghost pill and the Gridmaster read-only chip. Apply
      the attached-edge rule to every item-45 pair 45c added.
      **Done when** each shows stripes and attached pairs, and print preview
      shows stripes with background graphics on and dashed edges with them off.
- [x] **6. Mobile.** Dropped by the owner (2026-10-20): the Expo app keeps
      solid absence pills, and its files are unchanged.
- [x] **7. Evidence and gates.** Take web and mobile screenshots in light and
      dark of every surface above, check the Team schedule scroll, then run
      `npm run type-check`, `npm run lint` and `npm run test`.

## Verify

- **Web:** sign in as `qa-super-admin@dubgrid.test` in Calm Haven.
  - Give two absence types different colors, one of them pale (Ice or Pearl).
  - Schedule a whole-day absence, plus a shift with an absence for the rest of
    the day.
  - Check Week, 2 Weeks, phone width, print preview, the shift editor, the
    person page, Settings and both dashboards in light and dark.
  - Every absence is striped in its own color; every worked shift is solid.
  - The attached pair touches with no inner border.
- **Mobile app:** absences stay solid, as before.
- **Wrong would be:** a red stripe on a non-red type, unreadable text, stripes
  invisible on a pale type, a gap or inner border between an attached pair,
  or a worked shift drawn striped.

## Evidence (2026-10-20)

- `npm run test` (all workspaces) passed; `npm run type-check` passed;
  `npm run lint` 0 errors (2 existing `<img>` warnings).
- Web, light and dark (Playwright, Calm Haven, `qa-super-admin`): 2 Weeks grid
  with striped absences, a shift joined to its rest-of-day absence, a
  time-connected double shift joined (Kenneth Crawford, E 3:30p-12a with
  N 12a-9a), the shift editor, the absence picker, Settings Absence Types and
  the phone-width Day view.
- Mobile app: unchanged; its schedule and dashboard tests pass.
- Docs: the Schedule Grid and Shifts, Jobs and Absences pages describe the
  stripes and joined pills; the 12 pages citing changed source were re-checked
  and their evidence fingerprints re-recorded (`docs:check` passes).
