# DubGrid - Project Overview

<!-- blueprint:source-hash 46ae31997488017e77a794f32b9efef8434d29b8886b8af5a7d4487f1e26e2b8 -->

> Multi-tenant employee scheduling for care facilities, delivered through a
> connected Next.js web app and Expo mobile app.

## Problem

Care facilities need more than a shared scheduling spreadsheet. Concurrent
editing, tenant isolation, role-based access, staff lifecycle changes, shift
requests, and auditable schedule history all require a connected system with
clear authorization and recovery behavior. DubGrid provides that system for
organization staff, managers, and platform operators.

## Users

- **Staff** - view schedules, submit pickup, swap, and call-off requests, and
  receive alerts on web and mobile.
- **Managers and Admins** - build and publish schedules, manage people, review
  requests, run reports, and configure the organization. Admin capabilities are
  assigned per person through a 25-permission set.
- **Super Admins** - have full control inside one organization, including Admin
  permissions and billing.
- **Gridmasters** - operate the cross-organization platform, including
  impersonation, platform audit, feature controls, and tenant lifecycle. This is
  an internal platform role, not an organization admin portal.
- **Organizations** - are isolated tenants with their own subdomain, data,
  settings, terminology, and subscription state.

## Features

Items appear in build-plan order. Items 1 through 39 and 41 through 52 are
shipped. Item 40 is in progress. Items 53 and 54 are planned.

| Item | Status      | Outcome                                                                                                                         |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Shipped     | Multi-tenant organizations with subdomain isolation and organization-specific settings.                                         |
| 2    | Shipped     | Four-tier RBAC with per-person Admin permissions.                                                                               |
| 3    | Shipped     | Week, two-week, and month schedule views with draft and publish workflows.                                                      |
| 4    | Shipped     | Realtime editor presence plus optimistic conflict detection; advisory cell locks were removed.                                  |
| 5    | Shipped     | People lifecycle, departments or focus areas, roles, and certifications.                                                        |
| 6    | Shipped     | Pickup, swap, and call-off requests with approval events and snapshots.                                                         |
| 7    | Shipped     | Shared coverage calculations and role-aware dashboard analytics.                                                                |
| 8    | Shipped     | Staff hours, activity, and other reports with CSV and PDF export.                                                               |
| 9    | Shipped     | Internal Gridmaster platform operations, impersonation, audit, and tenant controls.                                             |
| 10   | Shipped     | Stripe per-seat subscriptions with a 14-day trial beginning on first Super Admin login.                                         |
| 11   | Shipped     | Expo mobile access to schedule, people, requests, alerts, dashboard, and account surfaces, with deliberate web-only boundaries. |
| 12   | Shipped     | Invite-only, pre-confirmed account creation and member onboarding.                                                              |
| 13   | Shipped     | Web and mobile recovery, MFA/TOTP, and per-session organization isolation.                                                      |
| 14   | Shipped     | Web and mobile notification inboxes.                                                                                            |
| 15   | Shipped     | PDF, CSV, calendar, and print outputs where supported.                                                                          |
| 16   | Shipped     | Internal Test Sandbox using a cookie-selected cloned organization.                                                              |
| 17   | Shipped     | Capability-aware People forms that hide scheduling or management fields when access changes.                                    |
| 18   | Shipped     | Mobile role eligibility and a canonical shared dashboard model and experience.                                                  |
| 19   | Shipped     | Auth and onboarding correctness, journey coverage, resilience, security, and release qualification.                             |
| 20   | Shipped     | An explicit, accessible control for removing an active schedule note.                                                           |
| 21   | Shipped     | Resilient Settings display previews and content-aware configuration tables.                                                     |
| 22   | Shipped     | Qualified, conflict-free staffing of open shifts through the normal draft workflow.                                             |
| 23   | Shipped     | Overflow-safe pills, chips, badges, and segmented controls across web and mobile.                                               |
| 24   | Shipped     | Inter for product UI, DM Sans for the wordmark and marketing headings, and tabular scheduling numerals.                         |
| 25   | Shipped     | Shared web UI contracts plus route, role, state, viewport, theme, and zoom qualification.                                       |
| 26   | Shipped     | Removed duplicate Staff-page data loading.                                                                                      |
| 27   | Shipped     | Cleared the stale publish-highlight state after publication.                                                                    |
| 28   | Shipped     | Removed duplicate published-range loading on the Schedule page.                                                                 |
| 29   | Shipped     | Removed duplicate dashboard request fetching and realtime subscriptions.                                                        |
| 30   | Shipped     | Removed duplicate operations-report fetching.                                                                                   |
| 31   | Shipped     | Made publish-difference highlighting work in Month and Mobile Day views.                                                        |
| 32   | Shipped     | Made adjacent-day staffing overlap checks explicit and complete.                                                                |
| 33   | Shipped     | Exercised the staffed-call-off finalization trigger with real publish behavior.                                                 |
| 34   | Shipped     | Added final swap resolution alerts for an affected swap partner.                                                                |
| 35   | Shipped     | Shared one reference-counted mobile shift-request realtime channel.                                                             |
| 36   | Shipped     | Delayed the trial welcome until onboarding is complete.                                                                         |
| 38   | Shipped     | Unified mobile spacing, type, controls, dashboard, request exits, sheets, and qualification evidence.                           |
| 39   | Shipped     | Made alerts navigate to their subject through one shared destination contract.                                                  |
| 37   | Shipped     | Reconciled and applied the production migration suffix through 040 with scratch rehearsal and ledger verification.              |
| 41   | Shipped     | Invitation, credential, session, recovery, and security-notice hardening with Gridmaster grants that need fresh proof.          |
| 42   | Shipped     | Schedule notes on every schedule surface, each belonging to its shift.                                                          |
| 43   | Shipped     | Complete person records for managers and one Gridmaster person page with two-factor lockout recovery.                           |
| 40   | In progress | Public and internal documentation accurate for `dev`, with permanent drift gates.                                               |
| 44   | Shipped     | Safe billing actions, Gridmaster billing controls and policy, and billing history.                                              |
| 45   | Shipped     | A worked shift plus an absence in one cell, such as D/Bereavement or D/E/Sick.                                                  |
| 46   | Shipped     | Every shift change reads the same detailed way everywhere; organizations can hide change details and the publisher from staff.  |
| 47   | Shipped     | The Coverage panel becomes a staffing check of the draft, with exact suggestions that fix gaps or explain why none can.         |
| 48   | Shipped     | Coverage Check becomes the Schedule Builder, which fills and explains the draft for a period in one undoable change.            |
| 49   | Shipped     | Auto-build stays responsive, reads clearly, limits five days in a row, pairs days off, and follows shift preferences.           |
| 50   | Shipped     | An absence beside a shift covers the scheduled time that wasn't worked, before or after the work.                               |
| 51   | Shipped     | People are Active, Away, Suspended or Offboarded, with a last day and return date; managers see who takes a seat.               |
| 52   | Shipped     | A whole-day absence on days in a row reads as one bar per week in the grid, labeled with its name and a count of days.          |
| 53   | Planned     | Past days are finished: a past cell opens Correct this day, which fixes the published day with a reason.                        |
| 54   | Planned     | People away or absent all period sit last in their section, under a group row that folds.                                       |

Item 40 is split:

- **40a - Source-derived inventory and documentation contract:** shipped.
- **40b - Public scheduling, people, and configuration guides:** shipped.
- **40c - Public mobile, account, alerts, reports, billing, and access
  guides:** shipped; every public page is verified against source, and the
  replaced pages redirect.
- **40d - Current engineering, architecture, security, and operations
  references:** shipped.
- **40e - Cross-platform runtime qualification and permanent drift gates:**
  in progress; requires recorded iOS and Android evidence.
  - **40e1 - Closed documentation contract and drift gates:** shipped.
  - **40e2 - Isolated migration readiness qualification:** shipped;
    `npm run db:migrations:rehearse` rehearses a ledger suffix on a throwaway
    local stack, and 001 to 079 is qualified as a clean install, an upgrade
    from 075, and a seeded upgrade with a signed-in smoke.
  - **40e3 - Web browser role and state qualification:** shipped;
    Chromium, Firefox and WebKit at desktop and 390 by 844 pass every role
    against a seeded throwaway stack and a production build, recorded under
    `internal/operations/runtime-qualification/` and as `runtimeEvidence`
    the docs check validates (`--require-runtime-evidence` for 40e).
  - **40e4 - Native iOS and Android qualification:** in progress; Android
    evidence is mandatory.
    - **40e4a - Simulator and emulator qualification:** shipped; every
      mobile role and state was observed on the iOS Simulator and an Android
      emulator (offline on Android only), recorded as virtual-device evidence
      that the 40e gate does not count.
    - **40e4b - Physical-device pass:** planned; needs a physical iPhone and
      Android phone, and is the only mobile evidence the gate accepts.

Item 44 is split, and every part has shipped:

- **44a - Billing safety fixes:** shipped; a sync no longer locks a trialing
  organization, a canceled one can subscribe again, and webhooks, checkout,
  and Gridmaster billing writes can no longer leave the wrong state.
- **44b - Gridmaster billing controls:** shipped; overrides need a reason and
  say what they do, disabled actions explain themselves, one End trial control
  offers the grace period or locking now, and the Billing tab loads only its
  organization.
- **44c - Customer billing clarity:** shipped; the customer billing feed shows
  only changes that affect the organization, without payment-provider data,
  seat figures read in plain words, and the mobile locked screen offers billing
  only when billing is the cause.
- **44d - Billing policy settings:** shipped; trial length, trial grace,
  reminder window, and payment grace are platform defaults a Gridmaster can
  change, with per-organization overrides, and every access decision uses the
  organization's effective values (migration 076).
- **44e - Pause and resume:** shipped; a Gridmaster can pause an
  organization's billing, which keeps it open, stops the trial clock and
  Stripe collection, and gives the trial back the paused time on resume, and
  can extend a trial's grace through its override (migration 077).
- **44f - Past-due deadlines and lock alerts:** shipped; a subscription that
  needs payment locks once its payment grace runs out, counted from when it
  first needed attention (never without a recorded start), and Super Admins
  are alerted when their organization locks (migration 078).
- **44g - Seat and revenue history:** shipped; append-only seat and invoice
  history and a Gridmaster revenue and seats report that states when its
  history starts (migration 079).

Item 45 is split, and every part has shipped:

- **45a - Data model:** shipped; a worked cell may carry one absence,
  through draft, publish, publish history and import (migration 082).
- **45b - Web editor and grid:** shipped; the panel adds an absence beside
  one or two shifts and records when the last shift ended ("Worked until"),
  and the Week and 2 Weeks grid draws it last, stacking a three-item cell in
  a taller row. Drafts, publish, copy and drag keep every part (migration
  083).
- **45c - Other web surfaces:** shipped; the phone-width schedule, print
  (a taller row for a three-item cell), both dashboards, reports, both CSV
  exports, the calendar feed and the activity log show the absence after
  the shifts, at no hours. Coverage, hours, Month and the person page
  already handled it.
- **45d - Mobile app:** shipped; Your Week, the team list, shift detail
  and the admin Home card show the absence after the shifts, from an
  optional `restOfDayAbsence` the server adds to each entry; hours are
  unchanged.
- **45e - Shift requests:** shipped; a mixed cell can be offered, swapped
  or called off, and an approval keeps the absence on the shifts left
  behind (or for the whole day when none are). Someone absent for the rest
  of a day is not offered and cannot claim, volunteer for or swap into
  another shift that day (migration 085).

The absence always comes last and carries no hours; at most two worked
shifts share a cell with it (owner decisions, 2026-10-19). It is always called an absence (owner, 2026-10-20). Someone absent for the rest of a day takes no more work that day (owner, 2026-10-21). Item 50 replaces the rest-of-day rule and the absence-last rule.

Item 46 is split, and every part has shipped:

- **46a - Shared change model and formatter:** shipped; one schedule-core
  function turns a cell's original and current state into Before and After sides,
  with the original taken from the earliest in-window publish. Tested; no
  UI.
- **46b - Web schedule surfaces:** shipped; grid chip tooltips, the hover card with
  the day bar, the deleted pill, the edit panel's unsaved-changes summary
  (paired by identity), and Publish History (every segment's times, archived
  shifts by name).
- **46c - Web dashboards and records:** shipped; the staff dashboard "Was" block
  (fixing the production path that drops time and focus area), the admin
  "My schedule" tooltip and the Gridmaster person record.
- **46d - Mobile:** shipped; Your Week shows a "Was" block once per changed
  day and shift detail opens "What changed" with Before and After and the
  day bar, from a whole-day change the server computes with the shared
  model. With what changed hidden, a removed shift's entry is left out.
- **46e - Schedule-change alerts:** shipped; each person whose shifts a
  publish changed (except the publisher) gets one alert listing every
  changed day against what was published before, as a compact push and,
  under their schedule email preference, an email with Before and After.
  It never names the publisher, names the days only when the organization
  hides what changed, and replaces "Schedule updated" (migration 087).
- **46f - Staff visibility setting:** shipped; Settings > Display decides
  whether staff see what each changed shift was and who published (both on
  by default). Hidden, staff keep a plain New, Changed or Removed mark and
  "Published <time>"; the server folds and strips the data, and staff can no
  longer read publishers or change rows directly (migration 084). Anyone who
  edits or publishes the schedule always sees both.
- **46g - 12-hour sweep:** shipped; any remaining 24-hour time shown to people uses
  the shared 12-hour format.
- **46h - Activity log Before and After:** shipped; each single-cell save
  records the cell as it stood before (one extra read, no migration), and
  the organization activity log names the person and shows Before and
  After. Rows saved earlier show the new shift only.

A shift change shows every field that tells the two sides apart (shift, job
spelled out, 12-hour times with hours, focus area, absence), under Before and
After headings; the arrow is only for compact spaces such as push. Staff are
assumed to have seen nothing in between publishes. Design reference: the
"Shift change display" canvas (owner decisions, 2026-10-20 and 2026-10-21).

Item 47 is split, and every part has shipped:

- **47a - Matrix and changes since publish:** shipped; Coverage Check
  shows each requirement's staffed and needed counts by day, short or over,
  for the draft and the published schedule, what the draft opens and closes,
  and a detail per cell with Fill a spot and Show in grid. Mentored credit
  sums without float noise everywhere coverage is counted. No migration.
- **47b - What changed:** shipped; a cell's detail lists each person whose
  draft change moved its count (moved to or from a day, changed shift, given
  an absence, taken off, scheduled, mentoring), from the same per-person
  credit the coverage engine counts, so the lines always add up to Before
  versus After.
- **47c - Suggestion engine:** shipped; a tested schedule-core function that
  proposes moves back, restores, assignments and waiting pickups, measures
  each on a copy of the schedule with the coverage engine, keeps only those
  that fix a gap without opening another, names repeating gaps, and says why
  each other qualified person was not suggested. No UI yet.
  A person fits when qualified and free that day; there is no weekly hours
  limit or minimum rest rule (owner, 2026-10-21).
- **47d - Suggestions in the panel:** shipped; the panel lists the engine's
  suggestions (top 3, show all), each cell's detail shows Ways to fix and
  Not suggested, Move back, Restore and Schedule apply through the normal
  draft save with Undo, Approve asks first and publishes, and the Publish
  dialog says how many gaps a publish opens and closes.

Every staffing insight is measured on the schedule and must be exact; an
approval publishes at once and replaces any earlier draft of the cells it
writes, with a warning first (owner decisions, 2026-10-21). Design
reference: the "Staffing check panel" canvas.

Item 48 is split, and every part has shipped:

- **48a - Rename and Build section:** shipped; Coverage Check is named
  Schedule Builder, and a Build section previews a build of the period and
  focus areas shown (changes, people, short shifts and staff short now and
  after) and applies it through the draft with one Undo, which leaves any
  cell changed since alone.
- **48b - Recurring schedules first:** shipped; a build fills the empty
  cells recurring schedules cover in its scope first, by the same rule as Fill
  from Recurring Schedules, and plans the fixes on top, in the same preview
  and Undo.
- **48c - Absences and requests:** shipped; a waiting request blocks
  scheduling that person that day, and the preview's Not scheduled names
  everyone left out of a shift it leaves short, with each date and reason.
- **48d - Overtime threshold:** shipped; the builder prefers people who stay
  within 40 hours a week (Sunday to Saturday, fixed for the US, no setting)
  and names anyone it takes over with their weekly hours. The Build section
  is lean: one summary line, before and after pairs, and the people left out
  collapsed.
- **48e - Fairness:** shipped; between people who would fill a shift the
  same way, a weekend shift goes to the fewest recent weekends, a night shift
  to the fewest recent nights (the four published weeks before and the
  period), and otherwise to the fewest hours in the period; each choice
  records why for the report.
- **48f - Build report:** shipped; after a build the section reports what
  each person was given and why, anyone over 40 hours a week, and each shift
  still short as a link to its cell, until Done or the build's Undo.

Item 49 is split, and every part has shipped:

- **49a - Loading that never freezes:** shipped; planning yields with a percentage bar, and Apply counts every save before the report.
- **49b - Auto-build naming:** shipped; Auto-build with a plain description, Generate schedule, Apply and Discard, and a calendar toolbar button with no count.
- **49c - Five days in a row, days off in pairs:** shipped; no sixth day in a row from a build, a suggestion or a recurring fill, counted across periods, and days off kept in pairs unless nobody can.
- **49d - Day off absence:** shipped; Schedule Rules names the day off absence (pre-detected by name), and a build writes it into each scheduled person's empty days.
- **49e - Shift preferences:** shipped; per person Prefers or Only a set of shifts on the Recurring Shifts page (migration 089), which Auto-build and its suggestions follow.
- **49f - Allow a sixth day:** shipped; an option before generating lets a build give someone a sixth day in a row, never a seventh, with a warning and each run named.

A build never schedules anyone more than five days in a row, unless the
scheduler turns on "Allow a sixth day in a row" before generating (never a
seventh, with a warning); it avoids going past 40 hours a week and does so
only when nobody else can fill a gap, naming each person. Between people
for a shift it ranks: days off kept in pairs (split only when nobody can
fill the shift otherwise); shift preference; fewest weekends and nights;
fewest hours (owner decisions, 2026-10-23). It is named Auto-build, with
a short plain description under the title, Generate schedule, Apply and
Discard, and the day off absence is a Schedule Rules setting pre-detected
by name.

The builder only fills: it applies recurring schedules, fills empty cells
and puts back the draft's own removals, and never moves or replaces anyone
already scheduled. It avoids going past 40 hours a week and does so only when
nobody else can fill a gap, has no rest rules yet, and never includes
approvals (owner decisions, 2026-10-22). The Tools item that fills from
recurring schedules is named Fill from Recurring Schedules (2026-10-22).

Item 50 is split, and every part has shipped:

- **50a - Worked until limits:** shipped; times stay inside the shift (no
  23.75-hour shift from a time before the start), the absence must cover
  some time, and removing it puts the shift's times back.
- **50b - Data model:** shipped; the absence stores its own start and end; existing
  rows read as running from the last shift's end to its scheduled end.
  Migration 092; the server fills times a save leaves out and refuses an
  absence that covers no time or overlaps the work.
- **50c - Web panel:** shipped; the absence card offers Left early (Left at)
  or Arrived late (Arrives at), cuts the shift there, takes off a shift that
  wasn't worked and brings it back when the time moves, offers a whole-day
  absence when none of the shift was worked, and draws the day bar.
- **50d - Grid and other web surfaces:** shipped; the grid, print, the
  phone-width Day view and both dashboards put the absence in time order
  (first when they arrived late), join it to the shift it meets, and name the
  time it covers, with the next day named past midnight.
- **50e - Change records:** shipped; Before and After, alerts, push, the
  activity log, reports, CSV, export and the calendar name the time an absence
  covers ("Sick 11:00 AM - 3:00 PM, not worked"), in time order, and a change
  to that time alone is a change.
- **50f - Mobile app:** shipped; Your Week, the Home card and shift detail
  show the time an absence covers, before the shift when they arrived late,
  from a span and side the server adds to each entry.
- **50g - Requests and availability:** shipped; after leaving early someone
  takes no more work that day, after arriving late only overlapping shifts
  are out, in requests, volunteering and staffing (migration 093), and
  copying a cell with an absence copies only its shifts.

An absence beside a shift records the part of a shift someone missed: they
left early or arrived late. It shows the time it covers, sits in time order,
joins a shift whose time it meets, and can't be saved when it covers no
scheduled time. It may come before a shift and still carries no hours; after
a left-early absence the person takes no more work that day, and an
arrived-late one blocks only shifts that overlap it (owner decisions,
2026-10-24). Design reference: the "Absence beside a shift" canvas.

Item 51 is split, and every part has shipped:

- **51a - Away keeps access:** shipped; an inactive (Away) person keeps
  sign-in, role and management powers on web, mobile and in the database,
  isn't signed out, and takes a seat only as an Admin or Super Admin; only
  someone on the schedule can be marked inactive (migration 098).
- **51b - Status names everywhere:** shipped; Away and Archived replace
  Inactive and Removed on web, mobile, Gridmaster, reports, alerts and the
  activity log, with Mark away, Archive, Mark active and Restore as separate
  actions; a calm "You're away." bar replaces the warning bar; Settings >
  Billing lists who takes a seat and who isn't billed. No migration.
- **51c - Suspended: access:** shipped; a suspended person stays Active and
  on the schedule but can't sign in to that organization (the hook refuses
  them), is signed out everywhere and gets no push, and sees "Access
  suspended" at sign-in on web and mobile. Suspended pills, and Reinstate in
  place of Mark away, on web, mobile and Gridmaster (migration 101). The
  Suspend dialog is 51d.
- **51d - Suspended: managing it:** shipped; one Change status button and
  dialog (web and mobile) replaces the separate status buttons: a tinted box
  says where they stand and only the statuses they can move to are listed,
  Suspend among them. Every confirmation has a close button. A suspended
  person's grid row carries a lock, Assign open shift says "won't see this
  in the app", suspending emails them and alerts the other Super Admins, and
  their open requests close while a pickup they claimed goes back up
  (migration 102).
- **51e - Away until a date:** shipped; Mark away takes an optional return
  date (web and mobile), the person is schedulable again from that date, and
  a daily job sets them back to Active in the organization's timezone. Their
  recurring schedules pause while away and fill again from the return date;
  "Away until Jan 4" shows on pills and the record, and the grid draws their
  away days as one Away bar per week (migration 099).
- **51f - An absence while away:** shipped; with a return date, Mark away
  and Change return date offer an absence (web and mobile) that fills every
  day from today to the return date in the draft, over any shift, and
  publishes with the period. The grid's bar reads "Away · Vacation" and a
  locked day says why; moving the date, changing or clearing the absence, or
  marking them active early rewrites the days (migration 100).
- **51g - Dated status changes:** shipped; a status change can start on a
  later date; until then the person stays as they are, the days it covers
  are locked and changed in the draft, and a daily job applies it on the day
  in the organization's timezone.
  - **51g1 - Away from a date:** shipped; Change status takes a Starts
    date up to a year ahead beside the return date (web and mobile), and
    **Schedule away** plans it: they stay Active until then, the days from
    it are locked and cleared in the draft (under the absence when one is
    picked), the plan shows as "Away from Nov 10" and can be changed or
    cancelled, and the daily job marks them Away on the day (migration
    103).
  - **51g2 - Last day:** shipped; Offboard takes an optional Last day,
    today up to a year ahead (web and mobile). They stay Active through it
    and show "Leaving Nov 8"; the days after it are locked and cleared in the
    draft, with their open requests closed, nobody can schedule them, the
    grid draws them as an Offboarded bar, and the daily job offboards them
    the day after the way a manual Offboard does. One plan per person: a
    last day replaces a planned away, and any other change cancels it
    (migration 104).
  - **51g3 - Suspended until:** shipped; Suspend takes an optional Ends
    date and a Starts date up to a year ahead (web and mobile). "Suspended
    until Nov 20" shows on pills, the card and the record, and sign-in names
    the day; a later start shows "Suspended from Nov 10" as the plan and
    locks no day. The daily job reinstates them on the end and starts a
    planned suspension the way a manual Suspend does (migration 105).
  - **51g4 - First day:** shipped; Add Staff Members takes an optional
    First day, from today up to a year ahead (web and mobile), and the
    person form offers it only while it's ahead, or as Set first day to
    someone Active who hasn't worked a shift yet (owner, 2026-10-28). Nobody
    can schedule them before it, and setting it later clears those draft
    days and closes their requests; they show "Starts Nov 10" in the People
    list, on a dashed card and in the grid until then, keep sign-in and a
    seat, and the date stays on the full profile's record. No job step
    (migration 106).
- **51h - Bulk status changes:** shipped; the web People list's bulk bar
  offers Mark active, Reinstate, Restore, Mark away, Suspend and Offboard,
  each with how many selected people it reaches. One confirmation names who
  it skips and why (Change status's reasons), Mark away takes one return
  date, and one request changes each person with the single route's checks
  and audit row; anyone not changed is listed with why and stays selected.
  Web only. No migration.
- **51i - Losing a focus area:** shipped; saving someone without a focus
  area they have shifts in from today on asks first, with the count and
  dates (web and mobile): Clear shifts takes them off in the draft and
  closes their open requests, Keep shifts leaves them, closing saves
  nothing. The server refuses the save until it's answered; the clear runs
  after the save in one transaction (migration 107).
- **51j - No contact without sign-in:** shipped; every alert's push and
  email goes only to someone who can still sign in to its organization, so
  Suspended, Offboarded, removed from the organization and a deactivated or
  terminated account get none (Suspended keeps its one notice email), and
  Reinstate or Restore brings delivery back with nothing stored. A
  Suspended person's in-app alerts still collect; nothing is written for
  the others. Security alerts follow the account. No migration.
- **51k - One Offboard:** shipped; an Offboard ends the membership and
  sessions whoever makes it (web, app, bulk, the last-day job), Restore
  reopens it for anyone alike, and only a Super Admin offboards or restores
  a Super Admin. Gridmaster's Remove from organization offboards the staff
  record too, a pickup an offboarded person claimed goes back up, and
  memberships left live for offboarded people are closed (migration 108).
- **51l - Restore on a date:** shipped; Restore takes a Starts date up to a
  year ahead (web and mobile, **Schedule restore**), the person stays
  Offboarded until then with "Returns Nov 10" on the dashed planned card,
  People list and record, Edit plan moves, cancels or clears it, and the
  daily job restores them on the day in the organization's timezone, their
  membership reopened. They can't be drafted before the day; bulk Restore
  stays now-only (migration 109).

Statuses are named Active, Away, Suspended and Archived; code keeps
`inactive` and `removed`, and suspension, the return date and a planned
status change are new columns, so a Suspended person stays `active` and schedulable. An
Away person takes a seat only while they can manage; a Suspended one always
does. Anyone who can change a status today can suspend, with the self and
tier guards. Suspension stops push and schedule emails (one notice email,
alerts still accrue) and closes their open requests. A last day archives
automatically. Schedule changes from a status go through the draft and
publish with the period. Staff copy names only their state and its date and
calls the product "the app", not DubGrid (owner decisions, 2026-10-26).
A "requests only" state waits for a real need. Marking someone away offers
an absence type in the same confirmation (51f), so 51e and 51f come next,
before 51c (owner, 2026-10-26). Dated status changes are one item (51g)
replacing a separate last day: any change can start on a later date, Away
and Suspended can end on one, and a new hire can start on their first day
(owner, 2026-10-27). Design reference: the "Staff
status across surfaces" canvas and the "Fine-grained removal in DubGrid"
doc.

Item 52, absence runs in the grid, has shipped; 51e's
Away bar is drawn the same way. A whole-day absence on days in a row, the
day off absence included, draws as one bar per week in the Week and 2 Weeks
grid with no lines inside, labeled "Vacation ×4" (one day shows just the
name; names are never pluralized). A bar breaks at a different absence, a
day with a shift, the end of the week, and a day changed in the draft. Each
day stays its own cell: hovering draws dashed edges around it, hides the
label and lights its column header, and its panel offers Remove this day or
Remove all 4 days in the draft with one Undo (owner decisions, 2026-10-26).
Design reference: the "Absence runs in the grid" board on the "Staff status
across surfaces" canvas.

Item 53, past-day corrections, is planned. Days before today get a light
wash in the grid, with shifts and absences at full color, and drag, paste,
bulk delete, Auto-build and recurring fills never touch them. A past cell opens Correct
this day: shift and absence, a required reason, and Before and After. The
correction changes the published day at once, sends staff no alert, keeps
the published version in Publish History, logs the reason, and marks the
cell Corrected; hours and reports use it. Admins correct the last 14 days,
older days need a Super Admin, and a day someone could have worked can be
corrected even while they're away (owner decisions, 2026-10-28).
Correcting needs Edit shifts and Publish schedule, and each correction is
kept in its own record, read by the activity log and the cell's mark;
Publish History stays as each publish left it (owner decisions, 2026-10-28).

Item 53 is split:

- **53a - The correction itself:** shipped; a server function and route
  (migration 110) write the published day, clear its draft, check the
  reason, the 14-day window and that the person could have worked the day,
  record the correction and an activity-log row, and send no alert. It also
  stops the cell-save function writing published cells for people who can
  only edit shifts.
- **53b - Past days in the grid:** planned; the Light tint, every bulk and
  fill path skipping past days, the server refusing past drafts, and the
  Correct this day panel.
- **53c - Corrected everywhere:** planned; the Corrected mark, the activity
  log, dashboard hours and the public docs.

Item 54, Away all period, is planned. In the Week and 2 Weeks grid, anyone
Away or on a whole-day absence for every day on screen moves to the end of
their section under a group row "Away all period · 2" that folds; folded, it
names each person and why. The day off absence alone doesn't count, the
group starts open, and each viewer's browser remembers folding it (owner
decisions, 2026-10-28).

Public documentation covers customer behavior only. Gridmaster tooling, Test
Sandbox, feature flags, migrations, environment variables, and internal HTTP
endpoints remain internal.

## Data model

### Organization

- `id` (UUID) - tenant identifier
- `subdomain` (text) - organization routing boundary
- `name` (text) - customer-facing organization name
- terminology and configuration fields - organization-specific labels and
  settings, including what staff see after a publish (change details,
  publisher name; item 46f)
- `workspace_kind` - the only approved use of the word "workspace" in product
  data
- has many memberships, employees, schedule records, requests, notifications,
  and audit entries

### Profile

- `id` (UUID) - Supabase Auth user identifier
- `platform_role` - platform-level role, including Gridmaster
- has memberships in one or more organizations
- has sessions and account-level security, notification, privacy, and calendar
  preferences

### Organization membership

- `org_id` and `user_id` - tenant and profile relationship
- `org_role` - Super Admin, Admin, or User
- `admin_permissions` (JSONB) - the 25-key per-person Admin capability set
- onboarding completion and tour state
- archived and access state used by admission checks
- belongs to one organization and one profile

### Employee

- `org_id` and linked user identity where present
- department or focus-area assignment, role, and certifications
- `employment_status` - active, inactive, or removed; only active staff can be
  scheduled and count toward billing. Item 51 names them Active, Away and
  Archived and adds suspended access, a return date, a planned status
  change with its dates (51g) and a first day (`first_day`, 51g4); an Away
  person keeps sign-in and counts toward billing only while they can manage,
  and a Suspended one stays active and schedulable but can't sign in
- scheduling and management access are independent capabilities
- belongs to one organization and participates in schedules and requests

### Schedule entry and recurring shift

- organization, employee or open-shift identity, date, shift, job, and absence
  facts
- a cell holds worked shifts, an absence, or (item 45) up to two worked
  shifts plus an absence for the rest of the day; item 50 makes that one
  absence cover scheduled time that wasn't worked, before or after them
- draft and published state with optimistic versioning
- snapshot fields are the source of truth for schedule-cell audit history
- recurring shifts generate bounded series through the normal draft workflow

### Schedule note

- organization, employee, date, note type, and the shift it belongs to
- draft and published state; every note records its author

### Shift request

- `org_id`, requester, optional target person, and related schedule entry
- `type` - pickup, swap, or call-off
- status, approval events, and immutable request snapshots
- belongs to an employee and organization

### Notification

- organization, recipient, type, read or archived state, priority, metadata, and
  optional action destination
- destinations are resolved through the shared domain contract

### Subscription

- organization, Stripe customer and subscription identifiers, seat count, and
  trial or billing state
- the trial begins on first Super Admin login, not at signup

### Audit log

- actor, action, target, timestamp, and organization when applicable
- organization activity is customer-facing; platform audit remains internal

### Auth session

- session identity, user identity, organization, assurance, and revocation state
- drives per-session JWT claims and live authorization checks

> Schedule snapshots, organization scope, and the effective sandbox-aware
> organization ID are security and history boundaries. Later work must preserve
> them.

## Tech stack

- **Monorepo** - npm workspaces and Turborepo across `apps/web`,
  `apps/mobile`, and 11 shared packages.
- **Web** - Next.js 16 App Router, React 19, strict TypeScript, and Tailwind CSS
  v4.
- **Mobile** - Expo SDK 54, Expo Router, and React Native.
- **Backend** - Supabase Postgres, Auth, Realtime, and Row Level Security with no
  ORM.
- **Data access** - direct Supabase clients on the server, TanStack Query v5 for
  client and mobile state, and the authenticated mobile HTTP API for application
  data. Mobile uses Supabase directly for Auth and Realtime, not application
  table CRUD.
- **Validation and auth** - Zod and locally verified JWTs through `jose`.
- **Scheduling UI** - `@dnd-kit` for web drag and drop.
- **Infrastructure services** - Upstash rate limiting, Stripe, Resend, Sentry,
  PostHog, and Vercel Analytics.
- **Testing** - Vitest, Testing Library, and Playwright.
- **Documentation** - Mintlify, with a source-derived inventory, an accuracy
  manifest whose pages carry evidence fingerprints, and `docs:check`,
  `docs:fingerprint`, and `docs:verify`.

## Monetization

DubGrid uses Stripe per-seat subscriptions, billed monthly. New organizations
receive a trial beginning on the first Super Admin login, then grace days
before the organization locks: 14 and 3 days by default, set by the platform
billing policy with per-organization overrides. An Away person takes a seat
only while they can manage; a Suspended person always takes one, and an
Archived one never does (item 51).

> TODO: exact per-seat prices and tier breaks remain unconfirmed.

## UI/UX

- Product UI and ordinary copy use Inter. The DubGrid wordmark and landing or
  marketing headings use DM Sans.
- The interface supports dark and light themes and uses shared semantic design
  tokens across web and mobile.
- Organization-configurable terminology must come from organization settings,
  never hardcoded defaults.
- "Organization" is customer-facing terminology. Code may use `org` or
  `organization`; "workspace" is reserved for the literal `workspace_kind`
  field. Customers say "schedule notes"; code keeps `indicator`.
- Schedule data uses tabular numerals.
- Times shown to people are 12-hour (`7:00 AM - 3:00 PM`); a shift crossing
  midnight names both days (`Wed 11:00 PM - Thu 7:00 AM`).
- Mobile has native primitives and motion while preserving the same product
  hierarchy and accessibility contract as web.

Main web surfaces:

- public landing, demo request, legal, login, invitation, recovery, and reset
  routes
- the authenticated organization app for Dashboard, Schedule, People, Reports,
  Settings, Profile, Alerts, billing recovery, and onboarding
- a separate internal Gridmaster portal
- Route Handlers under `/api`, including the authenticated mobile API

Main mobile surfaces:

- role-adaptive Home, Schedule, Requests, People, and Profile tabs
- alerts, person and shift detail, dashboard drill-ins, security, MFA, sessions,
  password, calendar, notification, privacy, onboarding, offline, and recovery
  flows
- schedule authoring and publishing, reports, billing, Gridmaster operations,
  Admin permission editing, and organization settings remain web-only

## Deployment

- **Web host:** Vercel. `apps/web/vercel.json` pins the region and the daily
  trial-expiry and sandbox-cleanup jobs.
- **Build and start:** `npm run build` and `npm run start`; the root production
  build targets the Next.js web app.
- **Database:** Supabase-hosted Postgres with an immutable ordered migration
  stream. Migrations `001` through `004` are frozen. The repository is
  checksum-locked through `110`.
- **Production boundary:** migration `075` was recorded as applied to production
  on 2026-09-28. Read the live ledger with `npm run db:migrations:inspect`
  (read-only) before any release rather than relying on this line.
- **Background jobs:** a GitHub Action expires stale requests and invitations
  hourly; Vercel runs trial-expiry and sandbox-cleanup jobs daily. They require
  `CRON_SECRET`.
- **Health:** `GET /api/health`.
- **Feature controls:** Gridmasters create and manage feature flags through the
  platform UI.
- **Native boundary:** the repository contains an Expo application, but the plan
  does not claim signed builds, store distribution, or released native versions.
- **Documentation boundary:** Mintlify publishes `docs/`; public pages are
  verified against source before release. Production, provider, and
  native-release claims require separately dated evidence.

## Open questions

- Exact per-seat billing price points and tier breaks are unconfirmed.
- Deployment domain details are unconfirmed.
- Item 40e cannot complete until iOS and Android runtime evidence from
  physical devices is recorded (40e4b).
- The Privacy Policy promises a self-serve data export that no screen offers.
