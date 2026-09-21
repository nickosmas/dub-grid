# Mobile consistency fixes, manager swap cancel, request queue columns

**Type:** Fix

**Status:** built, verifying

## The problem

Reported on mobile and traced across both apps:

- The dashboard Coverage card shows nothing for the meter and "0 open gaps"
  when no coverage requirements exist, and the page has no wash at all.
- People rows highlight as a square block flush with the text.
- Scheduled staff are added on a pushed page, management users on a sheet;
  the Add button follows the roster tab instead of asking which kind; the
  invitation picks the access level with a segmented control and departments
  with a chip cloud.
- A swap (or a pickup offered to one person) that its recipient has not
  answered sits in the web approval queue with no note and no action, and is
  filtered off the mobile Approval tab; `cancel_shift_request` already lets an
  admin withdraw it, only the UI was missing.
- The approval queue is one flat grid mixing call-offs, accepted swaps, open
  pickups and swaps awaiting a response.
- The History tab's range picker committed on every tap; Reports had its own
  hand-rolled calendar with the same two-tap commit.
- App-wide: chip clouds in two more places, no press feedback on several
  schedule rows and cards, opacity fades elsewhere, a note field inside a
  confirmation modal, Title Case action labels, "workspace" on the login
  screen.

## The fix

- `@dubgrid/domain`: `isAwaitingRecipient`, `describeAwaitingRecipient`,
  `describeCancelAwaitingRecipientCaution`, `groupManagerQueue`.
- Mobile: coverage setup empty state and aurora wash; rounded bleed
  highlight on People rows and the schedule rows, cards and stat tiles;
  `AddPersonKindSheet` + `AddPersonSheet` replace `/people/add`;
  `OrgRoleChoice` (described radio list, Super Admin gated) and
  `ProfileChoiceGroup` departments in both invitation sheets; call-off reason
  as a `SelectionSection`; Approval tab grouped with manager Cancel and the
  caution; Approve/Reject note in a sheet; sentence-case labels.
- Web: `ShiftRequestBoard` awaiting note, manager Cancel with the caution,
  `onCancel(requestId, requesterEmpId)`, approval queue as titled columns;
  shadcn `Calendar` (`react-day-picker`) behind a new `DateRangePicker` with
  draft + Apply, used by History and Reports.

## Build steps

- [x] **1. Domain helpers** - predicate, copy and grouping, with tests.
- [x] **2. Mobile dashboard and People row** - empty state, wash, highlight.
- [x] **3. Mobile add-person flow** - kind chooser, both sheets, list choices.
- [x] **4. Mobile app-wide pass** - copy, chip clouds, press feedback, note sheet.
- [x] **5. Requests on both apps** - awaiting note, manager cancel, grouping.
- [x] **6. Web date range picker** - shadcn calendar, Apply, History and Reports.
- [x] **7. Content-sized toolbars and fields** - wrapping rows of content-sized
      controls app-wide; tables left as they were.

## Verify

- Unit: domain (11), mobile people/dashboard/schedule/requests suites, web
  board (11), reports (16), date-range-picker (4), typography contract.
- Type-check, lint and the full mobile and web suites from the worktree.
- Manual: see the verification list in the plan (simulator and browser).
