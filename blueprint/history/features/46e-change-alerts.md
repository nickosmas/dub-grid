# 46e - Schedule-change alerts

**Type:** Feature
**Status:** complete
**Branch:** `feature/46e-change-alerts` (cut from `dev` at 9eee6c67, rebased onto da192350)

### Goal

A publish tells each person exactly what changed in their schedule: one
alert per person per publish listing every changed day, a compact push, and
an email with Before and After.

### Decisions (delegated by the owner, 2026-10-21)

| Question       | Decision                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which alert    | The existing `shift_change` type, written once per person per publish by the server. The SQL insert in `publish_schedule_unguarded` goes (migration 087), and so does the browser's "Schedule updated" request after a publish |
| Who gets it    | People whose cells changed in this publish, except the publisher. Nobody else: the old "Schedule updated" went to every person with a shift in the range                                                                       |
| Before         | What was published before this publish (the change row's from state), which is the last thing the person could have seen                                                                                                       |
| Text           | Inbox and push: one line per day in the compact arrow form, the day first. Email: Before and After lines per day under the schedule email preference (off by default)                                                          |
| Details hidden | With `staff_see_shift_changes` off, a person who cannot edit or publish gets the changed days only ("Your shifts changed on Wed, Oct 22 and Fri, Oct 24")                                                                      |
| Publisher      | Never named in the alert, push or email, whatever the setting                                                                                                                                                                  |
| Push           | `shift_change` becomes push-eligible; the tap opens the first changed day                                                                                                                                                      |
| Notes          | A publish that changed only schedule notes sends no alert, as today                                                                                                                                                            |

### Build steps

- [x] **1. Migration 087.** `publish_schedule_unguarded` from its live text,
      without the per-person `shift_change` insert, keeping the readiness
      hunk and the 075 wrapper untouched.
      _Done when_ an integration test publishes a change for a linked person
      and finds no new notification row, and `db:migrations:check` passes.
- [x] **2. The alert text.** A pure `buildShiftChangeAlert` in
      `apps/web/src/features/notifications/server/` takes one person's changed
      days (each a `ShiftChange`) and whether details are shown, and returns
      the title, the compact message, the metadata (`date`, `dates`,
      `publishHistoryId`) and the email's intro and Before/After details.
      _Done when_ unit tests cover one day, several days in date order, a
      removed shift, a double shift day, and hidden details.
- [x] **3. Sending after a publish.** `notifyPublishedShiftChanges` reads the
      publish's cell change rows, maps employees to users (skipping the
      publisher and unlinked staff), resolves names with
      `fetchShiftChangeResolvers`, decides details per recipient with
      `scheduleViewerVisibility`, and sends through `sendNotification`. The
      publish route runs it with `after()` so a slow send never delays the
      publish; a failure is logged, never thrown. `shift_change` joins
      `PUSH_ELIGIBLE_TYPES`; the schedule page stops queueing
      `schedule_published`.
      _Done when_ tests cover recipients (changed, publisher skipped,
      unlinked skipped), one alert per person with every day, hidden details
      for staff but not for an editor, and the route scheduling the send.
- [x] **4. Qualification and docs.** Publish a change locally for the QA
      staff account and read the alert row, its message and metadata; check
      the inbox shows it and opens the day. Update the alerts and publishing
      docs.
      _Done when_ the row matches the decisions above and `docs:check`
      passes.

### Evidence

Local, 2026-10-21, this branch's dev server, Calm Haven. A draft Day Shift
for the QA staff member on Thu, Nov 12 (empty before), published through
`POST /api/shifts/publish` as `qa-super-admin`:

- After the response, exactly one alert existed for the publish: a
  `shift_change` row for `qa-regular`, title "Your schedule for Thu, Nov 12
  changed", message "Thu, Nov 12: No shift → Day Shift · Office · 7:00 AM -
  3:30 PM (8.5 hrs) · Skilled Nursing", metadata `date`, `dates` and
  `publishHistoryId`, no publisher. No "Schedule updated" row and no row
  from the database function. No email row, since schedule emails are off
  by default.
- `qa-regular`'s Alerts page lists it first, above the old "Schedule
  updated" rows that named the publisher.
- The test publish, its change rows, alert and audit row were removed
  afterwards.
- Migration 085 became 087: 45e and the approval fix landed 085 and 086 first. The shared local
  ledger was repaired to match.

### Verify

`npm run type-check`, `npm run lint`, `npm run test`,
`npm run db:migrations:check` and `npm run docs:check` pass.

### Out of scope

- Mobile inbox layout changes: the row already shows the message.
- Alerts for approved shift requests, which have their own types.
- Alert rows already written by the old SQL insert.
