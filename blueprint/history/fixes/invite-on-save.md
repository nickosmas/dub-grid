# Fix: Invite while saving an email

**Type:** Fix
**Status:** verified
**Branch:** `fix/invite-on-save`
**Design reference:** the "Invite on save" canvas
(https://claude.ai/artifact/8T1X41UAqkQgnoMnqQ32ko), approved 2026-11-09.

## The problem

On the web staff page, adding an email to someone who isn't invited only saves
it. The manager then has to find **Invite** on the invitation card beside Staff
status, which opens `InviteEmployeeModal` and asks for the access role again.
Add Staff Members already offers "Invite to the app" on each row
(`AddEmployeeModal.tsx:664`), so the two places behave differently.

Changing the email while an invitation is pending is handled, but by a separate
confirmation (`EditEmployeePanel.tsx:441`, "Save & send"). Its failure message
points to a "Send invitation" button that no longer exists; the card's button
is **Invite**.

## The fix

The Details editor on the staff page's Account tab gets an invite option under
the email field, and the save bar's button names what will happen.

**When the option shows.** All of these are true:

- the person has no account (`!employee.userId`);
- the email field holds a valid address;
- the viewer can manage staff (`perms.canManageEmployees`) and isn't in Test
  Sandbox;
- there's no pending invitation, or there is one and the email changed in this
  edit.

**What it says and whether it starts ticked.**

| Situation                         | Label                               | Starts ticked                       |
| --------------------------------- | ----------------------------------- | ----------------------------------- |
| Not invited (or invite expired)   | Invite to the app                   | only if the email changed this edit |
| Invitation pending, email changed | Send a new invitation to this email | yes                                 |

- Ticked "Invite to the app" shows **Access role** beside it: User and Admin,
  plus Super Admin for a Super Admin or Gridmaster (the options
  `InviteEmployeeModal` uses). A Super Admin picking Admin gets
  `InvitePermissionsField` below, as in Add Staff Members.
- The pending case reuses the old invitation's role and departments, as
  `handleSaveEmployeeWithReinvite` does today, so it shows no role choice.
- One line under a ticked box: "We email them a link to join when you save."
  (pending case: "We email a new link here when you save. The link sent to
  <old> stops working.").
- Unticked in the pending case: "Their invitation to <old> is canceled when
  you save, because it was for the old email."
- The save bar's button reads **Save & invite** while the box is ticked, and
  **Save changes** otherwise.

**Saving.** Save the record first, then create the invitation through the
existing step-up, as `handleSaveEmployeeWithReinvite` does. Messages:

- Sent: "Employee saved. An invitation was sent to <email>."
- Send failed or step-up cancelled: "Employee saved, but we couldn't send the
  invitation. Use Invite to try again." (step-up cancelled keeps today's
  "Employee saved. No new invitation was sent.")
- Pending case, unticked: "Employee saved. Their invitation was canceled."

The separate Save & send confirmation is removed: the checkbox makes the same
choice before saving.

**The invitation card stays the invite surface** (owner, 2026-11-09). It keeps
showing the saved state: after a send it reads "Invited <date>, hasn't joined"
with Resend and Revoke. The editor does not repeat its "Add an email to invite
them." line, and the card's **Edit details** on a person with no email should
land on the Account tab with the email field focused.

**Must not break:**

- Linked people: email stays read-only with today's footnote and Move to a new
  email; no invite option.
- `EditEmployeePanel`'s other callers (`StaffView`, `StaffDetailPanel`,
  `MembersSection`, `ProfilePanel`) are unchanged: the option is opt-in through
  a prop only the staff page passes.
- A plain save never sends an email: on an uninvited person with an unchanged
  email the box starts unticked.
- The create route answers 409 for a pending invitation at the same address;
  the option never shows in that case (no email change means no option while
  pending).

**Out of scope (follow-ups):** the mobile person editor, the People list's
side panel editor, and bulk import's invite option.

## Build steps

- [x] **1. The decision, as a pure function.** Add
      `features/employees/client/invite-on-save.ts`: given the account,
      pending-invitation and saved emails, the typed email, the viewer's rights
      and the sandbox flag, it returns whether the option shows, its kind
      (`invite` or `reinvite`), its default and the save label. Unit tests
      cover every row of the table and each hiding rule.
      **Done when:** the tests pass and fail against a version that ticks by
      default on an unchanged email.
- [x] **2. The editor.** `EditEmployeePanel` takes an opt-in `inviteOnSave`
      prop, renders the checkbox, Access role and notes from step 1, reports
      the save label for the staff page's `UnsavedChangesBar`, and passes the
      chosen invite (or none) to its save callback. The Save & send confirmation
      goes. **Done when:** on the staff page, typing an email on an uninvited
      person shows the ticked box and **Save & invite**; editing only the phone
      on an uninvited person with an email shows it unticked and **Save
      changes**; a linked person shows nothing.
- [x] **3. Saving and sending.** `StaffDetailPage` saves, then sends through
      step-up, refreshes invitations and the directory, and shows the messages
      above; the card updates to "Invited <date>, hasn't joined". Edit details
      focuses the email field. Component tests in `StaffDetailPage.test.tsx`
      cover sent, failed and the pending case unticked.
      **Done when:** each path in the browser leaves the record saved, the card
      in the matching state, and the right message.

- [x] **4. First day as a field (owner, 2026-11-09).** For someone Active
      who hasn't worked a shift, the editor shows the empty **First day**
      field beside Employment, reading "Set first day", in place of the
      floating ghost button. The staff page and roster docs say so.
      **Done when:** the field lines up with Employment and its label, and the
      `EditEmployeePanel` tests pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` from the worktree.
- In the browser, as a Super Admin and as an Admin who can manage staff, on a
  local stack:
  1. Person with no email: card says "Not invited yet / Add an email to invite
     them."; Edit details focuses the email; type one, pick User, **Save &
     invite**; the card reads "Invited <today>, hasn't joined" and the mail
     arrives.
  2. Person with an email, not invited: change only the phone; **Save
     changes** sends nothing.
  3. Pending invitation: change the email, keep the box ticked; the old link
     fails and a new one goes to the new address. Repeat unticked; the
     invitation is canceled and the card reads "Not invited yet".
  4. Linked person: email read-only, no option.
  5. Test Sandbox: no option.
- Screenshots of each state, light and dark.

## Findings

### invite-on-save/F-145 [P1] closed - About 15 fire-and-forget alert dispatches may be cut off after the response

**File:** for example `apps/web/src/app/api/employees/manage/route.ts:691, 964`, `schedule/manage/route.ts:2535, 2607`, `stripe/webhook/route.ts:142`, `features/mobile/server/routes/people.ts:254`, `organizations/access/route.ts:379` (`void dispatchNotificationEvent(...)`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** On Vercel, work left running after a response is not guaranteed to finish without `after()` or `waitUntil`, so these alerts and emails could be dropped silently. Unconfirmed: whether production's function settings let them finish.
**Suggested fix:** Wrap each in `after()`. To confirm, compare sent-alert rows against the triggering audit rows in production.
**Resolution:** Fixed on fix/alerts-finish-after-response (2026-11-02): all 18 `void dispatchNotificationEvent(...)` calls in server code run in `after()`, and the lint rule `design/no-floating-server-work` fails a `void <call>` or a floating `call().then/catch(...)` in `app/api` and `features/**/server`. Not checked: whether production actually dropped alerts before.
Re-reviewed 2026-11-09 against 9d57ac6a0 (dev), read only. Closed. Every `dispatchNotificationEvent` in `app/api`, `features/**/server` and `lib` runs inside `after()` or is awaited (19 calls checked), the four `.then`/`.catch` chains left in server code are members of a `Promise.all`, and `design/no-floating-server-work` is an error for `app/api/**` and `features/**/server/**` (`eslint.config.mjs:418-423`) with its 58 rule tests passing. The remaining `void` calls in `lib/` run in the browser (`lib/audit.ts`, `lib/db/*`) or discard a parallel read after a refusal (`api-auth.ts:276`). Still not checked: whether production dropped alerts before the repair.

### invite-on-save/F-177 [P2] closed - Schedule audit rows are fire-and-forget, like F-145's alerts

**File:** `apps/web/src/app/api/schedule/manage/route.ts:57` (`logScheduleAudit`, 13 calls); `apps/web/src/app/api/schedule/recurring/route.ts:21` (4 calls)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `void serviceClient.from("audit_log").insert(...)` after the response may be cut off on Vercel, dropping the activity log's Before and After. It also means F-145's suggested check (alerts against audit rows) can't confirm schedule actions.
**Suggested fix:** Wrap in `after()`.
**Resolution:** Fixed on fix/alerts-finish-after-response (2026-11-02): `logScheduleAudit` in `schedule/manage` and `schedule/recurring` writes inside `after()` and still only logs a failed write; the same lint rule covers it.
Re-reviewed 2026-11-09 against 9d57ac6a0 with F-145. Closed: `logScheduleAudit` writes inside `after()` in `schedule/manage/route.ts:76` and `schedule/recurring/route.ts:33`, and the lint rule covers both files.

### invite-on-save/F-190 [P0] closed - One organization's settings save can take over another organization's absence types and schedule note types

**File:** `apps/web/src/app/api/settings/config/route.ts:2775` (`upsertAbsenceType`), `:2872` (`upsertIndicatorType`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Both updates run on the service client with `.update(row).eq("id", id)` and no `org_id` filter, and `row.org_id` is the caller's organization. The ids are `BIGINT IDENTITY`, so they can be counted through. An Admin with `canManageScheduleDefinitions` or `canManageIndicatorTypes` in org A sends another organization's id: that row is rewritten and moved to org A. Reproduced at the database on a throwaway stack at migration 120 with a service-role update: org B dropped from 11 to 10 absence types and 173 of its schedule snapshots then pointed at a type owned by org A. Nothing stops it: no trigger guards `org_id`, and the foreign keys are single-column. Every other upsert in this route filters on `org_id`. The HTTP route itself was traced, not run.
**Suggested fix:** Add `.eq("org_id", effectiveOrgId)` to both updates and answer 404 on no row. Add a route test that a foreign id is refused. F-192's `org_id` immutability trigger is the backstop.
**Resolution:** Fixed on fix/tenant-write-guards (2026-11-06): both updates now filter on the effective organization and answer 404 when no row matches. Route tests send a foreign id and fail on the old code. The route was tested with a client double, not run against a live database.
Re-reviewed 2026-11-07 against f3264f7ed, on a seeded throwaway stack at 124 through real HTTP: a foreign absence type id answered 404, the foreign organization's id answered 403, the row was unchanged, and a direct move of the row was refused by `refuse_org_id_change`. Every other write path in the route was traced and is scoped. The schedule note type path was traced only, because the seed has no such row in the second organization.

### invite-on-save/F-191 [P0] closed - A manager can rename any account on the platform through a client-supplied `userId`

**File:** `apps/web/src/app/api/employees/identity/route.ts:158`; `apps/web/src/app/api/employees/manage/route.ts:917` (`syncLinkedProfileName(nextEmployee.userId)`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Both routes authorize on the caller's organization and load the employee row with an org filter, then update `profiles` with the service client using the `userId` from the request body, never comparing it to that row's `user_id`. A manager in org A sends one of their own employee ids plus any other person's user id, and that person's name changes everywhere they appear, in any organization, Gridmasters included. The precondition is the victim's UUID: not enumerable, but known for anyone who has shared or left an organization, since it stays in that organization's audit rows. Traced, not run.
**Suggested fix:** Use the stored row's `user_id` (`currentEmployee.userId`, `previousRow.userId`), and drop `userId` from the request schema for this purpose.
**Resolution:** Fixed on fix/tenant-write-guards (2026-11-06): `employees/identity` no longer accepts `userId` and renames only the stored row's account. `employees/manage` loads the stored row first and uses its account for the rename and the management-access check, so a client value is overwritten. Route tests send another account's id and fail on the old code. Client doubles, not a live run.
Re-reviewed 2026-11-07 against f3264f7ed, through real HTTP: `employees/identity` with another account's `userId` answered 200 and left that account's name unchanged. No path plants a foreign `user_id` on a staff row. `organizations/app-only-user` still takes a client `userId`, but only for an active member of the organization, so it adds nothing to this rename.

### invite-on-save/F-192 [P1] closed - The database lets one organization's rows point at another organization's rows

**File:** `supabase/migrations` (33 foreign keys between tenant tables are single-column; only `schedule_cell_snapshots_cell_org_fkey` and `schedule_cell_segments_snapshot_org_fkey` carry `org_id`); `write_schedule_cell_snapshot_internal`; `schedule_cells_emp_id_date_key`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `org_id` is present and RLS-checked on the row itself, but nothing ties the row's links to the same organization. Run as org A's Super Admin on a throwaway stack at 120, all of these were accepted: a schedule cell for org B's employee, a cell with org B's focus area, a recurring shift and a shift series for org B's employee, a coverage requirement with org B's focus area and job, a shift with org B's focus area, and a profile change request naming org B's employee. `write_schedule_cell_snapshot` also accepted org B's shift, job and absence ids on an org A cell; `schedule_cell_segments.shift_id` and `job_id` have no foreign key at all. The effect is real: with a cell planted for org B's employee, org B's own save for that person and date failed on `schedule_cells_emp_id_date_key`, because that unique index omits `org_id`. It needs the employee's UUID. A plain staff member can also insert a change request naming a coworker's employee id. Approval filters by org, so the foreign case fails safely, but the same-org case changes the coworker. No read leak was found through these links. The department id checks in `validate_department_ids` confirm existence, not organization.
**Suggested fix:** A forward migration in stages: add `UNIQUE (org_id, id)` on each parent, then composite foreign keys `(org_id, x_id)` for the 33 links, `NOT VALID` first and validated after a data check; add `org_id` to `schedule_cells`' unique index; add a shared trigger refusing a change to `org_id`; validate shift, job and absence ids in the cell write functions; bind `requester_employee_id` to the requester in the insert policy.
**Resolution:** Fixed on fix/org-bound-database (2026-11-06), migration 124: `UNIQUE (org_id, id)` on 11 parents and composite foreign keys for all 30 links, validated in the migration, so an existing cross-organization row aborts it rather than staying; a trigger refuses any change to `org_id` on the 34 tables that always have one (`profiles` and the nullable log tables are left out); another trigger refuses a segment's shift or job owned by another organization, since neither has a foreign key; `validate_department_ids` checks the organization; the change request policy binds `requester_employee_id`. `schedule_cells_emp_id_date_key` is unchanged on purpose: its `ON CONFLICT` callers need it, and with the employee link composite it can no longer collide across organizations. Rehearsed from 120 on a seeded stack, where every planted link from this finding was refused and deleting a whole organization still cascaded; `org-bound-references.integration.test.ts` keeps those checks. Not applied to production's real data, so whether production holds a cross-organization row is unknown until the migration runs; if it does, the migration stops with no change.
Re-reviewed 2026-11-07 against f3264f7ed: not closed. All 30 keys are validated and carry `org_id`, and every planted link and direct row move from this finding was refused on the stack. But this repair's trigger broke push registration (F-210), so it stays `fixed` until that is repaired. Id arrays were never bound: see F-222.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. The 30 composite keys and the triggers hold, F-210's regression is repaired, and production took 124 with no cross-organization row. Id arrays stay with F-222.

### invite-on-save/F-193 [P1] closed - Editing a pending invitation's email keeps its token, so an Admin can create a confirmed account at someone else's address

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:391` (PATCH changes `email`, not `token`); `apps/web/src/app/api/invitations/register/route.ts:129` (`email_confirm: true`), `:167`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The token is treated as proof of the inbox, but PATCH moves it to a new address. An Admin invites their own mailbox, reads the token, changes the email to `victim@otherhospital.org`, and registers with that token and a chosen password. The result is a confirmed account at the victim's address with a password the attacker knows. If another organization later invites that person, the invitation finds it as an existing account, and the attacker's live session can then follow them into that organization. If an unconfirmed account with no memberships already holds the address, its password is overwritten instead. Traced, not run.
**Suggested fix:** Rotate the token (and resend) whenever the email changes, using `replace_pending_invitation_access`, and refuse a register whose token predates the email change.
**Resolution:** Fixed on fix/invitation-email-rotates-token (2026-11-06): PATCH replaces the token and expiry with the address and mails the new link to the new address only, so the old token no longer exists and nothing further is needed at register. A failed send restores the invitation, and the new address's send limit is checked first. It was the only route that changed an invitation's address; 049 already keeps the column from browsers. Route tests use a client double. Not done: a link already moved to another address before this fix stays live until it expires, and production's audit rows weren't checked for one.
Re-reviewed 2026-11-07 against f3264f7ed, through real HTTP with a stub mail server: moving the address rotated the token, the new token went only to the new address, the old token was refused at both addresses, a failed send restored the old address and token as a pair, and `invitations.token` can't be read through the data API. The same attack has a separate path through `invitations/create`, recorded as F-211. Links moved before the fix are still unchecked in production.

### invite-on-save/F-194 [P1] closed - API requests aren't bound to the session's organization, so a person suspended in one organization keeps access to it through another

**File:** `apps/web/src/app/api/shared/permissions.ts:471` (`requireOrgPermissions`), `apps/web/src/app/api/employees/shared.ts` (`canManageEmployees`); `apps/web/src/proxy.ts:825` (the matcher excludes `/api`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The API authorizes on the client-supplied `orgId` plus a live membership, and never compares it to the token's `org_id` or the host. Suspension leaves the membership live and only sets `employees.suspended_at`, which the token hook checks for the session's active organization and these helpers never read. Someone suspended in org A who also belongs to org B signs in to B and posts `orgId: A`: service-client routes accept it, including schedule and staff management. Non-members are still refused, so this is limited to people with memberships in both. Per-session organization isolation holds on pages and RLS, not in `/api`. Mobile is safe because it uses only the token's org. Traced, not run.
**Suggested fix:** Refuse in `requireOrgPermissions` and `canManageEmployees` when `orgId` differs from the verified token's org (Gridmaster impersonation and the sandbox excepted), and read the employee's suspension there. Also refuse a failed `endUserSessions` rather than only logging it.
**Resolution:** Fixed on fix/api-bound-to-session-org (2026-11-06): `requireOrgPermissions`, `canManageEmployees` and the role-change route refuse a request for an organization other than the session's, and anyone suspended from the organization asked for, so a live token is cut off even when ending its session failed. A Gridmaster is exempt, a sandbox counts as the session's organization, and a token naming no organization falls back to the membership check, since it can reach only an organization where the person holds a live, unsuspended membership. A failed `endUserSessions` is still only logged, because the suspension check now covers what it left open. Unit tests with client doubles; E2E exercises the real routes in CI.
Re-reviewed 2026-11-07 against f3264f7ed: reopened. The route helpers hold through real HTTP: from another organization's session, and while suspended, `export`, `settings/config` and `employees/identity` were refused, including a live token minted before the suspension. But the scenario still works through the database: signed in to A and suspended in B, a real token called `publish_schedule` for B through the data API and it published, and `change_user_role` for B and it changed the role. `publish_schedule` (`092:930-963`) and `change_user_role` (`053:119-156`) check membership only, and the role-change route skips its check when `orgId` is omitted. A Test Sandbox cookie also passes the suspension check, see F-198. The repair also refused sandbox billing (F-220). **Suggested fix now:** bind both functions to the session organization and the employee's suspension, and make `orgId` required on role change.
Fixed again on fix/session-bound-functions (2026-11-07), migration 126: `publish_schedule`, `change_user_role`, `create_shift_request` and `volunteer_for_open_shift` refuse a caller outside the session organization through `refuse_caller_outside_org`, and `caller_org_id()` reads the person's suspension as the token hook does, so a token issued before a suspension stops at the database too. `orgId` is required on the role-change route. A sweep of every function `authenticated` can call found no other membership-only write; `start_trial_for_org` still reads membership alone, and `complete_onboarding` and `update_schedule_last_viewed` touch only the caller's own row. `organization_memberships` policies were not swept. With real tokens on a seeded stack, publishing and role changes for another organization answered 403 through the data API, and worked in the session's own. `session-bound-functions.integration.test.ts` keeps these checks. The cost of the extra read in `caller_org_id()`, which RLS calls often (F-141), wasn't measured.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Reopened. Publishing and role changes hold: from another organization's session both answered 403 while suspended there, an honest role change in the session's own organization answered 200, a live token lost its reads on suspension and got them back on reinstatement, and a switch of organization moved the binding with the session. But `set_job_shift_overrides` (`075:322-339`, body `002:7977`) still reads the role from memberships: suspended in an organization, from another organization's session, a real token called it for that organization's job and got 204. An aal1 token reaches it the same way. No other write was found: the 59 SECURITY DEFINER functions `authenticated` can run were read, and the rest are session-bound, Gridmaster-only or the caller's own rows. `start_trial_for_org` (`076:89`) is membership-only but can only start the clock once. **Suggested fix now:** add `refuse_caller_outside_org` to the `set_job_shift_overrides` wrapper.
Fixed again on fix/suspended-sign-in (2026-11-07), migration 127: `set_job_shift_overrides` and `start_trial_for_org` call `refuse_caller_outside_org`, so no write `authenticated` can reach reads a membership alone. `session-bound-functions.integration.test.ts` covers both from another organization's session.
Re-reviewed 2026-11-07 against d021b5fc3: not closed. The write holes are gone, but `start_trial_for_org`'s new guard caused F-227. It stays `fixed` until that repair is reviewed.
Re-reviewed 2026-11-09 against 9d57ac6a0 (dev), with an independent reader, by code and by claims set inside rolled-back transactions on a local stack at 130 (not real HTTP). Closed. `requireOrgPermissions` (`permissions.ts:515-529`) and `canManageEmployees` (`employees/shared.ts:67-106`) refuse another session's organization, a suspension there and a sandbox the cookie didn't resolve; role change requires `orgId`. All 60 SECURITY DEFINER functions `authenticated` can run were listed: every write is guarded by `refuse_caller_outside_org`, `refuse_request_outside_session_org`, `is_authorized_org` with a permission check, or touches only the caller's own rows, and the redefinitions in 128 to 130 kept their guards. From another organization's session `start_trial_for_org`, `publish_schedule` and `set_job_shift_overrides` were refused, and a suspended token's `caller_org_id()` was null. The ignored read errors (F-220) and F-225 remain separate. New: F-235.

### invite-on-save/F-195 [P1] closed - Acting on a request from another organization's session alerts the wrong organization

**File:** `packages/mobile-api-core/src/shift-requests.ts:500`, `:570` (dispatch with `auth.currentOrg.id`); `respond_to_shift_request_unguarded`, `claim_shift_request_unguarded`, `cancel_shift_request_unguarded` (check `employees.user_id = auth.uid()`, no org); `apps/web/src/features/notifications/server/events.ts:249` (`getRequestInfo` reads the request unscoped)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Someone employed in orgs A and B, on a B session, sends `PATCH /shift-requests/<A request>`. The function changes A's request, then the route dispatches under B, so B's approvers get an alert carrying A's staff names and A's approvers get nothing. It needs dual employment. Function bodies were read; the dispatch was traced, not run.
**Suggested fix:** Require `shift_request_org_id(p_request_id) = caller_org_id()` in the three functions, and dispatch with the request's own `org_id`.
**Resolution:** Fixed on fix/org-bound-database (2026-11-06), migration 121: claim, respond and cancel refuse a request outside the session's organization, so the dispatch's organization is now always the request's and the dispatch code needn't change. A Gridmaster stays held by `refuse_gridmaster_outside_org`.
Re-reviewed 2026-11-07 against f3264f7ed: not closed. Claim, respond and cancel refuse another organization's request, and the `_unguarded` bodies can't be called directly. But 121 has no sandbox exception, unlike `099:1949` and `029:50`, and 123 stops a sandbox ever being the session organization, so cancel and claim in Test Sandbox should now answer "Request not found." That is traced, not run: the clone has no open request to try. It stays `fixed` until that is repaired. The rest of the request functions are F-212 and F-213.
Fixed again on fix/session-bound-functions (2026-11-07), migration 126: `refuse_request_outside_session_org` uses `is_authorized_org`, so a sandbox owner can cancel, claim and respond in their sandbox again; cancel was run on the stack. Approving there is still refused, which predates this work: F-223.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. Wrong-organization alerts can't recur, since a request from another session is refused, and cancel works in a sandbox again. Approving in a sandbox stays refused, as F-223 records.

### invite-on-save/F-196 [P1] accepted - Managers and staff can look up accounts across every organization by email

**File:** `apps/web/src/app/api/users/check-email/route.ts` (`exists`, `displayName`); `apps/web/src/features/employees/server/contact-conflicts.ts:113`, `:211`; `apps/web/src/app/api/employees/check-email/route.ts`; `account/profile/contact-check`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `users/check-email` gives anyone with `canManageEmployees` whether an address has a DubGrid account anywhere, with that person's name, for the Add-Employee preview. `employees/check-email` returns `reason: "gridmaster"`, identifying platform staff, and a client-chosen `currentUserId` turns it into an account-exists check. `account/profile/contact-check` answers `emailTaken` for any address to any signed-in staff member. Limited per user only. A competitor or a former employee in another organization can test who works where. Read in code; `users/check-email`'s name return is documented behaviour, so this is a product decision as well as a defect.
**Suggested fix:** Return no name for a person outside the caller's organization, answer the same generic "they'll get an invite" for any address not in this organization, drop `currentUserId` from the client (use the row's own `user_id`), and never distinguish a Gridmaster.
**Update 2026-11-06:** the owner approved the wording of two emails for the strict approach. An invitation to an address with an account keeps the current invite and replaces "set your password" with "You already have a DubGrid account with this email address, so there's nothing to set up. Sign in with your password to accept." A new notice, "Someone tried to use your email address", goes to the owner of a taken address, at most once a day per address, and names no person, organization or other address. Still to do before building: test how Supabase answers a change to a taken address, and give the Gridmaster save error a generic refusal. Removing the inline taken-email error from My profile (#367) has not been separately confirmed.
**Update 2026-11-06 (fix/account-lookups-stay-in-org):** the manager side is fixed. `users/check-email` reads an account outside the organization the same as no account, with no name, and the Add-Employee banner about it is gone. `employees/check-email` and the mobile contact check no longer accept a client's `currentUserId`, so neither can test an address through a linked person. A Gridmaster's address gets the same answer as any other account's, with no `gridmaster` reason, no "reserved" wording and no employee id. An invitation to an address with a confirmed account uses the approved "nothing to set up" wording. Still open: `account/profile/contact-check` still answers `emailTaken` for any address, and removing it wouldn't close the gap. Tested on the local stack, Supabase itself answers 422 `email_exists` when any signed-in user changes their email to a taken address (`PUT /auth/v1/user`), so any staff member can ask it directly and no app route sees the attempt. That also means the approved "Someone tried to use your email address" notice can't fire for a direct call, so it isn't built. This needs the owner's decision: accept that remaining check as a provider limit, or take email changes off the client entirely, which Supabase doesn't let us enforce without a proxy in front of Auth.
**Resolution:** Accepted by the owner on 2026-11-06. The manager side is fixed and in production (#380). What remains is a yes-or-no answer, one address at a time, to someone signed in: Supabase Auth answers 422 `email_exists` when a user changes their email to a taken address, and it gives no name or organization. Supabase has no hook before a user update, and the Auth endpoint stays reachable with a publishable key and a user's own token, so a proxy alone would not close it, as the earlier update implied; closing it would mean taking every client off Supabase Auth directly. The notice email isn't built and My profile's inline check stays, since neither changes that answer.

### invite-on-save/F-197 [P1] closed - An Admin who can only edit shifts can rewrite the published schedule directly, unlogged

**File:** `supabase/migrations` policies `admin_write_schedule_cells`, `admin_write_schedule_cell_snapshots`, `admin_write_schedule_cell_segments` (FOR ALL on `canEditShifts`, any `snapshot_kind`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** Run on the throwaway stack as an Admin with `canEditShifts` and no publish permission: `publish_schedule` refused, but deleting a published snapshot's segments and updating a published snapshot directly both succeeded. A browser session can do the same through PostgREST, bypassing publish, past-day locks, corrections, the snapshot history and the audit log. This is inside one organization, not cross-tenant. By a grep of direct `.from(...)` writes in web and mobile, the only browser write to these tables is `deleteShiftSeries` clearing `series_id` (`apps/web/src/lib/db/schedule.ts:499`); the rest go through server functions.
**Suggested fix:** Move that one write into `delete_shift_series`, then revoke INSERT, UPDATE and DELETE on the three tables from `authenticated` and leave writes to the SECURITY DEFINER functions. Review the same for other tables written only by the server.
**Resolution:** Fixed on fix/org-bound-database (2026-11-06), migration 122 revokes INSERT, UPDATE, DELETE and TRUNCATE on the three tables from `authenticated`. The browser write this finding named was dead code (`lib/db/schedule.ts` `deleteShiftSeries`; the page uses the route), so it is removed rather than moved. No SECURITY INVOKER function writes these tables. The other server-only tables weren't reviewed.
Re-reviewed 2026-11-07 against f3264f7ed: on the stack, direct deletes and edits of published segments, snapshots and cells were refused with permission errors, and `authenticated` holds no write on the three tables. All 15 functions that write them are SECURITY DEFINER. The `admin_write_*` policies were left in place, which is weaker than 065 and 069 (F-221). `schedule_notes` has the same hole (F-214), and foreign key actions reach published rows another way (F-215).

### invite-on-save/F-198 [P1] closed - Any Admin can give themselves Super Admin over a copy of all staff records, and keep it after being demoted

**File:** `apps/web/src/app/api/test-sandbox/route.ts:132`; `apps/web/src/features/test-sandbox/server.ts:41` (`select("*")`, no archived filter), `:304`; `switch_org`, `get_my_organizations`; `apps/web/src/app/api/shared/permissions.ts:425`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** The route checks `org_role` only, not `admin_permissions`, and has no feature flag. An Admin with only `canEditShifts` enters the sandbox, becomes `super_admin` there, and reads every cloned person's email, phone and contact notes, offboarded people included, for example through `GET /api/export?type=staff`, which the sandbox redirect serves. `switch_org` has no `workspace_kind` filter or session binding, and nothing re-checks the source role, so a demoted Admin keeps the clone for up to 14 days. Mobile sign-in doesn't clear sandboxes as web sign-in does. Traced, not run. Stays inside one organization's data; sandbox isolation between organizations held.
**Suggested fix:** Require `canViewStaff` and `canManageEmployees` (or restrict to Super Admins), clone only what a tester needs or mask contact fields, exclude archived staff, re-check the source role on every sandbox request, and exclude sandboxes from `switch_org` and `get_my_organizations`.
**Resolution:** Fixed on fix/org-bound-database (2026-11-06): entering needs a Super Admin, or an Admin who can manage staff, who can already read these records, and the Header hides the option otherwise. `findUsableSandbox` re-checks that on each request that resolves the sandbox, so a demotion takes effect at once. The clone skips archived and offboarded staff, and remaps the two absence ids it used to copy from the source organization. Migration 123 keeps sandboxes out of `switch_org` and `get_my_organizations`. Contact fields aren't masked, because the people allowed in can already see them. The clone itself was not run with the new foreign keys outside CI.
Re-reviewed 2026-11-07 against f3264f7ed: reopened. Holding: entry by a shift-only Admin is refused, a demoted Admin's cookie is refused, a forged cookie is refused, offboarded people aren't cloned, and `switch_org` and `get_my_organizations` exclude sandboxes (all run, and the clone itself ran with the composite keys). Not holding, both run through real HTTP: an Admin with no staff record whose source membership ended signed in again with no organization in the token, and read the clone's staff contacts through `GET /api/export?type=staff&orgId=<sandbox>` with no cookie, because the sandbox membership stays and `findUsableSandbox` only runs with a cookie. And someone suspended in the source organization kept reading the clone with their cookie, because `canUseTestSandbox` reads no suspension and the check in `requireOrgPermissions` looks at the sandbox. **Suggested fix now:** refuse a sandbox `orgId` unless the cookie resolved it, read suspension and organization state in `canUseTestSandbox`, and delete owned sandboxes when access to the source ends.
Fixed again on fix/session-bound-functions (2026-11-07): `requireOrgPermissions` and `isActingInSessionOrg` refuse a sandbox unless the cookie resolved it, `canUseTestSandbox` reads the suspension and the source organization's state, and migration 126 gives `is_own_sandbox_org` the same rule, which also closes the demoted-Admin item in F-221. Both attacks were rerun through real HTTP on a seeded stack: the export with no cookie and the suspended person's cookie both answered 403, and an owner's export with the cookie answered 200. Sandboxes aren't deleted when access ends, as first suggested: they can't be reached, and the daily cleanup removes them within 14 days. Sessions moved into a sandbox before 123 are still F-221. F-219 is unchanged, so someone refused here stays locked out until they sign out.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. No cookie with a surviving membership and a suspended person with a cookie both answered 403, and the same owner with the cookie could export, publish, reset, re-enter and exit. The repair does widen F-219: anyone refused now hits the same lockout. A session whose token already names a sandbox, moved there before 123, is F-221.

### invite-on-save/F-210 [P1] closed - Migration 124 stops a phone's push token moving between organizations

**File:** `supabase/migrations/124_org_bound_references.sql:42-54` (`refuse_org_id_change` on `mobile_device_tokens`); `packages/data-access/src/mobile.ts:2332-2344`; `001:823` (`expo_push_token` is globally unique)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** This is a regression from F-192's repair, and it is in production. Registration upserts on `expo_push_token` and sends `org_id`, so moving an existing token raises "A row cannot move to another organization." On the stack the same upsert failed with that error. Someone who switches organization in the app stays registered under the old one and gets no pushes for the new one. `{ disabled: true }` from the other organization fails too, so the phone keeps the old organization's alerts. If someone from another organization signs in on the same install, the row keeps the previous person, so their alerts can reach this phone unless sign-out already disabled it. The upsert was run in SQL; the app's route wasn't. How many production phones are affected is unknown.
**Suggested fix:** Take this table out of the trigger with a forward migration, since a device token follows the person rather than the organization, and add an integration test that moves a token.
**Resolution:** Fixed on fix/push-token-moves-org (2026-11-07), migration 125 drops the trigger on `mobile_device_tokens`, so a token can move with its phone. Every other upsert and `org_id` write in the app and the migrations was checked, and no other guarded table moves a row. The integration test moves a token and pins this table as the only exception. Rows stuck on the old organization since 124 move at the phone's next registration. Not run on a device.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. Registering, moving and disabling from the other organization all worked at 125, the integration test ran in CI against 126, and direct writes are still limited to the session's organization by RLS (`003:1062-1076`). Not run on a device.

### invite-on-save/F-211 [P1] closed - Re-inviting can mail another pending invitation's token to the wrong address

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:118` (`.ilike("email", email)` unescaped), `:461` (mails the requested address, not the row's)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** This reaches the same result as F-193 by a different path. `_` is a one-character wildcard in ILIKE and is legal in an email address. Run end to end through real HTTP on the stack: with a pending invitation for `john.smith...`, an Admin who can manage staff held a pending invitation for `john_smith...` tied to a staff record, then re-invited `john_smith...` with no staff record. The lookup matched the victim's row, rotated its token and mailed it to the attacker's address. Registering with that token and the victim's address created a confirmed account with the attacker's password. It needs an existing pending invitation and a mailbox on the victim's domain that differs only at `_` positions.
**Suggested fix:** Match the address exactly (lowercased) and send to the row's own email. Check every other `.ilike` on an address, as `contact-conflicts.ts:66` already escapes.
**Resolution:** Fixed on fix/invite-exact-address (2026-11-07): the lookup escapes the address, so `_` and `%` match only themselves and case still doesn't matter, and a refreshed invitation is mailed to the row's own address. This was the only unescaped `.ilike` on an address in the web app, mobile and packages. The route test checks the pattern and the recipient; the end-to-end attack wasn't rerun.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. The end-to-end attack now fails: re-inviting `john_smith` answered 409 and the victim's token did not rotate. An honest re-invite to a mixed-case underscore address rotated and mailed the row's own address. `*`, which the escape misses, can't reach this route, since validation refuses it (F-226).

### invite-on-save/F-212 [P1] closed - An approver with no live session organization can settle requests

**File:** `resolve_shift_request` (`117:517`), `auto_approve_shift_request` (`030:1474`)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** `v_request.org_id != public.caller_org_id()` is NULL when `caller_org_id()` is NULL, so the check is skipped, and `user_can_approve_shift_requests` reads memberships only. That covers a pending two-factor challenge, an archived or suspended session organization, and a token with no organization. On the stack an aal1 token for a two-factor approver rejected a request through `resolve_shift_request`, with `caller_org_id()` NULL. A token with no organization did the same. So a stolen password alone can settle requests, and approval writes the published schedule. `auto_approve_shift_request` has the same check, traced only. This predates the repairs.
**Suggested fix:** Use `IS DISTINCT FROM` in both, and sweep the other functions for `!= public.caller_org_id()`.
**Resolution:** Fixed on fix/session-bound-functions (2026-11-07), migration 126: `resolve_shift_request_checked`, which both paths go through, refuses a request outside the session's organization by `is_authorized_org`, which is never NULL. The `!=` lines stay in `resolve_shift_request_unchecked` and `auto_approve_shift_request`, since the guard runs first and rewriting them means copying about 1,400 lines; a sweep found no other. A pending second factor, a token with no organization and another organization's session were all refused with the request untouched, and an approver in their own session still settled it. `shift_request_draft_cells` got the same guard.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed. Both `!=` lines sit behind `resolve_shift_request_checked` with no write before them, and the live test ran in CI. The same aal1 token could still reach `set_job_shift_overrides`, which is F-194.

### invite-on-save/F-213 [P2] closed - Creating a request and volunteering aren't bound to the session

**File:** `create_shift_request` (`099:1444-1450`), `volunteer_for_open_shift` (`099:2126-2133`)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** When `employee.user_id = auth.uid()`, nothing compares the organization to the session, so someone employed in A and B, on a B session or an aal1 token, or suspended in A, can file requests in A through direct RPC. The web route refuses this and mobile passes the token's organization, so only the data API reaches it. Traced, not run.
**Suggested fix:** Apply 121's guard to both, with the sandbox exception F-195 needs.
**Resolution:** Fixed on fix/session-bound-functions (2026-11-07), migration 126, with F-194: both wrappers call `refuse_caller_outside_org`. The live test covers both from another organization's session.
Re-reviewed 2026-11-07 against 8f19dc423, on a seeded stack at 126 through real HTTP and real tokens, with two independent readers. Closed.

### invite-on-save/F-224 [P1] closed - Signing in at an organization you're suspended from locks you out of every organization

**File:** `switch_org_unguarded` (`002:904`); `apps/web/src/app/api/auth/login/route.ts:176`; `105:251`
**Found:** 2026-11-07 by /audit (scope: repairs #397, #399, #401; lens: security, multi-tenancy)
**Why it matters:** `switch_org` checks membership only, so it commits and writes `profiles.org_id` to the organization the person is suspended from. The refresh is then refused, and every later sign-in, on any host, resolves to that organization and the hook refuses it. Run through the real route: signing in at a subdomain where the person was suspended answered 401 `SESSION_REFRESH_FAILED` rather than Access suspended, `profiles.org_id` moved there, and a sign-in to their other organization then answered `ACCOUNT_SUSPENDED`. 51c promised they keep every other organization. It takes one sign-in attempt and only someone with a second organization, and they stay locked out until they're reinstated or someone edits `profiles.org_id`. It predates this work.
**Suggested fix:** Refuse a suspended target in `switch_org` before it writes, and have the route answer with the Access suspended response. Then have the hook fall back to another live organization when the stored one is suspended.
**Resolution:** Fixed on fix/suspended-sign-in (2026-11-07), migration 127. It was wider than found: anyone whose default organization had suspended or offboarded them couldn't sign in anywhere, with no `switch_org` needed. The hook now starts a new session in an organization they can use when the default refuses them, on a first mint only, so a refresh doesn't pay for the lookup and a session already in that organization is still refused. `switch_org` refuses a suspended target before it writes, with the sentinel, and web sign-in, the organization switch route and mobile answer Access suspended with the end date. `profiles.org_id` stays put when nothing switches, so a reinstated person lands back there, and anyone already stuck is repaired at their next sign-in. Through the real web route: at the suspended organization's address 403 `ACCOUNT_SUSPENDED` with the date and the default unchanged, at another organization's address 200, with no organization in the address 200 in a live one, with nowhere else to go 403, and reinstated 200. All 446 live tests passed on the final migration. Mobile's Access suspended answer is covered by a unit test only, since the worktree's server ran the root checkout's package build; mobile sign-in to a live organization did run. An Offboarded person's fallback was checked at the hook, not through a route.
Re-reviewed 2026-11-07 against d021b5fc3, with an independent reader and on a stack at 127: not closed. Mobile's Access suspended answer now ran through the real route (403 `ACCOUNT_SUSPENDED` with the date, default unchanged, the other organization 200), and you confirmed the steps on production with a test account. But the repair caused F-228, so this stays `fixed` until that repair is reviewed. F-229 is what it left.
Re-reviewed 2026-11-09 against 9d57ac6a0 (dev), with an independent reader, by code and in rolled-back transactions on a local stack at 130 (routes read, not run). Closed. 128 redefines the hook but keeps 127's fallback unchanged on a first mint and still refuses a refresh in a refused organization; `switch_org` refuses a suspended target before `profiles.org_id` moves; web, mobile and the switch route answer Access suspended. Probed: suspended in the default organization, the first mint landed in another live one and stayed there on refresh; a session pinned to the suspended one was refused with its date; suspended everywhere was refused. New: F-236.

### invite-on-save/F-227 [P2] closed - A two-factor Super Admin's first mobile sign-in doesn't start the trial

**File:** `packages/mobile-api-core/src/auth.ts:655`; `supabase/migrations/127_refused_org_keeps_the_others.sql` (`start_trial_for_org`); `apps/web/src/features/mobile/server/routes/auth-sign-in-complete.ts`
**Found:** 2026-11-07 by /audit (scope: #405; lens: security, multi-tenancy)
**Why it matters:** A regression from F-194's repair. Mobile sign-in calls `start_trial_for_org` on the token before the code is answered, which 127 refuses, and the error is dropped. No later mobile step retried it, so `trial_ends_at` stayed NULL until a Super Admin signed in on web. It takes an existing two-factor account invited as a Super Admin whose first sign-in there is on a phone. Staff wait on setup in the meantime, and nothing logged it.
**Suggested fix:** Start the trial after the second factor, as web does.
**Resolution:** Fixed on fix/access-suspended-popup (2026-11-07), with no migration: `auth/sign-in-complete`, which installed apps already call after the code, starts a Super Admin's trial and logs a failure. Run with a real authenticator factor on a stack at 127: the trial stayed unset after the password and was set after the code.
Re-reviewed 2026-11-09 against 9d57ac6a0. Closed: `auth/sign-in-complete` requires a fresh second factor (`auth-sign-in-complete.ts:28`) and starts a Super Admin's trial on that token (`:34-40`), which `refuse_caller_outside_org` accepts. A failed start is only logged and nothing retries it before the next web sign-in; accepted as a log line, not a defect.

### invite-on-save/F-228 [P2] closed - A two-factor person suspended at this address sees "That code isn't right"

**File:** `apps/web/src/app/api/auth/login/route.ts`; `apps/web/src/app/(app)/login/OrgLogin.tsx:190`; `MFAVerify.tsx:112-123`
**Found:** 2026-11-07 by /audit (scope: #405; lens: security, multi-tenancy)
**Why it matters:** A regression from F-224's repair. The hook used to refuse them at the password when that organization was their default. With another organization to fall back on, the route now asked for a code, and the switch after it failed with an error the code screen showed as a wrong code, on every retry.
**Suggested fix:** Answer Access suspended before the code step.
**Resolution:** Fixed on fix/access-suspended-popup (2026-11-07): for a two-factor sign-in, the login route reads the suspension at this address before asking for a code, and answers as the hook path does, ending the new session. Run with a real factor on a stack at 127: 403 `ACCOUNT_SUSPENDED` with the date and no code step at the suspended address, 200 `mfa_required` at another organization's address and when not suspended, and the popup shown in the browser. A suspension that starts between the password and the code still reads as a wrong code, which is a window of seconds.
Re-reviewed 2026-11-09 against 9d57ac6a0. Closed: the login route checks the suspension at this address (`login/route.ts:235-261`) before it answers `mfa_required` (`:655-658`) and ends the new session; mobile refuses before its second-factor step (`mobile-api-core/src/auth.ts:191-199`, `:317-325`).
