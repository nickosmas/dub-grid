# Feature 59a: iPhone Duo split view frame and People

**From build-plan:** feature 59a
**Status:** verified
**Branch:** `feature/59a-duo-split-people`

## Goal

Open or partly folded, the iPhone Duo shows People as Apple's split view: the
list on the left and a person's page on the right, instead of one stretched
column. This lays the shared frame (hinge state, split layout, fold rule) that
59b to 59e reuse for every other page.

## Design reference

- `blueprint/reference/59-duo-people-admin.png` and
  `blueprint/reference/59-duo-people-staff.png`: the canvas's People row in
  all four poses, rendered from the "DubGrid on iPhone Duo" canvas
  (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).
- Open: the list pane (title, Add person and Filter beside it, search, rows,
  the picked row highlighted) at 360 pt, then the person's page. Partly
  folded: each pane fills its half. Held tall: a 300 pt list beside the page,
  horizontal bars. Closed: unchanged, one level.
- This week and "Working with you this week" in those images belong to 59f.

## In scope

- The hinge state reaching JavaScript through a small local Expo module
  (`UIHingeInteraction`, iOS 27.1).
- A tested split layout rule and a shared `SplitView`.
- People split: list left, the existing person page right; the first person
  until one is picked; a tap picks, the picked row highlighted.
- In the split, Add person and Filter sit above the list, and Edit is a
  symbol in the side column.
- The fold rule: a picked person folds into the pushed person page with
  Back; the default gives way to the list; unfolding while a person page is
  pushed shows it picked in the split.

## Out of scope

- This week and "Working with you this week" (59f).
- Requests, Schedule, Home, Alerts and Profile panes (59b to 59e).
- Android foldables and iPad.
- Sheets: they already present natively and fit their width (#640).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Hinge state** - a local Expo module in `apps/mobile/modules/`
      that attaches `UIHingeInteraction` to the key window and sends its
      status (closed, partly open, fully open) to JavaScript, plus a
      `useHingeStatus()` hook that reads "unknown" anywhere else (older iOS,
      Android, web, tests). Native rebuild required. _Done when:_ on the Duo
      simulator a temporary log shows the status change as the pose changes,
      and the hook's mapping test passes.
- [x] **Step 2 - Split layout and SplitView** - `getSplitLayout({ width,
hinge })` returns no split under 600 pt, half the width when partly
      folded, 360 pt for the list at 744 pt and up, 300 pt between; a
      `SplitView` lays out list | divider | detail and keeps each pane's
      content inside it. _Done when:_ the rule's tests cover each pose, and a
      throwaway People render shows two panes at the right widths open,
      partly folded and held tall.
- [x] **Step 3 - An embeddable person page** - `PersonDetailScreen` takes an
      optional `personId` and `embedded`; embedded, it shows a small "Staff
      profile" heading and the name in the pane instead of retitling the
      native bar, and keeps its loading, error and empty states inside the
      pane. The `/person/[id]` route behaves as before. _Done when:_ the
      route page looks the same as before on a phone, and an embedded render
      shows the person.
- [x] **Step 4 - People split** - in the split, the list fills the left pane
      and the right pane shows the picked person, or the first in the list;
      a tap picks rather than pushes, and the picked row is highlighted.
      With no one in the list, the right pane says so. _Done when:_ open,
      partly folded and held tall on the Duo show the list and a person;
      tapping rows switches the right pane; closed is unchanged.
- [x] **Step 5 - Bars in the split** - Add person and Filter sit above the
      list in the left pane (off the native bar while split), and Edit for
      the shown person is a pencil symbol in the side column with the label
      "Edit"; editing works in the pane, and the unsaved-changes guard still
      asks before switching person. _Done when:_ the split's bars match the
      reference, Edit opens editing in the pane, and switching person with
      unsaved edits asks first.
- [x] **Step 6 - Fold rule** - closing with a picked person pushes their
      page with Back; closing on the default leaves the list; opening while a
      person page is pushed pops it and shows that person picked. _Done
      when:_ each of the three cases behaves so on the Duo, and the decision
      logic has a test.

## Files / areas

- `apps/mobile/modules/hinge/` (new local Expo module: Swift, podspec,
  `expo-module.config.json`, TypeScript entry); `apps/mobile/package.json`
  only if autolinking needs the folder named.
- `apps/mobile/src/shared/layout/` (new): `split-layout.ts` + test,
  `SplitView.tsx`, `useHingeStatus.ts` + test.
- `apps/mobile/src/features/people/screens/PeopleScreen.tsx`,
  `PersonDetailScreen.tsx`, `app/person/[id]/index.tsx`.
- Header action helpers if Edit needs a symbol variant
  (`HeaderTextBarAction` or a sibling).

## Data / contracts

- No server or API change.
- Load-bearing for 59b to 59e: `HingeStatus = "closed" | "partiallyOpen" |
"fullyOpen" | "unknown"`, `getSplitLayout()` returning
  `{ listWidth: number } | null`, and `SplitView`'s `list` / `detail` props.
  Later pages reuse them unchanged.

## Testing

- Tests (Vitest, `npm run test:mobile`): the hinge hook's mapping, the split
  layout rule per pose and width, and the fold-rule decision.
- UI rides on Duo simulator screenshots in all four poses, for an admin and a
  staff account, light and dark, plus a regular iPhone simulator to show
  nothing changed there.
- `npm run type-check`, `npm run lint`; the docs gate for any page whose
  evidence the change touches.

## Notes for the AI

- The native module needs a prebuild and a native rebuild in the worktree;
  Metro serves the worktree (`mobile-duo` launch config, no `CI=1`).
- Never drive the other session's iPhone 17 Pro simulator: pass the Duo's
  UDID to every simulator control call.
- Keep platform checks out of screens (lint rule): the hinge hook and layout
  rule own them.
- Staff see the person page they already see today; the split changes the
  layout, not what anyone may see.
- No inline styles, no em dashes, comments only for the why.

## Outcome

Verified on the iPhone Duo simulator (iOS 27.2) against the `dev` backend's
QA super admin:

- Closed: People unchanged, one level. Open: 360 pt list with its own title,
  Add person, Filter and search, no row chevrons, the picked row
  highlighted; the person's page beside it with Edit as a pencil in the side
  column. Partly folded: the panes split at the fold (476 pt). Held tall: a
  300 pt list, horizontal bars. Dark mode checked.
- A tap swaps the person; the first person (other than you) shows before a
  pick. Editing works in the pane, and switching person with unsaved edits
  asks "Discard your changes?" first.
- Fold rule: closing with a picked person pushes their page with Back;
  opening again returns it to the split, still picked.
- `npm run test:mobile` (1,816 tests), `npm run type-check`, eslint.

Differences from the spec, for review:

- The pane keeps the person page's own hero (avatar and name) instead of a
  small "Staff profile" heading; the hero already names the person.
- While editing in the pane, Cancel sits at the bar's leading edge, above the
  list, as the native bar places it; Save takes the side column.
- A staff account wasn't checked on the simulator; the pane renders the same
  person page staff already get, so what they may see is unchanged.
