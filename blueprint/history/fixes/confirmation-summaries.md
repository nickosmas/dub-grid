# Current Feature

## Confirmation dialogs say what happens in a summary box

**Type:** Fix
**Status:** verified

## The problem

Confirmation dialogs explain their consequences in a paragraph above the
buttons ("They can still sign in and keep their role, but they won't be
scheduled while they're away. Their upcoming shifts come off in the draft,
..."). A manager has to read the whole sentence to find out what the confirm
does, and every dialog lays it out differently. The Publish dialog already
does better: a summary box above the buttons that lists what the publish
contains.

Owner, 2026-10-26: what happens to them should be in points, in a box above
the buttons like the publish dialog's, in every confirmation dialog, designed
for clarity, concision and a modern look.

## The fix

- **Web `ConfirmDialog`** gains `summary` (`{ title?, points }`): a bordered,
  rounded box with one full-sentence point per line, divided by hairlines,
  right above the buttons, under a "Keep in mind" label. `message`
  becomes optional and holds only a short lead or the fields the confirm
  needs (a reason, a choice).
- **Mobile** gets the same box (`ConfirmSummaryBox`), as a `summary` prop on
  `ConfirmationModal` and for use inside confirmation sheets.
- **Every confirmation dialog** on web and mobile moves its consequences into
  points. A dialog that only asks a question keeps a one-line lead and no
  box.

Points are short fragments without a closing full stop, start with a capital,
name no product, never use em dashes, and read the same for one person or
several where the dialog can cover several. Staff-facing copy still names
only the state; managers' points spell out consequences.

Must not break:

- Every dialog keeps its title, buttons, variants, loading and step-up
  behaviour; only the body changes.
- Fields inside a dialog (reasons, pickers) stay above the box, so the box
  sits right above the buttons.
- Screen readers still get the description: the box is inside the dialog's
  `aria-describedby` region.

## Build steps

1. [x] **The box, and the status dialogs.** `ConfirmSummaryBox` on web and
       mobile; `summary` on `ConfirmDialog` and `ConfirmationModal`; status
       action copy in `@dubgrid/domain` becomes `points`; Mark away, Archive,
       Mark active, Restore, the bulk dialog and Gridmaster's staff actions use
       it.

   **Done when:** status dialog tests pass; a screenshot of Mark away and
   Archive on web.

2. [x] **Web dialogs, schedule, people and account.** Every `ConfirmDialog`
       under `app/(app)`, `components/` (not `gridmaster/` or `settings/`),
       `components/staff`, `components/account`, `components/profile`.

   **Done when:** their tests pass and no consequence paragraph is left.

3. [x] **Web dialogs, settings and Gridmaster.**

   **Done when:** their tests pass and no consequence paragraph is left.

4. [x] **Mobile dialogs.** Every `ConfirmationModal` and confirmation sheet.

   **Done when:** mobile tests pass and no consequence paragraph is left.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test`, `npm run docs:check`.
- Screenshots of a few converted dialogs on web.

## Not in scope

- Non-confirmation modals (editors, pickers, forms).
- Changing what any action does.

## Outcome

The owner refined the design several times on 2026-10-26, each applied to
every dialog:

1. **Points in a box above the buttons**, like the publish summary.
2. **Nothing obvious:** points that restated the title or button were cut.
3. **A short message under the title** carries the plain effect and context;
   the box is only for extra things a manager should know.
4. **Context and reasons go in the message**, and a box needs at least two
   points: a single fact is folded into the message ("Nothing uses Night
   Float, so it's deleted permanently."). Both dialog components render a
   lone point as a sentence as a safety net.
5. **Points read clearly:** full sentences with a full stop, a clear subject
   and object, no person's name outside the title, and no run of points
   opening with the same word.
6. **Heading:** "Keep in mind", chosen from five alternatives on the canvas,
   sits above the box at body size (inside the border it read as a cramped
   caption).
7. **Titles name the thing, and messages never repeat them:** "Archive Calm
   Haven?", "Remove "Day" on Tue, Nov 3?". A message appears only when it
   adds an effect beyond the verb, context, a reason, a warning or an
   instruction. Button labels are unchanged.

- **Built:** `ConfirmDialog` `summary` and `ConfirmSummaryBox` on web and
  mobile; status copy (`describeStatusAction`: `message`, `points`, a
  `group` form for bulk) in `@dubgrid/domain`; every web `ConfirmDialog`
  (schedule, requests, people, account, settings, Gridmaster) and every
  mobile `ConfirmationModal`, confirmation sheet and discard guard;
  Gridmaster billing outcome helpers as full sentences. The approval warning
  stays an amber notice (a caution, not a consequence). A one-person bulk
  dialog uses the person's name in its title.
- **Evidence:** `npm run type-check`, `npm run lint` (two existing
  `<img>` warnings) and `npm run test` across every workspace (web 6,449,
  mobile 1,518, packages all passing); `npm run docs:check`; screenshots of
  Mark away in light and dark; the "Confirmation dialogs" canvas
  (https://claude.ai/artifact/5NNrKGC7xaqjFu7RqTDSUW) draws every dialog by
  area with the final copy.
- **Not observed:** the mobile dialogs on a simulator (tests only) and
  `e2e/invitation-reissue.spec.ts` (edited, not run locally).
- **Kept by choice:** email addresses stay in the invitation dialogs, where
  the address identifies the invitation.
