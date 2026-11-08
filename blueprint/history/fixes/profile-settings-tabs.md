# Fix: My profile settings in their own tabs

**Type:** Fix
**Status:** verified
**Branch:** fix/profile-settings-tabs
**Completed:** 2026-11-07

My profile's Account tab ran eight cards in one scroll: your details, Work,
Access, the record, sign-in and security, alerts, data and privacy, and
Delete account. The owner approved a prototype on 2026-11-07 (the "My profile
redesign" canvas) that moves the settings into tabs of their own.

### Goal

- **Tabs:** Account, Schedule (on the schedule only), Alerts, Security,
  Privacy.
- **Account:** Your details, then the Work editor and Access controls where
  you can change them. What you can only read (your access role, your work
  details, your record) sits in one **Work and record** card, or **Record**
  when your work details are edited above.
- **Alerts:** the alert preferences.
- **Security:** a **Password and two-factor** card and a **Devices** card,
  with the session list and, under it, Sign out other devices and Sign out
  all devices as one pair.
- **Privacy:** Data and privacy (cookies and policies), then Delete account
  or Request account deletion last.
- Older links: `?section=security` opens Security, `notifications` opens
  Alerts, `data-privacy` opens Privacy, `profile` and `details` open Account.
  The alerts' `/profile?section=security` destination keeps working unchanged.

### Out of scope

- Mobile, and the Schedule tab's content.
- The staff page, which keeps its own Work, Access and Record cards.

### Build steps

- [x] 1. Tabs and old links (`profile-tabs.ts`, tested).
- [x] 2. Security split into two cards with paired sign-out buttons.
- [x] 3. One Work and record card on Account.
- [x] 4. Tests, e2e, public docs, browser check.

### Done when

- `/profile` shows the five tabs above for someone on the schedule, each old
  `?section=` link opens its tab, and nothing that was on Account is missing.
- Type check, lint, the web tests and the docs check pass.

### Decisions made in the build

- The security card is titled **Password and two-factor** rather than the
  prototype's "Sign-in", since sign-in alone is not used as a noun in
  customer copy.
- A Super Admin keeps the Work editor, the Access controls and Administrative
  Teams on Account, so their record card is just **Record**. Someone who can
  change neither reads Access role, their work details and the record in
  **Work and record**. A manager who isn't a Super Admin edits work above and
  reads Access role in **Record**.
- An off-schedule person who can't edit their work used to get an empty Work
  card. They now get **Record** alone.
- On phones the tab padding drops to 4px so all five tabs fit at 375px
  (`!` beats the unlayered `.dg-span-tab` rule).
- `?section=` no longer scrolls: each old section is the top of its tab.

### Evidence

- Type check, ESLint on the changed folders, the profile, account,
  staff-detail and alert-preference tests (108), `profile-tabs` tests (14),
  and `npm run docs:check` after re-recording the profile, security-sessions,
  privacy-controls and person-detail fingerprints.
- Browser, local stack, worktree dev server: the QA Super Admin saw five
  tabs, Account with Work, Access, Administrative Teams and Record, Security
  with both cards and the paired sign-out buttons under 16 sessions, Privacy
  with Delete account last, and `?section=data-privacy` opening Privacy. At
  375px the five tabs fit with no scroll. QA Regular saw Your details with
  Request a name change and one Work and record card, and Security in light
  mode.
- Not seen: a Gridmaster's profile and a manager who isn't a Super Admin;
  the e2e spec covers the old links and runs in CI.
