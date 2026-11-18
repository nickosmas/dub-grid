# Feature: iPhone Duo split view for Requests

**From build-plan:** feature 59b
**Status:** not started
**Branch:** `feature/59b-duo-split-requests`

## Goal

Open, partly folded or held tall, the iPhone Duo shows Requests as a split
view: the request list on the left, keeping its full cards with Approve and
Reject, and the whole request on the right, with what answering it does and
that day's roster. It reuses 59a's frame.

## Design reference

- The "DubGrid on iPhone Duo" canvas, rows "Requests" (admin) and "Staff:
  Requests" (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).
- Right pane: a small "Request" heading and the kind ("Pickup"), the request
  card (who, the pill, what they asked and when, the shift), an "If approved"
  or "If you accept" box, the answer buttons, then "Working <day>": that
  day's shifts with who works them and how many are open.

## In scope

- The request outcome text moved from the web into `@dubgrid/schedule-core`,
  so both apps say the same thing; the web's hover card and panel text stay
  word for word.
- A request page: its own route on any phone (`/request/[id]`), and embedded
  in the split's right pane.
- Requests split: the first request in the visible tab until one is picked; a
  tap picks; the list's own title and tabs above it; the fold rule from 59a.
- Staff open on Mine, the request asked of them first (as today).

## Out of scope

- Schedule, Home, Alerts and Profile panes (59c to 59e); This week (59f).
- New request kinds or actions: the page answers with the actions the card
  already has.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [ ] **Step 1 - Shared request text** - move `describeRequestMark` and its
      helpers from `apps/web/src/app/(app)/schedule/_lib/request-mark-text.ts`
      into `@dubgrid/schedule-core`, taking the time formatter as an
      argument; the web imports it from there. _Done when:_ the web's
      existing tests for the text pass unchanged and the package builds.
- [ ] **Step 2 - Text for the request page** - a request-level wrapper that
      picks the viewer's side (an approver reads "If approved", the asked
      teammate "If you accept", the asker their own status) and returns the
      status, the outcome and when it was asked. _Done when:_ tests cover a
      pickup, a swap, a call-off and an offered shift for each side.
- [ ] **Step 3 - That day's roster** - a hook that reads the day's shifts
      from the schedule data the app already loads, grouped by shift with
      who works it and how many are open. _Done when:_ a test covers the
      grouping and an empty day.
- [ ] **Step 4 - The request page** - `RequestDetail` shows the heading, the
      card with its actions, the outcome box and the day's roster, with
      loading, error and "This request is gone" states; `/request/[id]`
      renders it on a phone. _Done when:_ a request opens on its own route
      and answering it from the page works.
- [ ] **Step 5 - Requests split** - in the split the list keeps its cards
      under its own title and tabs, the right pane shows the picked request or
      the first in the tab, the picked card is outlined, and the fold rule
      pushes a picked request with Back. Held tall, the list goes compact.
      _Done when:_ open, partly folded and held tall match the canvas for an
      admin and a staff account, and closing with a pick pushes the page.

## Files / areas

- `packages/schedule-core/src/` (new request text module + tests), the web's
  `request-mark-text.ts` (re-export or thin adapter).
- `apps/mobile/src/features/shift-requests/` (page, roster hook, screen),
  `apps/mobile/app/request/[id]/index.tsx` (new route).
- `apps/mobile/src/shared/layout/` reused unchanged.

## Data / contracts

- No server change: `MobileShiftRequest` already carries both cell states.
- The shared text returns `{ status, body, asked }` as the web's does today.

## Testing

- Tests: the moved text (the web's tests, unchanged), the request-level
  wrapper per kind and side, the day roster grouping.
- iPhone Duo simulator screenshots in all four poses, admin and staff, light
  and dark; a phone-sized check that `/request/[id]` reads well alone.
- `npm run test`, `npm run type-check`, `npm run lint`, the docs gate.

## Notes for the AI

- Insights must be exact (owner): every name, shift and time in the outcome
  comes from the request itself, as the web's does.
- Approvals publish at once; say so where the web does.
- Keep `@dubgrid/schedule-core` free of web or mobile imports; rebuild it
  (`npm run build:packages`) before testing the apps.
