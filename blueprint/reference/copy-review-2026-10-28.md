# App-wide copy review (web + mobile), 2026-10-28

Six read-only passes: web schedule, web people + `@dubgrid/domain`, web settings/account/auth/emails,
web dashboard/requests/alerts/reports/landing, mobile, and web routes/errors/hooks/shared packages.
About 290 findings. Line numbers are as of `287cedc6`.

**Verified by hand** (not just reviewer claims): the dead `helpHint`, the seat rule behind
"Managers without a staff record", the raw ISO date in the approval queue, the raw enums in report
cells, "Time off" vs "calloff", the stale "rest of the day" strings, the identical ternary in the
expiry alert, "Staff page" in the grid, the PermissionsEditor Staff description, and that "Transfer
ownership" exists only in error messages (there is no such feature).

---

## 1. Decisions to make first

Each of these is one term used several ways. Settle it once, and dozens of findings below resolve.

| #   | Concept                            | Ways it's said today                                                                                                                                                                  | Recommendation                                                                                                                                                                            |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | People with management power       | "can manage", "management access", "managers", "management staff", "management members", "this admin", "an administrator there", "your organization admin", "teammate" (12 phrasings) | **Name the role**: "Admins and Super Admins". For a permission, name it: "people who can edit staff". Keep "management departments" for the grouping only. "Ask an Admin" for help lines. |
| D2  | The User/Admin/Super Admin field   | "Role", "Access level", "App access", "admin access"                                                                                                                                  | **Access level** everywhere. "Role" is the org's own customizable job-role label, so it collides.                                                                                         |
| D3  | Call-off request                   | "Time off" (board, mobile list, domain), "Call off", "Call-off", "calloff" (alerts), "Calloff", "calloffs"                                                                            | **Call-off** (noun), "call off" (verb). A call-off isn't planned time off.                                                                                                                |
| D4  | Draft change marks                 | new/edited/modified/changed, deleted/removed                                                                                                                                          | **New / Changed / Removed** (the staff marks you already chose).                                                                                                                          |
| D5  | A manager says no                  | "Rejected", "declined", "not approved", "deny"                                                                                                                                        | **Reject** for a manager, **decline** only for a teammate's answer.                                                                                                                       |
| D6  | Resending an invite                | "Reinvite", "Reissue", "Invitation resent" (one click path)                                                                                                                           | **Resend** (button, title, confirm, toast).                                                                                                                                               |
| D7  | Repeating vs recurring             | Mixed in the shift panel tooltip and suggestion text                                                                                                                                  | "Repeating" = a cell series; "recurring" = Recurring Shifts. Never cross them.                                                                                                            |
| D8  | Someone else saved first           | 8 wordings, 30+ copies ("changed elsewhere", "Review the latest values", "data is out of date")                                                                                       | One shape: "Someone else just changed {their status / this shift}. Refresh and try again."                                                                                                |
| D9  | Spelling                           | "cancelled" (~11) vs "canceled" (~12), even web vs mobile for the same toast                                                                                                          | **canceled** (US).                                                                                                                                                                        |
| D10 | Settings nav and Tools menu casing | "Organization Details", "Absence Types", "Bulk Delete Entries" vs sentence case elsewhere                                                                                             | Sentence case, except names you chose on purpose (e.g. "Fill from Recurring Schedules"). Your call.                                                                                       |
| D11 | Planned status as a noun           | "the planned away", "Cancel planned away"                                                                                                                                             | "time away": "Cancel planned time away".                                                                                                                                                  |

---

## 2. Your example: "can manage"

- `apps/web/src/features/billing/seats.ts:114` "Away staff who can manage" → **"Away Admins and Super Admins"**; detail `:116` → "They keep their seat while away, since they can still sign in."
- `seats.ts:131` "Away staff who can't manage" → **"Other Away staff"**; detail → "They take a seat again once they're back."
- `seats.ts:122` "Managers without a staff record" is **also wrong**: the count (`seats.ts:63-68`) is every member with no staff record, Users included. → **"Members not on staff"**, detail "People who can sign in but have no staff profile."
- `apps/web/src/components/settings/nav-config.tsx:259` help hint ("...Away staff who can manage... Archived staff are not billed.") is stale ("Archived") and incomplete (leaves out Suspended), but **`helpHint` is never rendered**: nothing reads it. Delete the field and all nine hints.
- `apps/web/src/components/PermissionsEditor.tsx:106` "Edit adds inviting people and granting management access." Clumsy and wrong: management departments are Super Admin only. → "See staff profiles, contact details and {certifications}. With Edit, they can also add and invite people, change their status and set their access level."
- `apps/web/src/features/mobile/server/management-access-actor.ts:38` "You don't have permission to manage management access." → "You don't have permission to change who's in management."
- `StaffContextBar.tsx:217`, `StaffFilterPopover.tsx:153` "Department admin" collides with the Admin access level. Consider "Department lead".

---

## 3. Defects (wrong, not just wordy)

1. **Raw ISO dates**: `apps/web/src/components/dashboard/ActionQueueCard.tsx:106,154,180` render "Day · 2026-11-03", and the confirm title at `:216` repeats it. Use the short-date formatter.
2. **Raw enums in reports**: `apps/web/src/features/reports/server/operations.ts:1365` writes "Initiated calloff (pending_approval)" into CSV/PDF cells.
3. **Stale after item 50**: "rest of the day" still reads wrong for an Arrived late absence: `ShiftEditPanel.tsx:3887,4069,4131`, `ShiftPicker.tsx:525`, `shift-change.ts:256`.
4. **Nonexistent next step**: "Transfer ownership first." in 8 errors (`api/auth/delete-account/route.ts:130`, `gdpr-erase/route.ts:111`, `organizations/access/route.ts:483`, `account-deletion.ts:81`, `DeleteAccountCard.tsx:92`, `status-change.ts`, `data-access/src/mobile.ts:2001`, `mobile-api-core/src/people-status.ts:649,1074`). → "They're the only Super Admin. Make someone else a Super Admin first."
5. **Internal role shown to customers**: `packages/client-errors/src/index.ts:62-64,138` say "super admin or gridmaster", "the DubGrid platform team". → "Only a Super Admin can make someone a Super Admin."
6. **Wrong page names**: `ScheduleGrid.tsx:5245,5249`, `MobileDayView.tsx:756` say "Staff page" / "Staff view"; `RecurringScheduleSection.tsx:1209` says "Members section". It's **People**.
7. **Wrong fact**: mobile `ProfileWorkScreen.tsx:784` "Email and phone updates apply immediately", but a new email needs confirming.
8. **Wrong total**: `DashboardView.tsx:865` "{n} unsaved schedule draft(s)". Drafts are saved; they're **unpublished changes**.
9. **Button contradicts message**: `features/billing/overview.ts:778` "Update payment method" under "Start a new subscription to reopen your organization."
10. **Hardcoded trial length**: `emails/TrialWelcomeEmail.tsx:21` "14-day", but trial length is a policy setting (44d). `TrialWelcomeModal.tsx:223` says "0 extra days" when grace is 0.
11. **Request direction disagrees**: for the same targeted pickup, the board says "Offered to cover your shift" (`packages/domain/src/shift-request-copy.ts:62`, tested), while the dashboard says "{name} requested coverage" (`UserDashboard.tsx:3129`). One of them reads backwards; the domain copy is the tested one.
12. **Identical branches**: `features/notifications/server/events.ts:1322` ternary returns the same text both ways.
13. **Ungrammatical alert**: `lib/permission-labels.ts:111` renders "gave you access to publish schedule and apply recurring schedule".
14. **Missing tab title**: `app/(app)/reports/page.tsx` has no metadata (tab shows "DubGrid"); `alerts/page.tsx:4` lacks "| DubGrid".
15. **Missing word**: "We couldn't resolve request." (`ProfileChangeRequestQueue.tsx:327`, `useShiftRequests.ts:418`) and ~9 other toasts without articles ("We couldn't claim shift.").

---

## 4. Cross-cutting patterns (fix as sweeps)

| Pattern                                                                                                   | Count          | Where                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org-customizable labels hardcoded ("focus area", "certification", "role", "sections", a "Wings" fallback) | ~80            | settings (`Jobs`, `Coverage`, `ShiftCategories` never read the label; `nav-config.tsx` receives `focusAreaLabel` and ignores it), reports headers/CSV (~22), onboarding, profile, `permission-labels.ts`, grid empty states, mobile People/Home/Shift detail, `client-errors:163`, `staff-validation.ts` |
| Body/description restates the title, or empty state says "nothing" twice                                  | ~50            | dashboard cards (14), billing banners (3 states), Danger Zone (3x), settings nav vs section text, toasts on mobile (~14), Coverage panel, not-found pages, alerts inbox                                                                                                                                  |
| Field hint repeats the dialog's message/points                                                            | 6              | `EmployeeStatusActions.tsx:100,214,253,258`, `employment-status.ts:940-970` outcome lines vs the Changes box                                                                                                                                                                                             |
| "Too many requests" verbatim, no next step                                                                | 38 route sites | add `API_ERRORS.RATE_LIMITED`: "Too many tries in a short time. Wait a minute and try again." (`lib/auth-recovery.ts:17` already has a good one)                                                                                                                                                         |
| "X failed" / "Failed to X" / "Something went wrong" with no next step                                     | ~35            | API fallbacks (19), settings toasts, alerts inbox, wizard, `lib/error-handling.ts:76`                                                                                                                                                                                                                    |
| Engineer words reaching people                                                                            | ~40            | entry/entries, cell, segment, slug, context, state, values, data, record, module, template, anchor, OT, slots, action items, "opens coverage", "approval completes", "Same-code swaps", "Target changed", "Performed by"                                                                                 |
| "Employee(s)" where the UI says staff/people                                                              | ~25            | `StaffDetailPage` toasts, `useEmployees`, alerts (`events.ts:1041,1067`), report columns, mobile routes                                                                                                                                                                                                  |
| Title Case on buttons/headings                                                                            | ~100           | every surface; e.g. "Submit Swap Request", "Copy Entry", "Reissue Invitation", "Try Again", "Go Home", "Select All", "Confirm Save", "Pending Organization Assignment"                                                                                                                                   |
| "DubGrid" in signed-in copy                                                                               | ~12            | `AppLockSurface.tsx:50` "DubGrid is locked", `ScheduleRules.tsx:218`, `DisplayMode.tsx:658`, `profile-nav-config.tsx:58`, `global-error.tsx:26`, goodbye page, `DataPrivacyPanel.tsx:43,63`                                                                                                              |
| "Please"                                                                                                  | ~20            | `SecurityPanel`, `MFAVerify`, `signInFailure`, `client-errors:28`, `mobile-api-core/auth.ts:130,138,533`, `OrganizationGateScreen`, onboarding                                                                                                                                                           |
| Em dash / en dash / ellipsis character in visible copy                                                    | ~80            | Gridmaster empty cells (61 "—"), time ranges with "–", "Loading…", "Search staff…", onboarding and sandbox prose                                                                                                                                                                                         |
| AI tells                                                                                                  | ~25            | "at a glance", "all in one place", "ensure", "successfully", "seamless/robust"-style marketing, a 20-line random goodbye headline pool, "Securing your session and getting things ready", "Hang tight", "Everything you need, nothing you don't"                                                         |

---

## 5. Findings by surface

Format: `path:line`: current → proposed. Many of these are instances of a pattern above.

### Web: schedule

- `ShiftEditPanel.tsx:2090` "Approval records the absence and opens coverage automatically." → "Once it's approved, your absence is recorded and the shift opens for others to pick up." (mobile `ShiftDetailScreen.tsx:1131` same)
- `ShiftEditPanel.tsx:2033` "...unless someone claims it and approval completes." → "Teammates can claim it. It stays yours until a claim is approved." (mobile `:1120` same)
- `ShiftEditPanel.tsx:2099` "Call off is unavailable until at least one active absence type is set up." → "Call-off isn't set up yet. Ask an Admin." (mobile `:1143` same)
- `ShiftEditPanel.tsx:4525` "Applies the organization's mentored coverage rule." → "Counts toward coverage as set in Settings > Schedule Rules."
- `ShiftEditPanel.tsx:4599` "Create a recurring pattern (daily, weekly, biweekly)" → "Repeat it daily, weekly or every 2 weeks" (D7)
- `ShiftEditPanel.tsx:4803` "Conflict Blocked" / "Overlap Warning" → "This shift overlaps another" / "Overlaps another shift"
- `ShiftEditPanel.tsx:4790`, `ShiftContextMenu.tsx:139` "Request already active" → "Request waiting"
- `ShiftEditPanel.tsx:5082` "...Published days are removed in the draft and leave the schedule when you publish." → "...Published days stay on the schedule until you publish."
- `ShiftEditPanel.tsx:4184` "Times and notes change one day at a time. To change them, edit this day only." → "...set one day at a time. To change them, choose This day only."
- `ShiftEditPanel.tsx:2560` + `:1914` "Submit Swap Request" / "Submit swap" → "Request swap" (both)
- `ShiftEditPanel.tsx:2750` "No eligible employees on this date." → "Nobody can swap with you that day."
- `ShiftEditPanel.tsx:4972-4976` "Create Repeating Shift" etc. → "Create" / "Save"
- `ShiftContextMenu.tsx:74,83,95` "Copy Entry" / "Paste Entry" / "Remove Entry" → "Copy" / "Paste" / "Clear day"
- `ScheduleGrid.tsx:2558` "Draft new" / "Marked for deletion", shown as "Status: ..." → "New, not published yet" / "Removed, not published yet"; drop "Status:"
- `ScheduleGrid.tsx:894` "Not published yet. Staff don't see it until it's published." → "Not published yet, so staff can't see it."
- `ChangeCountChips.tsx:33,40`, `PublishHistoryPanel.tsx:113,127`, `schedule-grid/badges.tsx:30`, `DraftReviewSummary.tsx:23-34` → D4
- `CoveragePanel.tsx:287-291,422` says "1 Week and 2 Weeks" three times → body "Schedule Builder doesn't work in Month view."; no subtitle while an empty state shows
- `CoveragePanel.tsx:449-450` body restates title → remove body
- `CoveragePanel.tsx:379` "The counts are the draft's." → "These counts come from the draft."
- `CoveragePanel.tsx:396` "All Focus Areas" → org label
- `coverage-check/CoverageSuggestions.tsx:141` narrates the algorithm → "Applies each draft fix in turn, so no spot is filled twice. Pickup approvals aren't included."
- `coverage-check/CoverageSuggestions.tsx:204` "Nothing to fix on this day." repeats subtitle → remove
- `schedule-core/src/coverage-suggestion-text.ts:32` "Publishes right away: staff see it without a publish..." → "Publishes right away and replaces any draft change to that day."
- `schedule-core/src/coverage-suggestion-text.ts:167` "A repeating shift would stop it recurring." → "A recurring shift for someone would cover it every week."
- `schedule-core/src/coverage-change-text.ts:165,167` "Nothing in this draft changed it." → "The draft doesn't change this count."
- `ScheduleBuildSection.tsx:465-466` "Fills open shifts... respects time off." → "Fills short shifts with qualified staff who are free." / "Starts from recurring schedules and works around absences and waiting requests."
- `ScheduleBuildSection.tsx:248` reason "Even" → "Tied with others"
- `ScheduleBuildSection.tsx:740` "Placing shifts: 12 placed" → "12 shifts placed"
- `OpenShiftStaffingModal.tsx:195` → "Nobody qualified is free that day."
- `Toolbar.tsx:285` "Authors" → "Show who edited"; `:293` "calloffs" → "Review pickup, swap and call-off requests"; `:361` "publications" → "Every publish and what it changed"; `:385` "Bulk Delete Entries" → "Bulk Delete"; `:443` "Import Previous Schedule" (tooltip says Copy) → "Copy Previous Period"
- `RepeatForm.tsx:719` "After N occurrences" → "After a number of days"; `:839` "(~6 months)... for more control" → "A series can't run past 6 months, so this one stops at {MAX} days."; `:845` + `:888` dialog repeats banner
- `ScheduleOperationModal.tsx:116` "Hang tight while we finish this scheduling update." → "Keep this page open until it finishes."
- `PrintOptionsModal.tsx:88,176` "Print / Export Options" / "Preview & Print" → "Print schedule" / "Preview"; `PrintScheduleView.tsx:989` "2W" → "2 weeks"
- `features/schedule/client/api.ts:53,605` "Schedule request failed." → "We couldn't update the schedule. Try again."
- `SchedulePageClient.tsx:1550,2609,2705,2710,2110,4296` mixes "We couldn't"/"Couldn't" and refresh/reload; "were detected"; "modified elsewhere" → see D8

### Web: people, status, permissions (`@dubgrid/domain`)

- `employment-status.ts:940,952,969` "They'll be Away: they keep sign-in, and they aren't scheduled." restates title and the box below → remove (keep only where no box shows)
- `employment-status.ts:987,989` "...sign in on the web and in the app." → "Can sign in again."
- `employment-status.ts:872` "Keeps sign-in. Not scheduled while away." → "Can sign in but isn't scheduled."
- `employment-status.ts:1197` icon label "Suspended: won't see this in the app" (only makes sense in one dialog) → `describeCurrentStatus(...)` ("Suspended until Fri, Nov 20")
- `employment-status.ts:1266-1267` "Back to Active then: ..." → "They can sign in and be scheduled from then."
- `employment-status.ts:775` "Past records stay, and you can restore them later." ("them" = records?) → "Their history stays, and you can restore them later."
- `employment-status.ts:620,700,738` + `EmployeeStatusActions.tsx:839` + `StaffDetailPage.tsx:711` → D11
- `EmployeeStatusActions.tsx:100,214,253,258` field hints repeat the message → keep only the "Leave it empty to..." half
- `useInvitationActionConfirm.tsx:25-36`, `PendingInvitationBanner.tsx:82` → D6
- `MembersSection.tsx:775`, `StaffDetailPage.tsx:897` "couldn't cancel that invitation" (everything else says Revoke) → "revoke"
- `InviteEmployeeModal.tsx:312` "Sending an invitation to {Name}. They will receive..." → "They'll get an email with a link to set a password and join your organization."
- `InviteEmployeeModal.tsx:287,309` "Invite Management Staff" / "...app access..." → "Invite to management" / "For someone in a management department who isn't on the schedule."
- `StaffDetailPanel.tsx:515` + 3 others "Edit Management Access" → "Edit management departments" (D1)
- `EmployeeManagementAccessModal.tsx:201-206` "Save Access" etc. → "Save" / "Revoke invitation" / "Send invitation"
- `EmployeeManagementAccessModal.tsx:251,280,302,313` "User access data is out of date." → D8
- `StaffDetailPage.tsx:409-522` "Employee saved" → "Saved"
- `StaffDetailPage.tsx:1271` "Management department assignment." under "Management departments" → remove
- `StaffDetailPage.tsx:1137`, `tabs/OverviewTab.tsx:177` subtitles list the fields below them → remove
- `ProfileChangeRequestQueue.tsx:44,452,460` title "this person's", "requester", "permanently" + "can't be undone" → "Approve {name}'s account deletion?" + "Their account is deleted and they're removed from your organization. This can't be undone."
- `ProfileChangeRequestQueue.tsx:47-48` "The requester's account isn't deleted." under "Reject?" → remove
- `ProfileChangeRequestQueue.tsx:52-58` hardcoded field labels → org terms
- `MemberAccessControls.tsx:121-122`, `InlineRoleSelect.tsx:86` "Change invitation access from User to Admin?" / "Change this person's role" → "Change {name}'s access level to Admin?" (D2)
- `MemberAccessControls.tsx:178` "Edit admin access" opens "Edit permissions" → "Edit permissions"
- `MemberAccessControls.tsx:193-195`, `ChangeReviewModal.tsx:33`, Gridmaster `PersonMembershipActions.tsx:201` "Review these changes before saving..." / "Confirm save" → "Save permission changes?" / "Save"
- `PermissionsEditor.tsx:56,601,610,617,624` "Core Operations", "access levels enabled", "Select All", "Module & access level" → "Scheduling and staff", "{n} of {m} turned on", "Select all", "Permission"
- `PermissionsEditor.tsx:115` "Approve or deny" → "Approve or reject" (D5); `:126` "minimums and coverage targets" → "Set how many people each shift needs."; `:136` "terminology labels" → "...and the names your organization uses for them."; `:154` "View analytics and statistics." → say what it gates
- `lib/permission-labels.ts:14-23` "Manage shift series", "Apply recurring schedule", "Manage employees" → "Manage repeating shifts", "Fill from recurring schedules", "Manage staff"
- `RecurringScheduleSection.tsx:1548-1553` "These templates affect future schedule generation." → "Auto-build and Fill from Recurring Schedules use them from now on."
- `MembersSection.tsx:2553` "Export Staff Data?" + second question → "Export the staff directory?" + "You'll get a CSV file of your staff."
- `StaffEmptyState.tsx:17,25` "No active employees" / "Get started by adding..." → "No active staff" / "Add your first staff member."
- `schedule/_lib/operations.ts:277-281` "Target already had data" / "Source cell had no usable content" → "The day already had a shift" / "Nothing to copy that day"
- `account-status.ts:16,38` "Contact an administrator there" → "Ask an Admin at your organization if you have questions."
- `features/employees/client/api.ts:120,294` "Employee request failed." / "The server saved the employee but did not return..." → "We couldn't save that. Try again." / "Saved. Refresh to see the latest details."
- `lib/employee-contact-conflicts.ts:22,61`, `staff-validation.ts:199,208,320` ("Select valid department admin departments from this organization") → plain fixes

### Web: settings, billing, account, auth, emails

- `BillingSeatsCard.tsx:177,210` say "take a seat", "right now", "counted" twice → "Everyone who takes a seat today." / "You're billed for each seat in use. Here's who takes one."
- `billing/overview.ts:287,296,362,365,371` banners repeat their titles ("keep your organization open" x2, "locked" x3) → trim to the date and consequence
- `billing/overview.ts:651` + `:194` "nothing has been deleted" said 3 ways → "Your schedules, people and settings are all kept."
- `billing/overview.ts:854` "DubGrid Support suspended... Contact DubGrid Support" → "Contact DubGrid Support to find out why and what happens next."
- `DangerZone.tsx:101,154`, `nav-config.tsx:296` same two facts three times, "Permanently" vs "restored" → nav "Close your organization for good."; card "Everyone loses access and billing stops. Only DubGrid Support can bring it back."
- `nav-config.tsx:160` repeats the two section descriptions below it → remove
- `nav-config.tsx:178` "The certification badge shown next to the employee's name on the schedule grid." → "The {certifications} your staff hold. They show beside each name and can limit who's given a job."
- `nav-config.tsx:190-193` "Shift Display Mode" (page holds more than that) → "Display" / "How shifts look on the schedule, and what staff see after a publish."
- `nav-config.tsx:200` "Configure automated scheduling rules and constraints." → "Overlaps, pay periods, mentored coverage, the day off absence, and which open shifts staff see."
- `nav-config.tsx:234` "...and the most Auto-build schedules." (doesn't parse) → "How many people each shift and job needs in each {focus area}, and the most Auto-build will schedule."
- `nav-config.tsx:278` "Review the audit trail of role, membership, billing..." (misses schedule changes) → "Every change made in your organization, who made it and when."
- `ScheduleRules.tsx:198-200` "Enforce shift conflict prevention" → "Block overlapping shifts" / "Nobody can be given two shifts that overlap."
- `ScheduleRules.tsx:218` "Set one anchor date and DubGrid will align..." → "Pick the first day of any pay period, and 2 Weeks view lines up with your pay periods. Leave it blank to follow calendar weeks."
- `ScheduleRules.tsx:287-289,307` long, semicolon, default option never explained → "Open shifts made when a published schedule is short. Staff see them only when the shift fits their schedule, always, or never. Schedulers always see them."
- `ScheduleRules.tsx:331` "Save Schedule Rule" / "Review it carefully before saving." → "Save schedule rules?" / "They apply to everyone in your organization."
- `OrganizationChangeReviewModal.tsx:21-26` three lines for one fact → "Save these changes?" / "They apply to everyone in your organization."
- Seven archive confirmations say "keeps its historical records" seven ways (`DepartmentsSettings.tsx:1222,1278`, `StringListSettings.tsx:1152`, `Jobs.tsx:2577`, `AbsenceTypes.tsx:491`, `Indicators.tsx:431`, `ShiftCategories.tsx:886`) → one line: "It stays on past schedules but can't be picked for anything new."
- `ShiftCategories.tsx:871` "compatibility labels derived from this shift become uncategorized" → remove; `:316,318,340` "Category" on a page called Shifts → "Shift saved"
- `DepartmentsSettings.tsx:1173`, `StringListSettings.tsx:1106` "Validation Error:" / "Save Error:" prefixes → remove
- `MFASetup.tsx:323` repeats `SecurityPanel.tsx:342` directly above → remove
- `SecurityPanel.tsx:368,399` "Manage sign-in state across browsers and devices." / "Inspect authenticated devices" → "Sign out of devices you're not using." / "Where you're signed in, and when."
- `NotificationPreferences.tsx:39-55` "Role changes" listed twice, "MFA", Title Case labels; `:228` + `profile-nav-config.tsx:58` same sentence twice on one page
- `DeleteAccountCard.tsx:92` see Defect 4
- `TrialWelcomeModal.tsx:192` comma-splice pitch → "Everything's included. There's one plan, so nothing is locked behind an upgrade."
- `TrialWelcomeEmail.tsx:21,28` "Thanks for choosing DubGrid!... every feature unlocked" + "There's nothing else you need to do" → "Your free trial for {org} has started." + the end date and how to subscribe
- Onboarding steps (`AdminOrientationStep.tsx:15,25,30`, `WelcomeStep.tsx:19,24,29,51,88`, `SuperAdminOrientationStep.tsx:21,31,41`, `StructureStep.tsx:151`): em dashes, "at a glance", "all in one place", "ensure", "Smart Scheduling", "Manage employees" → plain lines, org terms
- `app/(app)/onboarding/page.tsx:113-151` "Pending Organization Assignment" / "successfully created" / "Please" / "I've been invited, refresh" → "You're not in an organization yet" / "Ask your administrator to invite you, then check again." / "Check again"
- `OrganizationGateScreen.tsx:27-35` "Please try again later", "sorts out its billing", "DubGrid staff" → "This organization is locked until a Super Admin updates its billing."; "DubGrid Support suspended this organization."
- `goodbye/page.tsx:5-41` 20 random headlines and sublines ("Powered down for now", "Your data is safe", "Thank you for using DubGrid") → one fixed pair: "You're signed out" / "Sign back in whenever you're ready."
- Support is named 6 ways ("DubGrid Support", "DubGrid support", "DubGrid staff", "the DubGrid platform team", "support") → "DubGrid Support"
- `login/layout.tsx:4`, "Back to login" vs "Sign in" everywhere else → "Sign in"

### Web: dashboard, requests, alerts, activity, reports

- `ActionQueueCard.tsx:105` "Ana requested swap" → "Ana sent a swap request"
- `ActionQueueCard.tsx:127,140,202-205,463,471` "Review and publish in schedule", "urgent coverage slot(s)", "Swap Proposals"/"Coverage Gaps", "All clear" + "No action items right now" → "Publish from the schedule", "{n} urgent open shifts", "Swap requests"/"Short shifts", "Nothing to review"
- `events.ts:335` "calloff" in alert text → D3
- `events.ts:754,782,816` rejected/declined/not approved → D5
- `events.ts:764-766` "Request approved" / "Your swap request has been approved." → title "Swap request approved", body "The schedule now shows the change." / "Your schedule stays as it was."
- `events.ts:652,668,686` three title shapes for "approve this" → "{Kind} request to approve"
- `events.ts:634` "Swap response needed" → "Swap request for you"
- `events.ts:731` "was cancelled by a manager" → "A manager canceled your {kind} request."
- `events.ts:717,758,783,811` " Note: ..." → " Manager's note: "..."
- `events.ts:1114,1128` body "Your profile was updated." = title → "{actor} updated your profile."
- `events.ts:1067,1041,993` "Your employment status changed", "Employee added", "Member removed" → "Your status changed", "Staff member added", "Welcome to {org}"
- `shift-change-alert.ts:82` one-day body restates title, "to see it now" → "Open the schedule to see what changed."
- `UserDashboard.tsx:448-465` one fact three ways ("No linked staff profile", "not connected to an employee record", "link this account to a staff profile") → "Your account isn't linked to a staff record" + "Ask your manager to link your account."
- `UserDashboard.tsx:2167,2618,2636,2641,2683,2701,2707,2764,2771` five cards each say "nothing" two or three ways, "coverage gaps" shown to staff, "Available upcoming" → drop empty subtitles; "Nothing to pick up", "Open to you"
- `DashboardView.tsx:836-866` four descriptions restate their buttons → remove
- `DashboardView.tsx:855-857` "projected overtime alerts" / "Review OT alerts" → "{n} people headed for overtime" / "Review hours"
- `DashboardView.tsx:887-889` "open-gap tracking can surface here" → "Set staffing needs" / "Coverage and open shifts show here once you set how many people each shift needs."
- `DashboardView.tsx:903` + `Expanded*.tsx:114-133` "sections" / "All sections" → org focus-area label
- `DashboardView.tsx:911` "Schedule health looks good" / "No major alert items detected. Keep reviewing..." → "Nothing needs attention"
- `DashboardView.tsx:1175` body restates "Your organization is being set up" → "Your schedule shows here once setup is finished."
- `CoverageBySectionCard.tsx:53,92,95`, `OpenShiftsCard.tsx:63-108` "Not published yet" twice per card; "0 unfilled" over "All covered"; "this week" in 2-week view
- `ExpandedOpenShifts.tsx:70` → "Not published yet" / "Open shifts show here once this period is published."
- `ActivityPeriodStats.tsx:43,49` caption repeats the number above → period phrase or remove
- `ActivityEmptyPeriod.tsx:58-59` restate titles → remove
- `ActivityLogParts.tsx:64-72` "Performed by", "Target changed", "Item type" → "By", "Affected", "Item"
- `reports/shared/table.ts:155-500` hardcoded labels; "Shifts worked" vs "Shift assignments" for one metric (both are scheduled) → "Scheduled shifts" / "Scheduled days" in both
- `ShiftRequestBoard.tsx:251-255,282,284` "Approval Queue", "No organization requests", "No decided requests match" → "To approve", "No requests from your team", "No past requests match these filters"
- `ShiftRequestBoard.tsx:676` "As an admin, it goes on the schedule right away." (Super Admins see it too; dangling) → "It goes on the schedule right away."
- `ShiftRequestBoard.tsx:112` duplicates a domain helper; use the person's name
- `alerts/AlertsInboxPage.tsx:372+661,421,491,508` "Couldn't load alerts" + "Failed to load alerts" → body "Refresh and try again."
- `NotificationBell.tsx:539` "Mark all read" with 1 unread → "Mark read"
- `reports/ReportsPageContent.tsx:523` "does not have a pay period anchor" → "Set a pay period start date in Settings > Schedule Rules to use this range."
- Sandbox: `CreateSandboxDialog.tsx:55-61`, `SandboxBanner.tsx:111` em dashes, rule-of-three; `Header.tsx:318-320` "Exit & sign out" → "Sign out and discard your sandbox?" / "Sign out"
- Gridmaster: `EmployeesTab.tsx:20` "No one is archived" → "No one is offboarded"; `OrganizationSetupWizard.tsx:185,206` "& X assigned as super admin" / "Failed to create organization"

### Web: routes, errors, shared packages

- `AuthTransitionScreen.tsx:15-23` "Loading your workspace", "Securing your session and getting things ready" → "Opening your organization" / "This usually takes a few seconds."
- `UnsavedChangesDialog.tsx:13-14` "Unsaved changes" / "Your changes won't be saved." → "Discard changes?" / "You haven't saved what you changed here."
- `app/not-found.tsx:11-14` "404" / "Go Home" → "Page not found" / "Go home"; `people/not-found.tsx:6` (fires for a bad person link) → "Person not found" / "The link may be old or mistyped."
- `RouteBoundary.tsx:45-46,97` body repeats the button and title
- `global-error.tsx:26-28` "We couldn't load DubGrid..." / "Try Again" → "We couldn't load this page..." / "Try again"
- `lib/error-handling.ts:66,76-77` skips "check your connection"; "Failed to X. Please try again."; "Something went wrong: {message}"
- `client-errors/src/index.ts:19` "Network connection issue" → "You're offline"; `:28` → "That didn't work. Try again."; `:37` "look off" → "Some details aren't valid. Check them and try again."; `:59` "perform this action" → "do that"; `:131` "perform this action on your own account"; `:159,163` vague eligibility + hardcoded focus area
- `mobile-api-core/src/auth.ts:130,138,148,507,521,533` "Organization unavailable. Please try again later." for three different causes; "No active organization membership found"; "Organization context does not match this user"; "No organization matched that slug." → one message per cause, no engineer words
- `mobile-api-core/src/dashboard.ts:327-350` "metrics will appear", "tracking can surface here" → plain
- `mobile-api-core/src/people-status.ts:50,718,899,1013,1147,1231`, `useEmployees.ts` (11 copies) → D8 as one constant
- `api/schedule/manage/route.ts:1401,1586,2185`, `requests/route.ts:506`, `recurring/route.ts:383` "worked schedule cell", "worked segment", "worked assignment" → "Add a shift before changing its times." etc.
- `api/schedule/editor-sessions/route.ts:144` "isn't available in this environment yet" → "We can't close your other schedule tabs from here. Close them yourself, then try again."
- `contracts/src/staff.ts:56,87,118` "Invalid email address" / "Notes contain unsupported characters" → "Enter an email like name@example.com" / "Notes can't include tabs or line breaks."
- `lib/access-management.ts:46` review shows raw department IDs; `:73-213` Title Case labels
- `Modal.tsx:128` aria "Close modal" → "Close"

### Mobile

- `shift-requests/lib/request-type.ts:13`, `shiftDetailHelpers.ts:314` "Time off" / "Calloff" → D3
- `notification-categories.ts:24` "time-off request... or a new one needs your approval" → "Your pickup, swap or call-off request is answered, or someone else's needs your approval."
- `ShiftDetailScreen.tsx:939-942` passive body, "As an admin, it goes..." (dangling), "Submit Call-off" → "You'll be marked Sick for your Day shift on ..." / "Call off"; same dangling line in `request-action-feedback.ts:88`
- `ShiftDetailScreen.tsx:1231` "Same-code swaps are allowed when the date changes." → "The same shift on a different day works too."
- `PeopleScreen.tsx:1098` "Safeguards run before it does." (says nothing) → state the actual effect
- `PeopleScreen.tsx:1010` "does not include mobile staff visibility" → "Your access level doesn't include the staff directory. Ask an Admin if you need it."
- `PeopleScreen.tsx:772-813,1055`, `home/staff-hours.tsx:119`, `home/open-shifts.tsx:124`, `ShiftDetailScreen.tsx:1488,1964` hardcoded labels; `home/coverage.tsx:70` falls back to "Wings" where everything else says "Focus Areas"
- `OrgRoleSheet.tsx:90,93,122`, `PersonDetailScreen.tsx:686` "Change role" / "App access" / "Role updated" → D2
- `PersonDetailScreen.tsx:1367,1379,1750`, `ManagementUserActionsSheet.tsx:238` "Reinvite"/"Reissue Invitation" → D6
- `ProfileTwoFactorScreen.tsx:252,318` "Two-factor status refreshed" after turning it on/off → "Two-factor is on" / "Two-factor is off"
- `ProfileTwoFactorScreen.tsx:353` "Refresh status" three times, reason never given; `:433,438` "Disable 2FA"/"Enable 2FA" → "Turn off two-factor" / "Set up two-factor"; `:448` "This will make your account less secure." → "Signing in will need only your password."
- `AppLockSurface.tsx:50,54` "DubGrid is locked" / "Try again" → "The app is locked" / "Unlock"
- `ProfileSecurityScreen.tsx:42` "return to DubGrid" → "come back to the app"; `:240` "notified to start the deletion process" → "An admin reviews the request before your account is deleted."
- `TwoFactorReenrollGate.tsx:79` "DubGrid" twice → "...Set it up again to keep using the app."
- `OrganizationLockedScreen.tsx:46-62,95` "Try again to refresh access." over a Try again button (x5); "may still be available" → trim; "Your organization can't use the app right now."
- `ProfileWorkScreen.tsx:784` see Defect 7; `:935` repeats the banner above; `:472-474` "not just this one" / "To finish, check your email." → "We'll email the new address a link to finish the change."
- `PendingRequestsCard.tsx:21-22` "An admin will review... once approved" (circular) → "An admin reviews it before your name changes."
- `PeopleScreen.tsx:951,965` "People requests" / "Profile update" (requester sees "Name change") → "Requests from staff" / "Name change"
- `ProfileSessionsScreen.tsx:97-104` "Session revoked" / "That device is signed out." / "Could not revoke session" → "Device signed out" / "Couldn't sign out that device"
- `ProfileNotificationsScreen.tsx:200` "Receive critical updates instantly" → "Get alerts on this device when the app is closed."
- `ScheduleScreen.tsx:2585` "Your remaining shifts this week are done." (contradiction) → "You've finished your shifts for this week."
- `ScheduleScreen.tsx:3653` "Needs shift coverage" (reads as a status) → "Asked you to cover a shift"
- `RequestsScreen.tsx:874` "Coverage and pickup requests... when someone needs help" → "Pickup, swap and call-off requests show up here."
- `RequestsScreen.tsx:1118` accessibilityLabel duplicates the visible label with a stray "?" → remove
- `request-action-feedback.ts:110,125,173-193` "moves on to manager review", "finalizes the staffing change", toasts restate titles → plain; drop toast bodies
- `OnboardingScreen.tsx:40,45` "at a glance", "request time off", fragment → "See when and where you're working, and what's coming up next." / "Pick up open shifts, swap with teammates or call off, with your manager's approval."
- `AddToScheduleScreen.tsx:200,208` "on the web app", "This is what puts them on the grid." → "in Settings on the web"; "Assignments put them on the schedule. Their management access doesn't change."
- `AddPersonSheet.tsx:220` "Resend the invitation" when none was sent → "Send"
- `app/_layout.tsx:154-181` "Shift Detail", "Staff Profile", "Add to Schedule"; `useUnsavedChangesGuard.ts:76` "Keep Editing" (every discard guard) → sentence case
- ~45 error titles "Could not load ..." beside bodies that say "We couldn't" → "Couldn't load ..."
- Smaller: `DraftSummaryCard.tsx:31`, `TermsGate.tsx:121` ("Please"), `LoginScreen.tsx:583` (ellipsis), `ResetPasswordScreen.tsx:282` ("!"), `PersonDetailScreen.tsx:2242` (repeats sheet title), `auth-organization.ts:23` ("organization slug"), `notification-actions.ts:23-48`, `auth-sign-out.ts:27`, `api.ts:129`

### Landing page (`apps/web/src/app/page.tsx`)

- `:54` "Click, drag, drop... Your choice!" → "Drag shifts into a weekly grid, print it clean, and publish when you're ready."
- `:356` + `:399` "Built for / Made for the way care teams actually work." → keep one
- `:396` "Everything you need, nothing you don't" → "What's in DubGrid"
- `:77,:445` "at a glance" twice; `:438` "Catch a gap before it catches you."
- `:533-536` "Security that stays out of your way" → "Invite-only accounts, two-factor sign-in, and a record of every access change."
- `:572` "Your team deserves something that just works." → remove
- `:64-66` vs `:100-101`, `:91-93` vs `:116-117` same feature described twice

---

## 6. What else (beyond wording)

- **Make the rules enforceable.** The org-label, em-dash, "Please", "DubGrid"-in-app, and "Too many requests" problems keep coming back because nothing catches them. A custom lint rule under `eslint-rules/` for string literals in `apps/*/src` (no `—`, `–`, `…`, `Please `, `Failed to `, bare `"focus area"`) would hold the line after a sweep.
- **One place for shared errors.** `API_ERRORS.RATE_LIMITED`, one "changed elsewhere" builder, and action-specific "We couldn't..." fallbacks would replace about 90 hand-written copies.
- **Org terms through one helper.** Several components already receive the label and ignore it. A `useOrgTerms()` (web) / `currentOrg.labels` (mobile) contract plus the lint rule above closes it.
- **Docs follow.** `docs/` repeats several of these phrasings ("people who manage staff", "Time off"); the 40e drift gates will need the docs updated in the same change.
- **Delete dead copy.** `helpHint` (nine strings) is never rendered.
