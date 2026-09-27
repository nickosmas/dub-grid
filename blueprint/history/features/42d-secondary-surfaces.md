# Feature: Secondary surfaces show schedule notes

**From build-plan:** feature 42d
**Status:** verified

## Goal

The web dashboards show a person's schedule notes on their own schedule, the
way mobile's Home card does since 42c: the admin and super admin dashboards'
"My schedule" row, and the user dashboard's hero card and week list. The other
secondary surfaces show notes only if the owner approves them below.

## Owner decisions

**Decided (owner, 2026-09-27, in chat):** the web dashboard schedule rows show
schedule notes, on both the admin and the user dashboard.

**Still to decide.** Each is built only if approved; until then it is out of
scope.

| Surface                 | What it shows today                                                                                                   | Recommendation                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| People person detail    | Aggregates only: hours history, a shift count, shift and job distribution, the recurring schedule. No per-day shifts. | **No.** There is no day on the page for a note to attach to.                                                                                                                                                                               |
| Shift-request snapshots | Each side's shift name, jobs, focus area, date and time, as recorded when the request was made.                       | **No.** A snapshot records the shift as it was asked for; today's notes on a historical record would misstate it.                                                                                                                          |
| Calendar (.ics) feed    | Published shifts; the event summary is the shift label, the description the person and label.                         | **Owner's call.** Useful (the note travels to the phone's calendar), but the feed leaves the app through a token URL into third-party calendars, so only published names would go, and a note's wording would be readable outside DubGrid. |

## In scope

- **Dashboard data.** The dashboard loads the period's schedule notes with its
  shifts (`fetchScheduleNotes`, the same `/api/schedule/manage` action and
  `canViewSchedule` gate as `fetchShifts`, with the server already dropping
  drafts for non-editors) and the organization's indicator types from
  `useOrganizationData`. A failed notes request leaves the schedule showing,
  without notes. The notes query is keyed under the organization's shifts, so
  the existing realtime `schedule_notes` invalidation refreshes it.
- **Which notes a pill shows.** A pure helper gives each pill its notes by the
  one-half rule 42c uses on mobile: a single shift shows all the day's notes;
  a double shift gives each focus area's notes to the first half working that
  area, and the day's other notes (no focus area, or one the shift does not
  work) to the first half. Each note once. Editors see draft additions and
  removals; everyone else sees published notes (`buildScheduleNoteMarks`).
  Absences and a shift removed in the last publish show none.
- **Admin and super admin "My schedule" row** (`MyScheduleRow`). Like the
  mobile Home pill (`9ac06b80`): an icon only, at the end of the pill's time
  row in the bottom-right corner, in the pill's text colour: Lucide
  `StickyNote` for one, a stacked-notes icon for several (chosen at the step's
  review to match mobile's `note-multiple-outline`). The names, with any draft
  wording, are in the icon's accessible label and tooltip. No pill ellipsizes
  its time: the pill widens as mobile's did if the longest range does not fit
  beside the icon, and every pill takes the same width so the row never shifts
  when notes arrive.
- **User dashboard** (`UserDashboard`: `MeHeroCard` and the week list built by
  `buildScheduleItemsFromShiftMap`). These have room, so each spells its notes
  out as mobile's hero and "Your Week" do: one sticky-note icon, then the
  names separated by commas, with "(added, not published)" or "(removed, not
  published)" after an editor's draft. The hero stands for the whole day and
  lists every note; week rows follow the one-half rule.
- **Customer term.** Copy says "Schedule notes", never "indicators".

## Out of scope

- The three undecided surfaces above, until approved.
- Publish-difference marks for notes (`published_added` / `published_removed`):
  the dashboard's recent-change badges read shift changes only.
- Editing notes from the dashboard.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step you haven't read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - notes reach the dashboard** - `DashboardView` fetches the
      period's notes beside its shifts (`useDashboardScheduleNotes`, over the
      shifts' own window from `dashboardScheduleWindow`);
      `DashboardPageContent` passes indicator types; `DashboardContentProps`
      gains both; a pure helper returns a day's marks per pill by the one-half
      rule. _Done when:_ helper tests cover a single shift, a double shift's
      halves (a focus area's notes on its first half, no-focus-area notes on
      the first half), a note filed under an area the shift does not work, an
      editor's drafts versus a viewer's published marks, and an absence or
      removed shift showing none; hook tests show the window's notes
      requested, a failed request giving none, and the realtime invalidation
      refetching them.
- [x] **Step 2 - the admin "My schedule" row** - `MyScheduleRow` draws the
      icon at the end of each pill's time row. _Done when:_ `MyScheduleRow`
      tests show the one-note and several-notes icons with the names in the
      accessible label, no icon without notes, and draft wording for an
      editor; a browser screenshot of the admin dashboard on the local stack
      (a QA organization with a note added and removed after) shows the icon
      in the bottom-right with the full time range and no ellipsis, in light
      and dark mode.
- [x] **Step 3 - the user dashboard** - the hero and the week list spell
      their notes out. _Done when:_ tests show the hero listing every note
      and a double shift's week rows splitting them by the one-half rule, with
      draft wording for an editor and nothing for a viewer's drafts; a browser
      screenshot of a regular user's dashboard shows the list.

## Files / areas

- `apps/web/src/components/dashboard/DashboardView.tsx`,
  `DashboardContentProps.ts`, `MyScheduleRow.tsx`, `UserDashboard.tsx`
- `apps/web/src/app/(app)/dashboard/DashboardPageContent.tsx`
- A dashboard notes helper beside them, with its test; reuse
  `buildScheduleNoteMarks` and `scheduleNoteKey` from
  `app/(app)/schedule/_lib/schedule-window.ts` (move them to a shared module
  if importing from the page's `_lib` is wrong for a component).
- Tests: `components/dashboard/__tests__/MyScheduleRow.test.tsx`, the user
  dashboard's tests, `DashboardView`'s.

## Data / contracts

- No schema, route or API change: `fetchScheduleNotes` and indicator types
  already exist. `DashboardContentProps` gains `scheduleNotes`
  (`ScheduleNote[]`, the window's rows) and `indicatorTypes`.

## Testing

- Vitest for the helper and the components' rendering, per the coding
  standards; browser screenshots for the two dashboards.
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- The notes request goes out beside the shifts request, never after it, to
  keep the dashboard's request waves flat (the sign-in latency work).
- Outside a grid a note shows no colour: the icon takes the text colour.
- The admin pill's top-right corner holds `PublishDiffPill`; the note icon is
  bottom-right, so they do not meet.
- A management-only user has no personal row; nothing changes for them.
- No em dashes; "Schedule notes" in copy.

## Verification

- Final gate on the rebased branch (onto 2676bc12): `npm run type-check`,
  `npm run lint` (0 errors; three older `<img>` warnings elsewhere) and
  `npm run test:web` (web: 579 files, 5039 tests) all passed.
- Browser, local stack, Calm Haven, QA super admin, 2026-09-27, with
  temporary notes added and removed after: the admin "Your schedule" row
  shows the sticky note (one note) and the stacked icon (two) at the end of
  the time row with the full time and no ellipsis, in light and dark mode;
  the tooltip opens on hover. In "View as User", the hero lists "Shower" on
  a sticky-note row and "Your Week" lists "Shower" and "Shower, Readings".
- The icon's tooltip uses `MaybeHint` rather than a `title` attribute (the
  `tooltip/no-html-title-attribute` lint rule).

## Owner decisions left open

People person detail, shift-request snapshots and calendar (.ics)
descriptions were not decided and were not built. Recommendation: no, no,
and the owner's call (see the table above).

## Findings

### 42d/F-08 [P2] closed - Credential mutations bypass DubGrid's five-minute assurance for a token holder (research G1)

**File:** `apps/web/src/features/account/client/auth.ts:86`; `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx:248`; `apps/web/src/features/account/server/mfa-lifecycle.ts:114`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Password and sign-in email changes are direct Supabase calls, and the factor endpoints DubGrid proxies stay reachable with the same JWT, so the assurance is a client preflight. A stolen access token can change the password (Supabase still requires aal2 when a factor exists) or, on an account with no factor, enroll an attacker's authenticator and lock the owner out, skipping DubGrid's audit. Moving the calls into DubGrid routes would not close it.
**Suggested fix:** A decision for the owner: database triggers on `auth.users` and `auth.mfa_factors` that audit, revoke or alert on credential changes, and/or a shorter `jwt_expiry`. Out of 41b2's scope by design. A third option since 41c1: turn on Supabase's own MFA factor notices (declared in `config.toml`, currently `enabled = false` because DubGrid's alert covers normal flows), which alert the owner of any enrollment or removal, including one made with a stolen token, at the cost of a duplicate email on an ordinary change.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: Supabase's own MFA factor notices are enabled in `config.toml` (sent by Supabase, so a change made with a stolen token still reaches the owner), and DubGrid's two-factor alert pushes only (`sendEmail: false`) so an ordinary change sends one email. Production takes effect when the auth templates and flags are pushed, which must happen before the release merges. A shorter `jwt_expiry` was not chosen. Revised after audit (a6e3c15c): nothing yet shows Supabase sends the MFA notices, so DubGrid's own two-factor alert keeps emailing (the push-only change is reverted) and an ordinary change may send two emails until production is confirmed. Re-review (a6e3c15c..d6b802ca): closed.

### 42d/F-16 [P2] closed - Gridmaster organization-role grants run without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:291`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** `assignOrgRoleByEmail` can grant Super Admin of any organization to any account on the Gridmaster session alone. It predates 41b3 and is organization rather than platform authority, so it sits outside 41b3's wording but close to its goal.
**Suggested fix:** Gate that action with `requireSensitiveActionAuth` and run it through step-up, and classify the route in the inventory. Needs a scope call.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: `assignOrgRoleByEmail` requires `requireSensitiveActionAuth` before the RPC, the Users tab runs it through step-up with the credential preflight, and the inventory classifies the route `conditional-sensitive`. Audit (a6e3c15c) found the Users tab's role dropdown still reached `change_user_role` on the access route unguarded; a Gridmaster role change there now requires fresh proof too, through step-up, and the inventory pins it. Re-review (d6b802ca) kept it open: `/api/organizations/role-change` also calls `change_user_role` ungated. It now requires fresh proof for every caller (no screen calls it), the inventory marker includes `change_user_role`, and a test proves a stale session changes nothing. Re-review (7ba79e75): closed as scoped, direct role grants: `assignOrgRoleByEmail`, the access route for a Gridmaster and the role-change route all require fresh proof, and mobile refuses Gridmaster tokens outright. Grants through invitations and direct database access are recorded as F-59 and F-60.

### 42d/F-17 [P3] closed - Gridmaster audit-log export runs without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/audit-log/export/route.ts:24`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The coding standards list export as a sensitive action; this export predates 41b3 and needs only the Gridmaster session.
**Suggested fix:** Gate with `requireSensitiveActionAuth` and step-up, or record why a platform audit export is exempt.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: the export requires `requireSensitiveActionAuth` before reading rows, the compliance view runs it through step-up, and the inventory classifies the route `sensitive`. Re-review (a6e3c15c..d6b802ca): closed.

### 42d/F-42 [P2] closed - Arming the app lock only on background could leave content in the iOS app switcher

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:119`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** iOS goes inactive in the app switcher and snapshots soon after; with only `background` arming the lock, the cover could arrive after the snapshot, showing schedule and people data. Not verified on a device.
**Suggested fix:** Cover the app on `inactive` without locking or prompting.
**Resolution:** `inactive` raises the privacy cover (no lock, no prompt); `active` lowers it; `background` still locks. A provider test covers it. The switcher snapshot needs the 41d3 device rehearsal. Re-review (d4a48aa5): kept open, since the cover could stay up after a sign-out while covered; the effect's cleanup now lowers it, with a test that fails without it. iOS only: Android reports no `inactive`, and its recents snapshot stays unprotected (that needs `FLAG_SECURE`). Second re-review (fe8c51ee): kept open at the repair limit (two attempts). The cleanup that lowers the cover also runs when the token rotates while the app is inactive, so a manual refresh already in flight when the switcher opens drops the cover until `background`. Suggested next fix: key the effect on `Boolean(accessToken)` instead of the token, with a test that rotates the token after `inactive`. Owner delegated the decision (2026-09-25); fixed in 41d3 with the recorded next step: the effect is keyed on `Boolean(accessToken)`, so a token rotation no longer re-runs its cleanup; a test rotates the token while inactive and fails without the change. Re-review (a6e3c15c..d6b802ca): closed.

### 42d/F-47 [P2] closed - The app's password rule accepts passwords Supabase's rule refuses

**File:** `packages/domain/src/password.ts`; `supabase/config.toml` (`password_requirements = "letters_digits"`)
**Found:** 2026-09-25 during 41d2 (drift review; recorded, not built)
**Why it matters:** `isPasswordAcceptable` wants 10 characters and two of uppercase, digit or symbol, so `Abcdefghij!` passes both apps and the register route, but Supabase requires a digit and refuses it at sign-up or reset. Production's setting is unverified.
**Suggested fix:** A policy decision: require a letter and a digit in the app rule (and its hints and copy on web and mobile), or relax Supabase's requirement to match the app. Then add a test that parses `config.toml` and holds the two together.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: the app rule requires a letter and a number (the hint reads "Letter and number") plus an uppercase letter or a symbol, so it can never accept what `letters_digits` refuses; `password-policy.test.ts` holds it against `config.toml`. Audit (a6e3c15c) found the meter still said "Fair" for refused passwords and the guidance copy omitted the number; the level is capped at Weak for any refused password and the copy names a letter and a number. Re-review (a6e3c15c..d6b802ca): closed.

### 42d/F-68 [P3] closed - Management-department grants by a Gridmaster run without fresh proof

**File:** `apps/web/src/app/api/organizations/invitations/route.ts` (PATCH `deptAdminIds`); `apps/web/src/app/api/organizations/app-only-user/route.ts`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** Department-admin assignments are a smaller grant of the same kind F-61 gated for permissions.
**Suggested fix:** Gate a Gridmaster's department-admin changes like permission changes.
**Resolution:** Fixed in 41d3 (repair): the app-only-user route and the invitation edit require fresh proof when a Gridmaster changes the department or department-admin set (compared as sets, so a save that leaves them alone asks nothing); the People management screens run those saves through step-up, and the editor revokes a pending invitation only after both prompted steps. Route tests cover a stale session, an unchanged set and an ordinary admin; the inventory classifies the app-only-user route. Re-review (e4e6f905..f2ff543e) kept it fixed: the server gates hold, but the People management save wrote the details before the departments' prompt, so a cancel left a silent partial save and a stale version. The save now runs the prompted grant first, so a cancel saves nothing; a MembersSection test proves it and fails against the previous order. Re-review (1716c586): closed; the branch cases are unchanged, a retry after an identity failure is idempotent, and ordinary admins see no change. A failed save now also refreshes the directory, since a grant may have saved first.

### 42d/F-69 [P3] closed - Test gaps in the 41d4 step-up wiring

**File:** `apps/web/src/__tests__/GridmasterUsersTab.test.tsx`; `apps/web/src/components/staff/MemberAccessControls.tsx`; `apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** Nothing covers a step-up retry that runs the action twice, `PermissionsEditor` staying open when a save is cancelled, `MemberAccessControls`' own cancel, or the wizard's invitation-step cancel.
**Suggested fix:** Add those view tests. Also: a behavior test that replace-access omits the token, `isGridmasterActor` throwing on a read error, the reinvite info toast, and the revoke-after-role-change order.
**Resolution:** Fixed in 41d3 (repair): tests for the step-up retry in the Users tab (including the invite flag reset), `PermissionsEditor` staying open on a cancelled save, `MemberAccessControls` cancels (new file), the wizard's invitation-step cancel, replace-access returning no token, `isGridmasterActor` failing closed, the reinvite info toast, and the management editor's revoke-last order. Each was confirmed to fail on a matching regression except the invite flag reset, which the action's structure already prevents. The management editor's role-change branch cannot be reached for a linked user (the picker is hidden), so that order is covered for the department step only. Re-review (e4e6f905..f2ff543e): closed; the new tests fail against the old code.

### 42d/F-71 [P2] closed - `send_invitation` returns a token to a direct authenticated caller

**File:** `supabase/migrations/043_invitation_inviter_is_verified.sql:250`; `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:469`
**Found:** 2026-09-26 by `/audit` re-review of 58ff57cd (predates 41d4)
**Why it matters:** An Admin who manages employees can call the RPC through the data API and receive the new invitation's token, then register a pre-confirmed account at an address they do not own. No tier escalation (the function's tier check holds), but the address is not proven. The same class as F-60.
**Suggested fix:** Move the setup wizard's call to the service client with `p_invited_by`, then revoke EXECUTE on `send_invitation` from `authenticated` in a forward migration and update the SQL entry-point allowlist.
**Resolution:** Fixed in 41d3 (repair): migration `050_send_invitation_server_only.sql` revokes EXECUTE on `send_invitation` from `authenticated`; the Gridmaster setup route calls it as the service role with `p_invited_by`, like invitations/create. The SQL entry-point allowlist now honours a later revoke, and the live check proves `authenticated` cannot execute it. Production needs 050 applied by the runbook. Re-review (e4e6f905..f2ff543e): closed; no application path or live test calls it as `authenticated` (the e2e fixtures use the superuser). Ordering: production's released code still calls it as the user from the setup wizard, so 050 is applied right after the release that carries the service-role call deploys, not before. Applied to production 2026-09-26 after release #115 deployed; `authenticated` can no longer execute it there.
