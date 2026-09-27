# Feature: Mobile indicator display

**From build-plan:** feature 42c
**Status:** spec - awaiting review (parked; another session's fix holds
`current-feature.md`)

## Goal

Mobile shows schedule indicators wherever a person's shift is shown: the
Schedule tab, the person's own schedule, shift detail and the Home schedule
card, each by the indicator's own name and colour, using the data 42b added.
A `schedule_note_published` alert opens the person's own shift for that day
instead of the team schedule.

## In scope

- **One indicator mark.** A shared `IndicatorDots` component: a small dot per
  indicator in its own colour, spoken as its name (and, for an editor's
  draft, "added, not published" or "removed, not published"), with a pure
  helper that chooses which indicators a row shows. A published indicator is a
  filled dot; a draft addition is a filled dot at reduced strength; a draft
  removal is a hollow ring. Dots are chrome, not pills, so they carry no text
  and never wrap a label.
- **Schedule tab (team).** Each person's row shows their indicators after
  their name. With a focus-area tab selected, a row shows the indicators for
  that focus area and those with no focus area; the all tab shows them all,
  one per indicator.
- **My schedule.** The hero card's title row and each "Your Week" row show the
  shift's indicators (on the hero, dots sit on a white ring for contrast).
- **Shift detail.** An "Indicators" row in the detail stack lists each
  indicator's dot and name, with the draft wording for an editor. It shows
  nothing when there are none, and it also appears for split shifts.
- **Home schedule card.** Each day's header shows that day's indicator dots,
  keeping the card's fixed pill height and the dashboard's no-pill rule.
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

## Design decisions (for review)

- **Draft states.** Mobile has no dashed styling and its badges are never
  outlined, so a draft addition is a filled dot at reduced opacity and a draft
  removal a hollow ring; the spoken label and the detail wording carry the
  state. Web's dashed borders are not copied.
- **Colours.** The raw indicator colour in both themes, as on web; the
  pastel dark-mode remapper would dull these saturated marks. A light ring
  keeps a dark dot visible on dark surfaces.

## Build steps

- [ ] **Step 1 - the mark and its rules** - `IndicatorDots`
      (`apps/mobile/src/shared/components`), a pure style helper per state, a
      pure spoken-label helper, a pure `indicatorsForRow(indicators,
focusAreaId?)` that filters by focus area and removes duplicates by
      indicator and state, and a lenient `state` in the contract. _Done
      when:_ tests cover each state's style and label, the focus-area filter
      (matching, null and all), duplicate removal, an empty list rendering
      nothing, and an unknown state parsing as published.
- [ ] **Step 2 - Schedule tab team rows** - `TeamShiftMemberRow` renders the
      row's indicators after the name, filtered by the active focus-area tab.
      _Done when:_ a screen test finds a person's indicator by its spoken name
      on the all tab and on a matching focus-area tab, not on another tab, and
      the old "does not surface indicators" test is replaced.
- [ ] **Step 3 - my schedule** - the hero title row and "Your Week" rows show
      the shift's indicators. _Done when:_ screen tests find the indicator on
      the hero and in the week list, and a deleted (previous-only) entry shows
      none.
- [ ] **Step 4 - shift detail** - an "Indicators" row in the detail stack,
      for single and split shifts. _Done when:_ tests show the row with each
      name, the draft wording for a draft, no row without indicators, and the
      old negative test replaced.
- [ ] **Step 5 - Home schedule card** - day headers show the day's dots.
      _Done when:_ a card test finds a day's indicator by spoken name and the
      fixture without indicators still renders.
- [ ] **Step 6 - alert opens my shift** - a helper resolves a notification to
      the native route, sending `schedule_note_published` to the linked
      employee's shift for its date, used by the alerts list and alert detail.
      _Done when:_ tests show the own-shift route with the linked employee and
      date, the old route when there is no linked employee or no date, and
      other alert types unchanged; the domain destination test and the web
      parity test pass unchanged.

## Files / areas

- `apps/mobile/src/shared/components/IndicatorDots.tsx` (new) and a pure
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
  `MobileScheduleIndicator[]`; `IndicatorDots` takes that list.

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
- The alert's date comes from its metadata, or failing that from its link;
  the shift opens with a one-day range, as the Home card's tap does.
- "Your Week" titles do not wrap, so the dots sit on their own line in that
  row's copy rather than beside the title.
- An entry from swap options or shift requests carries an empty list meaning
  "not looked up"; shift detail keeps the viewer's own `/me/schedule` entry
  first, which carries the real list.

## Notes for the AI

- Mobile design rules: tokens through `shared/theme/tokens.ts`, no raw
  metrics, `fit` rules for text, never `adjustsFontSizeToFit`, pills never
  wrap; at a raised text scale, stack rather than wrap.
- No em dashes.
