# Feature: Work-limit warnings at publish

**From build-plan:** feature 60b
**Status:** verified
**Branch:** `feature/60b-publish-work-limits` (cut from `origin/dev` at 7ae642de1)

## Goal

Before a manager publishes, the publish confirmation lists everyone the
publish leaves over a work limit (more than 5 days in a row, more than 5
days in a Sunday-to-Saturday week, more than 40 hours in that week), with
the limit and its days. Publish stays available.

## Decisions (owner, 2026-11-27)

- Warn, never block; on screen only.
- The limits and counts are 60a's shared `workLimitBreaks`.

## Defaults (chosen here)

- **The schedule after publishing:** inside the publish window, the draft
  (deleted drafts count as empty); outside it, what is already published.
  Drafts in other periods are not published by this publish, so they don't
  count.
- **Who is listed:** anyone with a worked day in the window that crosses a
  limit, including a run or week that reaches into the period before or
  after, and including limits the published schedule already crossed.
- **One line per limit**, grouped by person, in a warning banner above the
  editor cards (verified in the browser: on Calm Haven's seed data the
  week of Nov 22 already puts five people over 40 hours, so every publish
  of that period lists them): "2 people will be over a work limit:" then
  "Laura Marshall: 6 days in a row, Wed, Nov 25 to Mon, Nov 30",
  "Laura Marshall: 6 days in the week of Sun, Nov 29",
  "Laura Marshall: 51 hours in the week of Sun, Nov 29".
- The dialog uses its warning look when anyone is listed, as it does for
  coverage gaps.

## In scope

- A pure check over the publish window on the post-publish schedule.
- The lines and banner in `PublishChangeSummary`.
- Wiring it into the publish confirmation, counted only while it is open.
- One line in `docs/features/draft-publish.mdx`.

## Out of scope

- Request approvals on web and mobile (60c).
- Blocking publish, notifications, grid marks.

## Build steps

- [x] **Step 1 - The check after publish** - `workLimitBreaksAfterPublish`
      in `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts`: builds
      the post-publish shift map (published values outside the window) and
      returns each person's breaks for worked days in the window, deduplicated,
      in date order. _Done when:_ unit tests cover a run reaching into the
      published period before, a draft outside the window ignored, a deleted
      draft in the window, a week over 40 hours, and nobody over.
- [x] **Step 2 - Lines and banner** - `publishWorkLimitLines` and a
      `PublishWorkLimits` banner in `PublishChangeSummary.tsx`. _Done when:_
      unit tests pin the lines for each limit and the one- and two-person
      heading.
- [x] **Step 3 - Publish confirmation** - `SchedulePageClient` computes it
      only while the dialog is open and passes it in; the dialog turns to its
      warning look; docs line. _Done when:_ in the browser, a draft that gives
      someone a sixth day in a row shows the banner in the publish dialog with
      Publish enabled, and a draft with nobody over shows none.

## Files / areas

- `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts` and test
- `apps/web/src/app/(app)/schedule/_components/PublishChangeSummary.tsx`
  and test
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`
- `docs/features/draft-publish.mdx`

## Data / contracts

- No migration. Reads `WorkLimitBreak` from `@dubgrid/schedule-core`.

## Testing

- Vitest for steps 1 and 2; browser evidence for step 3.

## Notes for the AI

- Never reimplement the counters.
- Copy: no em dashes, neutral banner text with the warning icon.
