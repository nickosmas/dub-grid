# Feature: Bulk status changes

**From build-plan:** feature 51h (item 51, Staff statuses)
**Status:** verified

## Goal

A manager selects several people on the People list and changes their status
together. The bulk bar offers every change that applies to at least one of
them, each with a count: **Mark active (2)**, **Reinstate (1)**,
**Restore (1)**, **Mark away (3)**, **Suspend (2)**, **Offboard (4)**. A
change opens one confirmation: "Mark 3 people away?", the usual short message
and Keep in mind box from `@dubgrid/domain`, the fields that change takes, and
a **Skipped** list naming each selected person it won't touch and why, with
the same reasons as Change status ("Only someone with an account can be
suspended.", "Already Away.", "You can't change your own status."). The
server makes each change with every per-person guard, writes one audit row per
person, and answers per person; when some don't go through, the dialog stays
open and names who wasn't changed and why, and only they stay selected.

Building it replaces the bar's per-person requests, three at a time against
the status route's limit of 10 every 10 seconds (F-103), with one request.

## Design reference

No new board. The bar keeps its look (the selection mode bar); the dialog is
the shared `ConfirmDialog` with the person dialog's Return date field and the
existing bulk reason field.

## Decisions made (owner delegated, 2026-10-28)

- **Actions:** Mark active (Away), Reinstate (Suspended), Restore
  (Offboarded), Mark away, Suspend and Offboard, named as on the status card.
  Reason: one name per change everywhere; a single "Mark active" for all three
  would hide that Restore puts someone back on staff.
- **Which buttons show:** a change shows only when it applies to at least one
  selected person, and always with its count. Reason: named buttons list only
  available changes (fix/status-choices-list); the count says how many it
  reaches even when it reaches everyone.
- **Skip reasons:** the same as Change status (`statusChoices`), plus "Already
  Away." (or Suspended, Offboarded, Active), "Only someone who is away can be
  marked active." (and the Reinstate and Restore equivalents), and "You can't
  change your own status." One shared domain function decides, so the bar's
  counts, the Skipped list and the server's refusals agree.
- **The only Super Admin:** the client can't know who that is, so the server
  refuses that person and the result names them with "Transfer ownership
  first." The guard now counts only Super Admins who can still sign in (not
  suspended, not offboarded), so one bulk can't suspend or offboard every
  Super Admin one after another; the single route gets the same fix.
- **Dates:** now only, except an optional **Return date** for Mark away, the
  same for everyone (no absence). Starts, Ends, a last day and an absence stay
  on each person's page. Reason: a shared return date fits a group leave; the
  rest are per-person plans, and an absence needs a return date per person to
  read right.
- **Reason field:** kept for Mark away and Offboard ("applies to all
  selected"), the two changes that store a note.
- **A planned change:** any other change replaces it, as on the person page;
  the confirmation adds "Changes planned for 2 of them are cancelled." A
  planned away still skips Mark away, and a last day still skips Offboard,
  with Change status's "Change it with Edit plan." reason.
- **One person:** when the change reaches exactly one person, the dialog uses
  their own copy (their name, their planned change, no sign-in line without an
  account), as today.
- **Server:** a new `POST /api/employees/status/bulk` taking up to 100 people
  with their versions, one action and its shared fields. The per-person work
  moves out of `POST /api/employees/status` into one shared function both
  routes call, so every guard (self, version, on the schedule, account,
  already in that status, a plan, the only Super Admin) and each audit row,
  sign-out, notice email and membership change is the same code. People run
  one after another, so the Super Admin count sees earlier changes. One rate
  limit check per bulk request (the 10 per 10 seconds limiter); one Gridmaster
  step-up check per request, for the same actions as the single route.
- **Partial failure:** each person commits on its own; a refusal or error for
  one never undoes or stops the others. The response lists each person's
  outcome. The client applies each saved row, refreshes a conflicting row to
  its latest, shows one toast when all went through, and otherwise keeps the
  dialog open listing who wasn't changed and why, with those people still
  selected.
- **Boundaries:** both status routes keep the live `canManageEmployees`
  check and the Gridmaster step-up in their own source; the shared change is
  a classified service helper, and the sensitive-action inventory asserts its
  sign-outs (Offboard, Suspend) and which actions need fresh proof.
- **Mobile:** none. The mobile People list has no selection, and bulk staff
  tools (import, bulk invite, reorder) are web-only already.

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`:
      `BulkStatusAction`, `bulkStatusSkipReason`, `planBulkStatusChange`
      (eligible and skipped people for an action), `describeBulkStatusAction`
      (title, message, points for a count, a planned-change line, one person's
      own copy), `SELF_STATUS_SKIP_REASON`. _Done when:_ domain tests cover
      each reason, the counts and the copy.
- [x] **Step 2 - Server.** Move the per-person status change into
      `features/employees/server/status-change.ts`; `POST /api/employees/status`
      calls it unchanged; the only-Super-Admin count
      leaves out suspended and offboarded ones; add
      `POST /api/employees/status/bulk`. _Done when:_ the existing status route
      tests pass untouched, and bulk route tests cover auth, CSRF, the rate
      limit, the step-up, validation, a mixed result (saved, refused, conflict,
      thrown), one audit row per saved person, and two Super Admins of two.
- [x] **Step 3 - Client.** `changeEmployeeStatuses` in the employees client
      and `handleBulkStatusChange` in `useEmployees` (saved rows in, conflicts
      refreshed, one refresh, no per-person toast); the People page runs it
      through the status step-up. _Done when:_ client tests.
- [x] **Step 4 - Web bar and dialog.** `StaffContextBar` shows the six
      changes with counts from the plan; a `BulkStatusDialog` with the copy,
      Skipped list, reason and Return date, a result view on partial failure.
      _Done when:_ component tests and screenshots.
- [x] **Step 5 - Docs.** Roster guide: bulk changes. _Done when:_
      `npm run docs:check` passes.

## Out of scope

- Bulk on mobile (see Decisions).
- Dated options in bulk: Starts, Ends, a last day, an absence.
- Bulk editing of plans, return dates or end dates.
- Bulk on the Management roster (it has no selection).

## Testing

- Domain tests; status route tests unchanged; bulk route tests; client and
  hook tests; MembersSection and bar component tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`.

## Notes for the AI

- No migration.
- `MembersSection` is the only user of `StaffView` and the People page the
  only user of `MembersSection`.
- Keep the step-up hide (`statusStepUpOpen`) on the new dialog (F-98).

## Completion evidence

- Gate in the worktree: `npm run type-check`; `npm run lint` (0 errors, the
  two old `<img>` warnings); `npm run test:mobile` (mobile 177 files, 1,556
  tests, and every package: domain 257 with 12 new); `npm run test:web`
  (712 files, 6,734 tests, on the final commit; the first run caught the three route-boundary inventories, which now classify the bulk route and the shared change); `npm run docs:check`.
- New tests: domain `bulk-status.test.ts`; the bulk route (CSRF, sign-in, one
  rate-limit check, permission, one Gridmaster step-up before anyone changes,
  validation, a shared return date checked once, a mixed result of saved,
  already Away, conflict, thrown and self, one audit row per saved person,
  Restore only for Offboarded, Suspend and Offboard follow-ups, and two Super
  Admins of two); the client call, the hook, the People page's step-up
  wrapper, and `MembersSection` (counts, skips, shared reason, result view,
  null outcome, step-up hide). The single status route's 64 tests pass
  unchanged after the extraction. The three boundary inventories classify
  the bulk route and the shared change.
- Browser, Calm Haven as the QA Super Admin (worktree dev server on 3001,
  three throwaway "Bulktest" people, deleted afterwards with their audit
  rows): the bar read **Mark active (1)**, **Mark away (2)**, **Offboard (3)**;
  Mark away for two people skipped the one already Away with "Already Away.";
  with one person's version bumped in the database the result read "1 person
  not changed" / "1 person marked away. Anyone not changed is still
  selected." naming them with "Their status changed elsewhere. Check it and
  try again.", and only they stayed selected; Mark active and Offboard for one
  person used that person's own copy; one `employee.deactivated`,
  `employee.activated` and `employee.removed` audit row per saved change,
  none for the conflict. Screenshots:
  `/private/tmp/claude-501/-Users-nickosmas-Dev-dub-grid/f10f6916-4f01-45ef-9fc0-fd498f7e0feb/scratchpad/shots/51h/`.
- Not verified in the browser: Suspend and Reinstate in bulk (the throwaway
  people had no account), the Return date picker, and a Gridmaster's step-up;
  route and component tests cover them. No mobile change.
