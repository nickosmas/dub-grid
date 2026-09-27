# Feature: Mobile indicator display

**From build-plan:** feature 42c
**Status:** in progress (parked; another session's fix holds
`current-feature.md`)

## Goal

Mobile shows schedule indicators wherever a person's shift is shown: the
Schedule tab, the person's own schedule, shift detail and the Home schedule
card, each by the indicator's own name and colour, using the data 42b added.
A `schedule_note_published` alert opens the person's own shift for that day
instead of the team schedule.

## In scope

- **Spelled out where there is room; a dot only where there is none.**
  Mobile has no schedule grid, so every surface with room writes each
  schedule note's name: a `ScheduleNoteLabels` component shows each name as a
  sticky-note icon followed by the word, in caption text, wrapping as
  needed. No mobile surface uses bare dots. A pure helper chooses which notes a row shows. An editor's draft reads
  "(added, not published)" or "(removed, not published)" after the name; a
  draft addition's icon carries a plus and a draft removal's a minus.
- **Schedule tab (team).** Each person's row lists their schedule notes by
  name on a caption line under the name and time. With a focus-area tab
  selected, a row shows the notes for that focus area and those with no focus
  area; the all tab shows them all, one per note. A double shift gives each
  note to one half, as shift detail does: a half lists its focus area's notes
  (the first half working that area), and the first half also lists the
  whole day's (no focus area, or one the shift does not work).
- **My schedule.** The hero card and each "Your Week" row list the shift's
  schedule notes by name (white text on the hero). The hero stands for the
  whole day, so it lists every note; "Your Week" halves follow the one-half
  rule above. A shift removed in the last publish shows none anywhere.
- **Shift detail.** A "Schedule notes" row in the detail stack lists each
  note's name, with the draft wording for an editor. It shows nothing when
  there are none. A double shift lists each half's notes under that half, and
  notes with no focus area under "For the whole day".
- **Home schedule card.** Each day spells out its schedule notes by name
  on a line under the day's pills (the owner chose words here too,
  2026-09-27); the card's pills keep their fixed height.
- **Alert destination.** On mobile, a `schedule_note_published` alert opens
  `/shift/[employeeId]/[date]` for the signed-in person's own linked
  employee, falling back to today's route when there is no linked employee or
  no date. The shared web destination does not change.
- **Resilient parsing.** An indicator state the app does not know reads as
  published rather than failing the whole schedule response, so a future
  server value cannot break an older build.

## Out of scope

- Month and week strip date cells, which show only the date.
- Editing indicators on mobile, and a legend screen (`bootstrap.indicatorTypes`
  stays available for later).
- The secondary surfaces (42d).
- Changing the shared alert destination for web.

## Design decisions

- **Words over dots.** The owner's rule (2026-09-27): outside a grid, spell
  the schedule note out; a dot only where there is no space. Mobile has no grid, so every mobile surface spells notes out.
- **Sticky-note icon, not a dot (owner, 2026-09-27).** A schedule note is
  drawn as a sticky-note icon wherever there is room, in the surrounding text
  colour, never the note's own colour (the owner's call): every mobile
  surface (MaterialCommunityIcons `note-outline`, with `note-plus-outline` and
  `note-minus-outline` for an editor's draft addition and removal) and, on
  web, the Month popover, the phone-width day view, the shift slideover's
  read-only list and both print legends (Lucide `StickyNote`, faded for a
  draft addition and dashed for a removal). The week and two-week grid cells
  and the printed grid's cells keep their coloured dots, for lack of room.
- **Customer term.** Clients see "Schedule notes", never "indicators".
- **Draft states.** Mobile has no dashed styling and its badges are never
  outlined, so the glyph carries the state (a plus or a minus) beside the
  words.
- **Colours.** Outside the grid a note shows no colour: the icon takes the
  text colour (muted, or white on the hero). Only grid dots use the note's
  colour.

## Build steps

- [x] **Step 1 - the labels and their rules** - `ScheduleNoteLabels`
      (`apps/mobile/src/shared/components`), a pure
      swatch-style helper per state, a pure label helper, a pure `indicatorsForRow(indicators,
focusAreaId?)` that filters by focus area and removes duplicates by
      indicator and state, and a lenient `state` in the contract. _Done
      when:_ tests cover each state's style and label, the focus-area filter
      (matching, null and all), duplicate removal, an empty list rendering
      nothing, and an unknown state parsing as published.
- [x] **Step 2 - Schedule tab team rows** - `TeamShiftMemberRow` lists the
      row's schedule notes by name, filtered by the active focus-area tab.
      _Done when:_ a screen test finds a person's schedule note by its name
      on the all tab and on a matching focus-area tab, not on another tab, and
      the old "does not surface indicators" test is replaced.
- [x] **Step 3 - my schedule** - the hero card and "Your Week" rows list the
      shift's schedule notes by name, per half for a double shift. _Done when:_ screen tests find the indicator on
      the hero and in the week list, and a deleted (previous-only) entry shows
      none.
- [x] **Step 4 - shift detail** - a "Schedule notes" row in the detail stack,
      for single and split shifts. _Done when:_ tests show the row with each
      name, the draft wording for a draft, no row without indicators, and the
      old negative test replaced.
- [x] **Step 5 - Home schedule card** - each day lists its schedule notes by
      name under its pills. _Done when:_ a card test finds a day's note by
      name and the fixture without notes still renders.
- [x] **Step 6 - alert opens my shift** - a helper resolves a notification to
      the native route, sending `schedule_note_published` to the linked
      employee's shift for its date, used by the alerts list and alert detail.
      _Done when:_ tests show the own-shift route with the linked employee and
      date, the old route when there is no linked employee or no date, and
      other alert types unchanged; the domain destination test and the web
      parity test pass unchanged.

## Files / areas

- `apps/mobile/src/shared/components/ScheduleNoteLabels.tsx` (new) and a pure
  helper in `apps/mobile/src/features/schedule/lib/`.
- `packages/contracts/src/mobile.ts` (lenient state).
- `ScheduleScreen.tsx`, `ShiftDetailScreen.tsx`, `MyScheduleCard.tsx` and
  their styles and tests.
- `features/notifications/lib/openNotificationAction.ts`,
  `NotificationsScreen.tsx`, `NotificationDetailScreen.tsx` and tests.

## Data / contracts

- No API change beyond the lenient parse: 42b's `indicators` and
  `indicatorTypes` are the data.
- `indicatorsForRow(indicators, focusAreaId?)` returns
  `MobileScheduleIndicator[]`; `ScheduleNoteLabels` takes that list.

## Testing

- Pure helpers (style, label, filter, route) are unit-tested; styles are
  asserted through the helpers, since the test harness drops `style`.
- Screen tests use accessibility labels, following `ScheduleScreen.test.tsx`
  and `ShiftDetailScreen.test.tsx`; fixtures gain `indicators`.
- A simulator check of the Schedule tab and shift detail with a seeded
  indicator, when a simulator is available.
- Final gate: `npm run type-check`, `npm run test:mobile`, `npm run lint`;
  `npm run build:packages` before testing after the contract change.

## Edge cases

- A removal alert (`mode: "delete"`) still opens the person's shift, where
  the indicator is already gone; that is the day the change concerns.
- The alert's date comes from its metadata and must be a real calendar
  date; the shift opens with a one-day range, as the Home card's tap does.
  An alert naming another employee (`empId`) or carrying its own `actionUrl`
  keeps the shared destination. The alert detail screen waits for bootstrap
  before forwarding a note alert, so a cold start still opens the shift.
- "Your Week" titles do not wrap, so the notes sit on their own line in that
  row's copy rather than beside the title.
- Screen readers hear a note list as one element ("Schedule notes: Float;
  Training, added, not published"), since a row reads a labelled child's
  label and stops; the Home day's label carries its notes too.
- An entry from swap options or shift requests carries an empty list meaning
  "not looked up"; shift detail keeps the viewer's own `/me/schedule` entry
  first, which carries the real list.

## Notes for the AI

- Customers call these **schedule notes**, never "indicators": every label,
  heading and spoken phrase a client sees says "Schedule notes" (or "schedule
  note"). Code, types, routes and data keep the `indicator` naming.

- Mobile design rules: tokens through `shared/theme/tokens.ts`, no raw
  metrics, `fit` rules for text, never `adjustsFontSizeToFit`, pills never
  wrap; at a raised text scale, stack rather than wrap.
- No em dashes.
