# Fix: Change status lists every status, and the card names a lone change

**Type:** Fix
**Status:** verified - squashed onto `dev` (2026-10-28).

### The problem

In production, on Calm Haven, Comfort Adjaye (Active, no account, an Away
planned from Sun, Nov 1): the status card's **Change status** opened straight
into "Offboard Comfort Adjaye?" instead of a list, and Suspend was nowhere.
Owner: "clicking on change status on this staff goes straight to offboard view
instead of showing multiple options. Look for other similar bugs" and
"suspend is not shown".

`statusChoices` (`packages/domain/src/employment-status.ts`) dropped every
choice that wasn't possible right now: Suspend without an account, Away off
the schedule or with an away planned, Offboard with a last day planned (51g2).
The web dialog (`EmployeeStatusActions.tsx`, `onlyChoice` when one choice was
left) and the mobile sheet (`PersonDetailScreen.tsx`, `openStatusSheet` and
`onlyChoice`) then skipped the list and opened that one change's
confirmation. The manager saw neither the other statuses nor why they were
missing, under a button that promised a choice.

### The fix

1. `statusChoices` returns every status other than the current one, each with
   `available` and `unavailableReason`; `availableStatusChoices` returns the
   ones that can be picked now. `suggestedStatusChoice` uses the available
   ones. Reasons come from `@dubgrid/domain`, so web and mobile share them:
   - Suspend, no account: "Only someone with an account can be suspended."
     (`NO_ACCOUNT_MESSAGE`, the server's refusal).
   - Suspend, while Away or Offboarded: "Only someone who is active can be
     suspended." (`NOT_SUSPENDABLE_MESSAGE`).
   - Away, not on the schedule: "Only someone on the schedule can be marked
     away." (`NOT_ON_SCHEDULE_MESSAGE`).
   - Away, an away planned: "Planned from Sun, Nov 1. Change it with Edit
     plan."
   - Away, Offboarded: "Only someone on staff can be marked away."
   - Offboard, a last day planned: "Leaving Thu, Oct 29. Change it with Edit
     plan."
2. The Change status list (web `RadioCardList`, mobile `ProfileChoiceGroup`)
   shows an unavailable status disabled: muted, not selectable,
   `aria-disabled`, with its reason in place of its detail. A disabled row is
   never picked for them, and with nothing picked the confirm button stays
   disabled. Change status never jumps to a single confirmation.
3. The status card of someone Active (web `StatusCardActions`, mobile
   `StatusCards`): two or more available changes keep **Change status**; one
   is the button's name ("Offboard", from `describeStatusAction`) and opens
   that change's confirmation; none shows no button (the planned card's Edit
   plan still works). The ⋯ menu for Suspended and Away people lists only
   available changes.
4. Public docs (`docs/staff/roster.mdx`, `docs/staff/detail-page.mdx`) say
   so; manifest evidence re-recorded.

### Decisions made (owner delegated, 2026-10-28)

- Change status always opens the list of every other status, on web (panel,
  page) and mobile - the button promises a choice, so it shows one.
- A status that can't be picked stays listed, disabled with a one-line reason
  in place of its detail - managers see why, not a silently shorter list.
- When exactly one change is available, the card's button is named for it
  and opens its confirmation; with none, no button (owner refinement,
  2026-10-28).
- Named buttons and the ⋯ menu list only available changes - a named action
  that can't run would be a dead button.
- Reasons reuse the server's refusal messages where they exist, so the list
  and a refused request say the same thing.
- The list for someone Away or Offboarded also carries the disabled rows
  (Suspended; Away and Suspended), for one rule everywhere, though the card
  only reaches those people through named buttons today.
- A change a surface has no handler for (Suspend, Reinstate) is still left
  out of that surface's list: every product surface passes both, so this is
  only a guard.
- The Gridmaster person card and the People bulk bar are left as they are:
  both are named buttons, not a list, and already show only applicable
  changes (the bulk bar with counts); 51h reworks the bulk bar.

### Sweep: cases checked

| Person                                                | Card (web and mobile)                        | Change status list              |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------- |
| Active, account, on schedule                          | Change status                                | Away, Suspended, Offboarded     |
| Active, no account, on schedule                       | Change status                                | Suspended disabled              |
| Active, account, not on schedule                      | Change status                                | Away disabled                   |
| Active, no account, not on schedule                   | **Offboard**                                 | (not reached)                   |
| Active, away planned, account                         | Change status                                | Away disabled (Edit plan)       |
| Active, away planned, no account (the bug)            | **Offboard**                                 | (not reached)                   |
| Active, last day planned, account                     | Change status                                | Offboarded disabled (Edit plan) |
| Active, last day planned, no account, on schedule     | **Mark away**                                | (not reached)                   |
| Active, last day planned, no account, not on schedule | none; Edit plan                              | (not reached)                   |
| Suspended                                             | Reinstate + ⋯ Mark away, Offboard            | Away disabled off the schedule  |
| Away                                                  | Mark active + ⋯ Change return date, Offboard | Suspended disabled              |
| Offboarded                                            | Restore                                      | Away, Suspended disabled        |

- Gridmaster, Super Admin, Admin: every web surface (People panel, person
  page) passes the Suspend and Reinstate handlers, so the lists match; mobile
  has no per-surface handler. A Gridmaster acts through impersonation in the
  same components.
- Self: the status section stays hidden (self guard), unchanged.
- Only Super Admin, and tier guards: the server refuses with "Transfer
  ownership first."; the client can't know beforehand, unchanged.
- Bulk bar (`StaffContextBar`): named buttons with counts, unchanged.
- Gridmaster person card (`PersonStaffActions`): named buttons, no list, no
  auto-jump; unchanged.

### Build steps

- [x] **Step 1 - Domain shape and reasons.** `statusChoices` with
      `available`/`unavailableReason`, `availableStatusChoices`, tests.
      _Done when:_ domain tests cover each reason and the bug's case.
- [x] **Step 2 - Web.** `RadioCardList` disabled rows; the dialog never
      auto-picks; `StatusCardActions` names a lone change or shows none.
      _Done when:_ component tests for the bug's case, one available, two or
      more, none.
- [x] **Step 3 - Mobile.** Sheet never auto-picks, disabled rows;
      `StatusCards` names a lone change or shows none. _Done when:_ screen
      tests as on web.
- [x] **Step 4 - Docs.** Roster and person page text; fingerprints.

### Verify

- On a person with no account and an away planned, the card's button reads
  **Offboard** and opens "Offboard <name>?".
- On a person with no account, **Change status** lists Suspended grayed out
  with "Only someone with an account can be suspended."; clicking it does
  nothing and the confirm button stays disabled.

### Evidence

- `npm run type-check`, `npm run lint` (0 errors), `npm run docs:check`
  pass; `npm run test:web` 709 files, 6,663 tests; `npm run test:mobile`
  177 mobile files (1,546 tests) plus every package suite, all passing.
- Local Calm Haven, QA Super Admin: Carol Henderson (no account, away
  planned from Sun, Nov 1, the production case) shows **Offboard** on her
  card, opening "Offboard Carol Henderson?"; Barbara Trent (no account)
  shows Change status with Suspended disabled and its reason. Screenshots:
  `/private/tmp/claude-501/-Users-nickosmas-Dev-dub-grid/f10f6916-4f01-45ef-9fc0-fd498f7e0feb/scratchpad/shots/fix-status-choices/` (`carol-no-account-planned-away-card.png`, `-dialog.png`,
  `barbara-no-account-card.png`, `-dialog.png`).
- Not checked on a simulator; the mobile screen tests cover the sheet and
  the card.
