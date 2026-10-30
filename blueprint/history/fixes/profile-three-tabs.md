# Fix: My profile in three tabs

**Type:** Fix
**Status:** verified
**Branch:** fix/profile-three-tabs
**Completed:** 2026-10-29

My profile still used the settings sidebar (Profile, Security, Alerts,
Overview, Data & privacy) while the staff page moved to a header and three
tabs. The owner approved a prototype on 2026-10-29: the same look for your own
profile.

### Goal

- **Header:** avatar, name with the access star, roles, focus
  areas and employment, email and phone, and **Edit details** (which opens the
  Account tab's details form). Your status card under it when you have a staff
  record.
- **Overview:** the last 12 weeks in numbers, **This week** in the dashboard's
  day strip, **What you work**, and **About you** with Work, Access and the
  record line. Someone off the schedule sees About you only.
- **Schedule** (on the schedule only): Usual week, the calendar subscription,
  and shifts and time off for the last 12 weeks by week.
- **Account:** your details form, sign-in and security, alerts, and data and
  privacy, each under its own heading.
- Older `?section=` links open the tab that holds the section and scroll to it;
  `?section=security` (the security alerts' link) lands on Sign-in and security.

### Out of scope

- A period control: the profile's data covers the last 12 weeks, and loading
  other ranges needs a new route.
- Requests waiting on you: they stay on the dashboard and Requests.
- Mobile.

### Build steps

- [x] 1. Shared pieces take the profile's wording (Overview copy, Usual week
      without preferences or the Recurring Shifts link).
- [x] 2. Profile header, tabs and old section links (`tabForProfileLink`, tested).
- [x] 3. Overview, Schedule and Account content.
- [x] 4. Tests, e2e, the public page, browser check.

### Done when

- `/profile` shows the header and the tabs above, `?section=security` opens
  Account at Sign-in and security, and a Gridmaster sees the Account content.
- Type check, lint, the web tests and the docs check pass.

### Evidence

- Type check, ESLint and Prettier on the changed files, `npm run docs:check`, and the profile, staff page, account and typography tests passed in the worktree; `resolveProfileLink` and `availableProfileTabs` have their own tests.
- Browser, local stack, signed in as the QA Super Admin: Overview with the last 12 weeks, This week and About you; `?section=security` opening Account at Sign-in and security with the cards lined up with the headings; Schedule with Usual week, the calendar subscription and the list.
- Not seen locally: a manager off the schedule and a Gridmaster, both covered by the tab tests.
- Removed as unused: the old profile overview (`SelfWorkProfile`, `tabs/OverviewTab`), `PersonRecordCard` and the settings-sidebar config for `/profile`.
