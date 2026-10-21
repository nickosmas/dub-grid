# Fix: An approval replaces the draft of every cell it publishes

**Type:** Fix
**Status:** verified
**Branch:** `fix/approval-replaces-draft` (cut from `dev` at 0e0e1065)

### The problem

The owner's rule (2026-10-21): approving a shift request never goes through
the draft. It publishes at once, always goes ahead even when an affected
cell has draft changes, warns first, and then **replaces** those cells'
drafts, because the approval came after them. Later actions always win
(owner, 2026-10-21): any change made after the approval, including editing
that day again and publishing, wins over it as usual.

Publishing copies each draft cell's whole state over the published one
(`039_publish_lock_order.sql:70`). So any approved cell that keeps an older
draft is silently undone by the next publish: an older change beats a newer
one. `resolve_shift_request_unchecked`
(`030_auto_approve_shift_requests.sql:63`, not redefined since) discards the
draft in only two places:

| Request          | Cells it publishes                                                 | Draft discarded today                              |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Call-off         | requester on their date (`:213`, `:256`)                           | yes (`:279`)                                       |
| Volunteer pickup | volunteer on the date (`:561`, `:593`)                             | no                                                 |
| Claimed pickup   | claimer on the date (`:719`, `:751`); requester (`:774` to `:837`) | requester only when it becomes an absence (`:792`) |
| Swap             | both people on both dates (`:1041` to `:1278`)                     | no                                                 |

Nobody is warned either:

- The Requests board's dialog says "This will finalize the staffing
  change." (`ShiftRequestBoard.tsx:905`), and mobile says the same
  (`request-action-feedback.ts:101`). Neither knows about drafts.
- The dashboard's Approve and Reject (`ActionQueueCard.tsx`) already open a
  confirmation (corrected 2026-10-21: the first research said they did not),
  so every web approval and rejection confirms first, as the owner requires;
  the dialogs only lacked the warning.
- Automatic approval (`auto_approve_shift_request`, `030:1474`) approves when
  a party to the request can approve, with no screen at all.

### The fix

| Rule           | Value                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which cells    | Every cell the approval publishes: the requester's date for a call-off or volunteer pickup; requester and claimer on the date for a claimed pickup; each person on each date for a swap (two cells when both dates match)                                                                                                                                                                           |
| Where          | `resolve_shift_request_checked`, after an approval succeeds. Every approval reaches it: the public `resolve_shift_request` (through 075's guard) and `auto_approve_shift_request`                                                                                                                                                                                                                   |
| How            | The same per-cell discard `discard_schedule_drafts` does (`032_schedule_children_org_consistency.sql:237`): the draft snapshot, plus that cell's draft-only schedule notes, so no note is left without its shift. A rejection discards nothing                                                                                                                                                      |
| What warns     | A cell is "changed in the draft" only when its draft differs from its published snapshot, compared field by field exactly as publish compares them. A draft equal to published is not a change and gets no warning                                                                                                                                                                                  |
| Warning text   | One line per person, naming their days ("Laura Marshall has unpublished changes on Wed, Oct 28 and Fri, Oct 30."), requester first, then "Approving publishes this request now and replaces those changes." When the check itself fails: "These days couldn't be checked for unpublished changes. Approving publishes this request now and replaces any there are." Never silence on a failed check |
| Where it shows | The Requests board's approve dialog, the dashboard's (new: its Approve and Reject always confirm through the same dialog), and mobile's approve confirmation                                                                                                                                                                                                                                        |
| Automatic      | Replaces drafts the same way, with no warning, since nobody sees a screen (owner, 2026-10-21)                                                                                                                                                                                                                                                                                                       |

### Build steps

- [x] **1. Migration 086: approvals replace drafts.** A per-cell helper
      that discards one cell's draft the way `discard_schedule_drafts` does;
      `resolve_shift_request_checked` restated to call it for every cell an
      approval publishes; `shift_request_draft_cells(p_request_id)` returning
      the affected cells whose draft differs from published (employee,
      date), security definer (the snapshot reader it needs is closed to
      members) with its own check: an approver of that organization, a
      Gridmaster only while impersonating it; granted to `authenticated`.
      Checksum in `checksums.sha256`.
      _Done when_ live tests (pattern of
      `auto-approve-shift-requests.integration.test.ts`, drafts inserted as in
      `discard-schedule-drafts.integration.test.ts`) show, for a call-off, a
      volunteer pickup, a claimed pickup and a swap (same day and two days):
      every affected draft is gone after approval and the published state is
      the approved one; a rejection keeps every draft; an unrelated cell's
      draft is untouched; a draft note on an affected cell is discarded with
      it; automatic approval does the same; `shift_request_draft_cells`
      lists a changed draft and omits one equal to published; the
      Gridmaster guard still refuses outside impersonation; and a static SQL
      test proves the restated `_checked` equals 030's plus the new call.
      `npm run db:migrations:check` passes.
- [x] **2. The warning text and the read.** A shared formatter in
      `@dubgrid/domain` builds the warning lines from the draft cells and
      names; the web requests route gains a read of a request's draft cells,
      and the mobile request payload carries them for pending requests.
      _Done when_ the formatter's unit tests cover none, one, two people and
      a same-day swap, and route tests cover the web read and the mobile
      field (only for requests the caller can approve).
- [x] **3. Web confirmations and warnings.** The dashboard's Approve and
      Reject always open the Requests board's confirmation (same title,
      message and optional note), so no approval or rejection on web is one
      click. The approve dialog adds the lines (warning variant) when there
      are any.
      _Done when_ browser evidence as the QA account shows the dashboard's
      Approve and Reject each asking first, both approve dialogs with a
      draft-changed cell's warning and without one, and Cancel changing
      nothing; after approving, the grid shows the approved shift with no
      draft mark, and publishing keeps it.
- [x] **4. Mobile warning.** The approve confirmation adds the lines.
      _Done when_ the feedback tests cover the text and an iOS simulator run
      shows it.
- [x] **5. Docs.** The requests guide says an approval publishes at once
      and replaces earlier unpublished changes to those days.
      _Done when_ `npm run docs:check` and `npm run docs:verify` pass with
      the page's fingerprint re-recorded.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test` and `npm run build`
  pass; the step 1 live tests pass against the local stack.
- On the local app: draft a change to a person's day, approve their pickup
  for that day from Requests after reading the warning, publish, and the
  pickup is still there.

### Out of scope

- Approving from the staffing check (47d), which reuses this.
- Rejections, cancellations and expiry, which publish nothing.
- The two existing draft deletes in 030 stay; the helper is idempotent.

### Notes for the AI

- **The reads (step 2).** Web asks on demand with the route action
  `fetchShiftRequestDraftCells` (approvers only, Gridmasters while
  impersonating). Mobile gets `draftCells` on each request awaiting approval in
  the requests payload, for approvers only: absent means not checked, `null`
  means the check failed, `[]` means nothing to replace.
- **Step 3 evidence (2026-10-21).** On a throwaway stack
  (`npm run db:migrations:rehearse -- --from 084 --seeded`, 085 pushed on top)
  with a worktree dev server on :3104: the Requests board's Approve named
  "QA Management has unpublished changes on Tue, Oct 27." in the warning
  style; Cancel left the request pending and the draft in place; Approve
  published the pickup and removed that day's draft (database checked); the
  grid showed that day without a draft mark while the other days kept theirs;
  publishing the week kept the approved shift. The Admin dashboard's Approve
  showed the same warning for Oct 28 and the plain dialog for a day with
  nothing to replace.
- **Step 4 evidence (2026-10-21).** The feedback tests cover the warning,
  a failed check, nothing to replace, nothing checked, and no warning on a
  rejection; the approve sheet shows the lines in the shared `SectionNotice`,
  which gained a `warning` tone to match web. On a fresh iPhone 17 Pro
  (iOS 26.0) simulator, the branch served by a worktree Metro against a
  throwaway stack with 085: the Approval tab's Approve opened the sheet with
  "QA Management has unpublished changes on Tue, Oct 27. Approving publishes
  this request now and replaces those changes." above the note field, and
  approving from the phone published the pickup and removed that day's draft
  (database checked). The first attempts hung on the splash because the
  mobile env used the stack's `sb_publishable_` key; a local stack needs its
  `ANON_KEY` JWT (see the found issue below).
- **Found, not fixed here.** When `validateMobileEnv` rejects the config, the
  root layout renders `ConfigurationScreen` but nothing hides the native
  splash (only `StartupSplashGate` does), so the Configuration screen meant to
  explain the problem is never seen. Pre-existing on `dev`.
- **Migration number.** Built as 084, then renumbered as other work landed
  first: 46f took 084 and 45e took 085, so it ships as
  `086_approval_replaces_draft.sql`. 45e's 085 redefines
  `resolve_shift_request_unchecked` but not `resolve_shift_request_checked`,
  and writes the same people and days, so 086's list of published cells still
  matches. 46e's `085_publish_alerts_leave_the_database.sql` is in the shared
  local ledger without being on `dev`; it has to renumber when it lands. The
  shared local database stays at `dev`: the live tests apply 086 inside their
  own rolled-back transaction, and the browser and simulator evidence ran on
  throwaway rehearsal stacks (where it was still numbered 085).

- Never edit an applied migration; 086 restates only
  `resolve_shift_request_checked` and adds the two functions. Check the
  current publish comparison (including 082's rest-of-day absence fields)
  before copying it into `shift_request_draft_cells`.
- The cells per request come from the request row: `type`,
  `requester_emp_id`, `requester_shift_date`, `target_emp_id`,
  `target_shift_date`, `parent_request_id`.
- Live tests run in BEGIN/ROLLBACK with `actAsAuthenticated`; use the Calm
  Haven QA users, never Arden Wood.
- Copy: "unpublished changes", no em dashes.

### Final checks (2026-10-21, rebased on `dev` at da192350)

- `npm run type-check`, `npm run lint` (2 warnings, both pre-existing in files
  this fix does not touch), `npm run build`, `npm run docs:check`,
  `npm run docs:verify` and `npm run db:migrations:check` (86 contiguous
  files) pass.
- `npm run test`: every package, mobile (1,499) and web (6,027 of 6,028) pass.
  The one failure is `org-isolation.integration.test.ts`, which reads the live
  database's grants and reports `shift_request_draft_cells` missing because
  086 is not applied to the shared local database yet; it passes once 086 is
  applied.
- The live tests (`approval-replaces-draft.integration.test.ts`, 9) and the
  neighbouring approval, Gridmaster-guard, draft-discard and publish suites
  pass.
