# DubGrid - Project Overview

<!-- blueprint:source-hash a1a8b44891eb3e1adbc2dbfaec3a6362be4956301951816e33b74dc2c45d7781 -->

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

Items appear in build-plan order. Every item has shipped except 40, which is
in progress, 57, which is in progress (57a shipped), and 60, which is in progress (60a, 60b and 60c1 shipped).

- **1** - Multi-tenant organizations with subdomain isolation and organization-specific settings.
- **2** - Four-tier RBAC with per-person Admin permissions.
- **3** - Week, two-week, and month schedule views with draft and publish workflows.
- **4** - Realtime editor presence plus optimistic conflict detection; advisory cell locks were removed.
- **5** - People lifecycle, departments or focus areas, roles, and certifications.
- **6** - Pickup, swap, and call-off requests with approval events and snapshots.
- **7** - Shared coverage calculations and role-aware dashboard analytics.
- **8** - Staff hours, activity, and other reports with CSV and PDF export.
- **9** - Internal Gridmaster platform operations, impersonation, audit, and tenant controls.
- **10** - Stripe per-seat subscriptions with a 14-day trial beginning on first Super Admin login.
- **11** - Expo mobile access to schedule, people, requests, alerts, dashboard, and account surfaces, with deliberate web-only boundaries.
- **12** - Invite-only, pre-confirmed account creation and member onboarding.
- **13** - Web and mobile recovery, MFA/TOTP, and per-session organization isolation.
- **14** - Web and mobile notification inboxes.
- **15** - PDF, CSV, calendar, and print outputs where supported.
- **16** - Internal Test Sandbox using a cookie-selected cloned organization.
- **17** - Capability-aware People forms that hide scheduling or management fields when access changes.
- **18** - Mobile role eligibility and a canonical shared dashboard model and experience.
- **19** - Auth and onboarding correctness, journey coverage, resilience, security, and release qualification.
- **20** - An explicit, accessible control for removing an active schedule note.
- **21** - Resilient Settings display previews and content-aware configuration tables.
- **22** - Qualified, conflict-free staffing of open shifts through the normal draft workflow.
- **23** - Overflow-safe pills, chips, badges, and segmented controls across web and mobile.
- **24** - Inter for product UI, DM Sans for the wordmark and marketing headings, and tabular scheduling numerals.
- **25** - Shared web UI contracts plus route, role, state, viewport, theme, and zoom qualification.
- **26** - Removed duplicate Staff-page data loading.
- **27** - Cleared the stale publish-highlight state after publication.
- **28** - Removed duplicate published-range loading on the Schedule page.
- **29** - Removed duplicate dashboard request fetching and realtime subscriptions.
- **30** - Removed duplicate operations-report fetching.
- **31** - Made publish-difference highlighting work in Month and Mobile Day views.
- **32** - Made adjacent-day staffing overlap checks explicit and complete.
- **33** - Exercised the staffed-call-off finalization trigger with real publish behavior.
- **34** - Added final swap resolution alerts for an affected swap partner.
- **35** - Shared one reference-counted mobile shift-request realtime channel.
- **36** - Delayed the trial welcome until onboarding is complete.
- **38** - Unified mobile spacing, type, controls, dashboard, request exits, sheets, and qualification evidence.
- **39** - Made alerts navigate to their subject through one shared destination contract.
- **37** - Reconciled and applied the production migration suffix through 040 with scratch rehearsal and ledger verification.
- **41** - Invitation, credential, session, recovery, and security-notice hardening with Gridmaster grants that need fresh proof.
- **42** - Schedule notes on every schedule surface, each belonging to its shift.
- **43** - Complete person records for managers and one Gridmaster person page with two-factor lockout recovery.
- **40** (in progress) - Public and internal documentation accurate for `dev`, with permanent drift gates.
- **44** - Safe billing actions, Gridmaster billing controls and policy, and billing history.
- **45** - A worked shift plus an absence in one cell, such as D/Bereavement or D/E/Sick.
- **46** - Every shift change reads the same detailed way everywhere; organizations can hide change details and the publisher from staff.
- **47** - The Coverage panel becomes a staffing check of the draft, with exact suggestions that fix gaps or explain why none can.
- **48** - Coverage Check becomes the Schedule Builder, which fills and explains the draft for a period in one undoable change.
- **49** - Auto-build stays responsive, reads clearly, limits five days in a row, pairs days off, and follows shift preferences.
- **50** - An absence beside a shift covers the scheduled time that wasn't worked, before or after the work.
- **51** - People are Active, Away, Suspended or Offboarded, with a last day and return date; managers see who takes a seat.
- **52** - A whole-day absence on days in a row reads as one bar per week in the grid, labeled with its name and a count of days.
- **53** - Past days are finished: a past cell opens Correct this day, which fixes the published day with a reason.
- **54** - People away or absent all period sit last in their section, under a group row that folds.
- **55** - One staff page holds everything stored about a person, in tabs that follow one chosen period.
- **56** - The app feels built for each phone: native navigation, sheets and alerts, one DubGrid design, and a My schedule | Team switch.
- **57** (in progress) - Every day a shift request touches is marked on the web grid while it waits and after approval; approvals count as changes in Highlight changes.
- **58** - The shift picker shows a person's shift and job preferences and warns, without blocking, when a choice goes outside an Only preference.
- **59** - On the iPhone Duo open or partly folded, every app page is a split view: the page as a list on the left and a useful detail on the right.
- **60** (in progress) - Scheduling by hand, publishing and approving a request warn, without blocking, when someone goes past 5 days in a row, 5 days in a week or 40 hours.

Each item's parts, what each part shipped and its migration live in
`blueprint/build-plan.md` (the checklist) and `blueprint/history/` (the
archived specs). Read those when work touches an item; this overview keeps only
the current state and the rules later work must follow.

### In progress: item 40

Public and internal documentation accurate for `dev`, with permanent drift
gates. 40a to 40d, 40e1 to 40e3 and 40e4a have shipped. **40e4b, the
physical-device pass**, is planned: it needs a physical iPhone and Android
phone (Android evidence is mandatory) and is the only mobile evidence the 40e
gate accepts. Simulator and emulator evidence (40e4a) is recorded but not
counted.

## Product rules

Owner decisions that bind later work, by area. A dated rule replaces an older
one it names.

### Schedule cells and absences (items 45, 50, 52, 53, 54)

- A cell holds worked shifts, an absence, or up to two worked shifts plus one
  absence. It is always called an absence (2026-10-20).
- An absence beside a shift records scheduled time someone missed: they left
  early or arrived late. It shows the time it covers, sits in time order (first
  when they arrived late), joins a shift whose time it meets, carries no hours,
  and can't be saved when it covers no scheduled time. After a left-early
  absence the person takes no more work that day; an arrived-late one blocks
  only shifts that overlap it (2026-10-24, replacing the 2026-10-19 and
  2026-10-21 absence-last and rest-of-day rules). Design: "Absence beside a
  shift" canvas.
- A whole-day absence on days in a row, the day off absence included, draws as
  one bar per week in the Week and 2 Weeks grid with no lines inside, labeled
  "Vacation ×4" (one day shows just the name; names are never pluralized). A
  bar breaks at a different absence, a day with a shift, the end of the week,
  and a day changed in the draft. Each day stays its own cell: hovering draws
  dashed edges around it, hides the label and lights its column header, and
  its panel offers Remove this day or Remove all 4 days with one Undo
  (2026-10-26). The Away bar is drawn the same way. Design: "Absence runs in
  the grid" board.
- Days before today get a light wash, with shifts and absences at full color,
  and drag, paste, bulk delete, Auto-build and recurring fills never touch
  them. A past cell opens Correct this day: shift and absence, an optional
  typed reason, and Before and After. A correction changes the published day
  at once, sends staff no alert, logs the reason and marks the cell Corrected;
  hours and reports use it. It needs Edit shifts and Publish schedule. Admins
  correct the last 14 days, older days need a Super Admin, and a day someone
  could have worked can be corrected while they're away. Each correction is
  its own record, read by the activity log and the cell's mark; Publish
  History stays as each publish left it (2026-10-28).
- In the Week and 2 Weeks grid, anyone Away or on a whole-day absence every day
  on screen sits last in their section under a group row "Away all period · 2"
  that folds; folded, it names each person and why. The day off absence alone
  doesn't count, the group starts open, and each viewer's browser remembers
  folding it (2026-10-28).

### Shift changes (item 46)

- A shift change shows every field that tells the two sides apart (shift, job
  spelled out, 12-hour times with hours, focus area, absence) under Before and
  After headings; the arrow is only for compact spaces such as push. Staff are
  assumed to have seen nothing between publishes (2026-10-20, 2026-10-21).
  Design: "Shift change display" canvas.
- Settings > Display decides whether staff see what each changed shift was and
  who published (both on by default); the server enforces it. Anyone who edits
  or publishes always sees both. A schedule-change alert never names the
  publisher.

### Staffing and Auto-build (items 47, 48, 49, 58)

- Every staffing insight is measured on the schedule and must be exact. An
  approval publishes at once and replaces any earlier draft of the cells it
  writes, with a warning first. A person fits a gap when qualified and free
  that day (2026-10-21). Design: "Staffing check panel" canvas.
- Auto-build only fills: it applies recurring schedules, fills empty cells and
  puts back the draft's own removals. It never moves or replaces anyone already
  scheduled, never includes approvals, and has no rest rules yet (2026-10-22).
- It never schedules anyone more than five days in a row, unless the scheduler
  turns on "Allow a sixth day in a row" before generating (never a seventh,
  with a warning). It avoids going past 40 hours a week (Sunday to Saturday,
  fixed for the US, no setting) and does so only when nobody else can fill a
  gap, naming each person. Between people for a shift it ranks: days off kept
  in pairs (split only when nobody can fill the shift otherwise), shift
  preference, fewest weekends and nights, fewest hours (2026-10-23).
- Naming: Auto-build with a short plain description under the title, Generate
  schedule, Apply and Discard. The day off absence is a Schedule Rules setting
  pre-detected by name. The Tools item is Fill from Recurring Schedules
  (2026-10-22).
- Scheduling by hand, a person's shift and job preferences show only in their
  shift editor: an info banner at the top of the picker, a "Preferred" or
  "Only" tag on the shift group, and, once a pick goes outside an Only
  preference, one warning banner under the shift, never a block ("Day Shift is
  outside Aisha's preference." then "Shift preference: Only Evening Shift").
  Absences and shiftless work never warn. Anyone who can edit shifts sees
  them. Not on the grid, the open-shift picker or the Staffing check
  (2026-11-15). Design: "Shift preferences in the picker" canvas.

### Work limits (item 60)

- Scheduling by hand, publishing, and approving a pickup or swap on web or
  mobile (60c2) warn, never block, when someone would work more than 5 days in a
  row (counted across weeks and periods, the period before and after
  included), more than 5 days in a Sunday-to-Saturday week, or more than 40
  hours in that week. The counts are Auto-build's own; a worked day is a day
  with a shift. Warnings are on screen only: no alert, push or email
  (2026-11-27). "Allow a sixth day in a row" stays an Auto-build option.

### Staff status (item 51)

- Statuses are named Active, Away, Suspended and Archived (reached by
  Offboard); code keeps `inactive` and `removed`. Suspension, the return date,
  a planned status change and the first day are their own columns, so a
  Suspended person stays `active` and schedulable.
- Seats: an Away person takes one only while they can manage, a Suspended one
  always does, an Archived one never does.
- Anyone who can change a status can suspend, with the self and tier guards.
  Only a Super Admin offboards or restores a Super Admin.
- Suspension stops push and schedule emails (one notice email; in-app alerts
  still collect) and closes their open requests. Push and email go only to
  someone who can still sign in to the organization.
- Suspending or offboarding someone ends only their sessions in that
  organization (2026-11-13, replacing 51c and 51k's "everywhere").
- Schedule changes from a status go through the draft and publish with the
  period, except that taking someone off the grid (Offboarded, or Away with no
  return date) publishes the removal of their shifts from today on at once
  (2026-10-29).
- Any status change can start on a later date, Away and Suspended can end on
  one, and a new hire can start on their first day (2026-10-27). A last day
  archives automatically. First day is offered only while it's ahead, or as Set
  first day for someone Active with no shift yet (2026-10-28).
- Staff copy names only their state and its date and calls the product "the
  app", not DubGrid (2026-10-26). A "requests only" state waits for a real
  need. Design: "Staff status across surfaces" canvas and the "Fine-grained
  removal in DubGrid" doc.

### Staff page (item 55)

- One People detail page holds everything stored about a person, web only, up
  to 1200px wide, in three tabs: **Overview**, **Schedule** and **Activity**
  (2026-10-29). A month stepper beside the tabs (arrows, Today, Dates for any
  span up to a year) sets the period; it opens on the current month and no
  choice is remembered (2026-10-30). Older `?tab=` links open the tab that
  holds them.
- My profile uses the same header and three tabs: **Overview**, **Schedule**
  and **Account**; old `?section=` links open Account at their heading.

### Shift requests on the grid (item 57)

- A waiting request marks every day it touches with a corner fold, not only
  the asker's: slate while a teammate must answer, amber while a manager
  must. A claimer's day shows the shift they would get as a dashed outline.
  The hover card and panel say what would happen and who asked or accepted,
  and when.
- An approved request counts as a change in Highlight changes, like a
  publish. Its chip says what happened (Picked up, Given away, Swapped,
  Called off, New for the open shift a call-off leaves) and its color what
  happened to the day: green gained a shift, amber changed, red lost its
  shift. The hover card and panel say who approved it and when. Web only
  (2026-11-14). Design: "Request marks on the schedule" canvas.

### Mobile (item 56)

- One DubGrid design on both phones, native only where iOS, Android or the
  navigation library supply it (navigation bar, tab bar, search, system alerts,
  sheets, date picker, share, haptics). The app follows the industry standard
  for cross-platform apps rather than drawing each control per platform, and
  Android keeps DubGrid's brand colors rather than wallpaper colors
  (2026-11-09). A lint rule keeps platform checks out of screens.
- The mobile app stays signed in until the person signs out; only web sessions
  end after 35 minutes idle (2026-11-08).

### iPhone Duo (item 59)

- Open or partly folded, every app page is a split view (Apple's Mail
  model): the page as a list on the left, keeping the closed screen's cards,
  and a detail on the right. The right pane is never empty: each page has a
  useful default until a row is tapped (People: the first person in the
  list). Partly folded, each pane fills its half and nothing sits in the
  fold. Closing keeps a picked row as a page pushed with Back; a default pane
  gives way to the list. The right pane's actions join the side column with
  the status bar and tab bar, so each needs a symbol. Held tall, the list
  narrows and goes compact. iOS only (owner, 2026-11-17). Design: "DubGrid
  on iPhone Duo" canvas.
- Content clears the side column and top rows line up with its camera; iOS
  ignores the portrait lock on the Duo, so the open poses always apply.

### Platform and security

- A Gridmaster's writes to an organization's schedule, requests, publish and
  settings need an active impersonation of it (migration 075). The rule is not
  extended to staff, organization settings or discard, and impersonating never
  narrows a Gridmaster's powers (2026-11-13).
- An archived organization stays restorable by a Gridmaster for 90 days, then
  a daily job deletes it, its staff data and its own activity log, and each
  account left with no organization; DubGrid support's records of it stay.
  Delete organization offers Download your data (staff, published days,
  requests, activity log) and a Gridmaster can produce the same ZIP in the
  window. The Privacy Policy states the 90 days and the backup window
  (2026-11-13; shipped 2026-11-14, migration 142).
- Realtime reaches the apps only on private Broadcast topics (the
  organization, its schedule editors' drafts, the person, Gridmasters), one
  message per statement with no row data; nothing is published to Postgres
  Changes (2026-11-14, migrations 140 and 141).
- Public documentation covers customer behavior only. Gridmaster tooling, Test
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
- **Mobile** - Expo SDK 57, Expo Router, and React Native.
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
- Schedule data uses tabular numerals on web; the mobile app uses Inter's
  proportional figures throughout (owner, 2026-11-02).
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
  trial-expiry, sandbox-cleanup, return-from-away and
  purge-archived-organizations jobs.
- **Build and start:** `npm run build` and `npm run start`; the root production
  build targets the Next.js web app.
- **Database:** Supabase-hosted Postgres with an immutable ordered migration
  stream. Migrations `001` through `004` are frozen. The repository is
  checksum-locked through `142`.
- **Production boundary:** migration `142` was recorded as applied to production
  on 2026-11-14. Read the live ledger with `npm run db:migrations:inspect`
  (read-only) before any release rather than relying on this line.
- **Background jobs:** a GitHub Action expires stale requests and invitations
  hourly; Vercel runs the four daily jobs above. They require
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
