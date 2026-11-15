# Fix: staff read their own work details in the app

**Type:** Fix
**Status:** complete

## Problem

In the app, Profile > Profile details showed the **Work** section (employment,
certification, schedule areas, roles) only to someone who can edit their own
profile. Everyone else saw none of their own work facts anywhere, though the
Profile tab sends them to Profile details for them. Web already shows a
regular user these facts (the header's Employment and the Account tab's
**Work and record** card).

Rebuilt from the intent of `b3e314f6a` on the stale `claude/fervent-ride`
branch; its web part was superseded by item 55.

## Fix

- `ProfileWorkScreen`: someone who can't edit their profile gets a read-only
  **Work** section under Personal details: Employment always, and, when
  they're on the schedule, certification, schedule areas and roles. Labels
  come from the organization's terminology; names follow the order Settings
  lists them and the organization's short-name preference, and an empty
  value reads "None", as on a teammate's page. Like web, someone who only
  manages (no schedule areas) sees Employment alone.
- `docs/account/profile.mdx` describes it; the page's evidence fingerprint is
  recorded again.

## Evidence

- `ProfileWorkScreen.test.tsx`: three new tests (read-only in the
  organization's terms with no radios, checkboxes or notes; short names and
  None; Employment only off the schedule). 34 pass.
- Mobile type-check, lint on the changed files, and `docs:check` pass.

## Not in this fix

- Staff status ("Away until Jan 4") and the profile response's return date:
  another fix owns the Status row, `formatProfileStatus`, the contract and the
  profile route.
- Web: unchanged. It already shows these facts to a regular user.
