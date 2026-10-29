# Fix: App-wide copy review

**Type:** Fix
**Status:** verified
**Branch:** `fix/app-copy-review` (worktree `.claude/worktrees/app-copy-review`, cut from `origin/dev` at `24714e0a`)

## The problem

A read-only review of every user-facing string on web and mobile (2026-10-28)
found about 290 problems. The full list, with file, line, current and proposed
text, is `blueprint/reference/copy-review-2026-10-28.md`. In short:

- **Incomplete or vague wording.** The owner's example: billing calls
  Admins and Super Admins who are away "Away staff who can manage". People
  with management power have about 12 names, some of them wrong.
- **15 defects that show wrong things.** Raw ISO dates and raw enums on screen
  and in reports, "rest of the day" text left behind by item 50, a "Transfer
  ownership" step that doesn't exist, the internal Gridmaster role in customer
  errors, stale page names, a seat label that miscounts, and a request
  described in opposite directions on two surfaces (review section 3).
- **One concept, several names.** Call-off, change marks, a manager's no,
  resending an invitation, repeating vs recurring, the access level field,
  conflict errors, cancel spelling.
- **Repetition and the obvious.** Bodies and empty states restating titles,
  field hints repeating the dialog, toasts restating their titles (~50).
- **House-rule drift.** Hardcoded org labels (~80), Title Case (~100), raw
  "Too many requests" (38 sites), errors with no next step (~35), "Please",
  "DubGrid" in signed-in copy, em dashes and ellipses, AI-sounding lines.

## Terminology (owner adopted D1 to D11, 2026-10-28)

| #   | Use                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Management power is named by role: **Admins and Super Admins**. A permission is named by what it allows ("people who can edit staff"). "Management departments" names only the grouping. Help lines say **"Ask an Admin"**.                                                                                                                |
| D2  | The User / Admin / Super Admin field is the **access level**, everywhere. Never "role" or "app access" for it.                                                                                                                                                                                                                             |
| D3  | **Call-off** (noun), **call off** (verb). Never "Time off", "calloff" or "Calloff".                                                                                                                                                                                                                                                        |
| D4  | Draft change marks are **New / Changed / Removed**.                                                                                                                                                                                                                                                                                        |
| D5  | A manager **rejects**; a teammate **declines**. Never "deny" or "not approved".                                                                                                                                                                                                                                                            |
| D6  | Sending an invitation again is **Resend** on the button, title, confirm and toast.                                                                                                                                                                                                                                                         |
| D7  | **Repeating** is a cell series; **recurring** is Recurring Shifts. Never cross them.                                                                                                                                                                                                                                                       |
| D8  | Someone else saved first: **"Someone else just changed {thing}. Refresh and try again."**, from one shared builder.                                                                                                                                                                                                                        |
| D9  | **canceled** (US spelling) in all copy.                                                                                                                                                                                                                                                                                                    |
| D10 | Sentence case for buttons, dialog titles, headings, tabs, menu actions and toasts. Page and feature names the overview or docs use as names stay as named: Settings page names (Schedule Rules, Display, Absence Types), Publish History, Fill from Recurring Schedules, Schedule Builder, Auto-build, Recurring Shifts, 1 Week / 2 Weeks. |
| D11 | A planned away is **time away** ("Cancel planned time away").                                                                                                                                                                                                                                                                              |

Code identifiers and stored values do not change (`calloff`, `inactive`,
`removed`, `org_role`, `indicator`); only what people read.

## The fix

Work through the review in the order below, using its proposed text unless
reading the surrounding code shows it is wrong, in which case say so in the
step's review. Shared copy moves into `@dubgrid/domain` or
`@dubgrid/client-errors` so web and mobile read one string.

Must not break:

- Org terminology: every focus area, certification, role and department label
  comes from the org's labels, with the existing fallbacks.
- Tests that assert copy are updated in the same step, never deleted to pass.
- The docs accuracy gate: changed source can stale page fingerprints, and
  public pages that quote changed wording must follow (last step).
- Staff copy rules: staff are told their state and its date, the product is
  "the app", emails keep their salutation and sign-off.

## Build steps

1. [x] **Defects (review section 3).** Fix all 15: short dates in the action
       queue and its confirm title; readable request breakdown in reports; item
       50's "rest of the day" text in the panel, picker, repeat-blocked reason and
       `shift-change.ts`; the "Transfer ownership" errors (8 sites); Gridmaster
       names in `client-errors`; People as the page name in the grid, day view and
       recurring section; the mobile email-change line; "unpublished changes" on
       the dashboard; the billing action label; trial length and zero grace in the
       trial email and modal; the targeted-pickup direction (read the approval
       path, keep the right surface, fix the other); the identical ternary; the
       permission-change alert sentence; the Reports and Alerts tab titles; and the
       toasts missing an article.
       **Done when** each item in section 3 reads correctly in code and its tests,
       and type-check, lint and the touched workspaces' tests pass.
2. [x] **Managers and access level (D1, D2), plus your example.** Seat labels
       and details, delete the unrendered `helpHint` field and its nine hints, the
       Staff permission description, management-access wording on web and mobile,
       "Department admin", the access-level dialogs, sheets and toasts, and
       `permission-labels.ts`.
       **Done when** no user-facing string says "can manage", "management access"
       for a role, "app access" or "role" for the access level, and tests pass.
3. [x] **Shared names (D3 to D9, D11).** One label source per concept:
       call-off, change marks, reject/decline in alerts and the request surfaces,
       Resend, repeating vs recurring, canceled, time away. The D8 builder replaces
       every "changed elsewhere" / "latest values" / "data is out of date" copy.
       **Done when** a search for each old form in user-facing strings is empty
       and tests pass.
4. [x] **Errors that say what to do.** `API_ERRORS.RATE_LIMITED` for the 38
       "Too many requests" sites; action-specific "We couldn't ... Try again."
       fallbacks for the "failed" messages; remove "Please"; engineer words out of
       server errors that reach people (`mobile-api-core`, schedule routes,
       contracts validation, `staff-validation.ts`).
       **Done when** no route returns "Too many requests" or "X failed" verbatim,
       and tests pass.
5. [x] **Org labels, web.** Settings (`Jobs`, `Coverage`, `ShiftCategories`,
       `nav-config`, `DisplayMode`, Departments), schedule (grid, coverage panel,
       open-shift modal), dashboard ("sections"), profile, onboarding, People
       (change-request queue, detail subtitles), reports headers, fallbacks and CSV
       columns, `client-errors` and `staff-validation.ts`.
       **Done when** no hardcoded "focus area", "certification" or "role" label
       remains in web copy (except fallbacks), and tests pass.
6. [x] **Org labels, mobile.** People filters and empty state, Home (staff
       hours, open shifts, coverage and its "Wings" fallback), shift detail.
       **Done when** the same search is empty in `apps/mobile`, and tests pass.
7. [x] **Repetition and the obvious, web.** Dashboards and empty states,
       billing banners and the seats card, Danger Zone, settings nav vs section
       text, the seven archive confirmations, status field hints and domain
       outcome lines, invitation and permission dialogs, Coverage panel and
       Schedule Builder, activity log, alerts inbox, not-found and error pages,
       alert titles and bodies (`events.ts`, `shift-change-alert.ts`).
       **Done when** the web items in review section 5 marked repetition or
       obvious are done, and tests pass.
8. [x] **Repetition, vague and AI-sounding lines, mobile.** Two-factor screens,
       lock and gate screens, profile work and security, requests copy and toasts,
       people requests, sessions, notifications, onboarding, schedule lines.
       **Done when** the mobile items in review section 5 are done, and tests pass.
9. [x] **Remaining rewrites, casing and characters.** The rest of review
       section 5 (schedule panel and toolbar, settings rules, account and
       security, auth transitions, goodbye page, sandbox, Gridmaster, landing);
       sentence case per D10; em dash, en dash and ellipsis characters out of
       visible copy (time ranges use " - "); "DubGrid" out of signed-in copy;
       "Could not" titles to "Couldn't".
       **Done when** searches for `—`, `–`, `…`, `"Please `, and Title Case button
       labels in user-facing strings are empty or justified, and tests pass.
10. [x] **Docs follow.** Update public pages under `docs/` that quote changed
        wording or the old terms, re-record stale fingerprints, and pass the docs
        gate.
        **Done when** `npm run docs:check` passes.

## Verify

- Each step: `npm run type-check`, `npm run lint`, and the tests of the
  workspaces it touched, run in the worktree.
- Final: `npm run test`, `npm run build`, `npm run docs:check`.
- Browser evidence on web for the most visible changes (Settings > Billing
  seats, the dashboard action queue, a status dialog, the shift panel's
  absence line) and a simulator screenshot pass on mobile for the request
  sheets and two-factor screen.

## Out of scope

- A lint rule that blocks these patterns from coming back (review section 6).
  Worth doing next; not part of this fix.
- Renaming code identifiers, routes or stored values.
- Gridmaster-only copy beyond the items listed in the review.
