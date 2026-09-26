# Feature: Release qualification

**From build-plan:** feature 41d3
**Status:** blocked - needs approvals

## Goal

Item 41's repairs are proven by tests; before remediation closes, each must be
seen working where it runs: in a browser, on a phone, through the email
provider, and against production's database and Auth settings. Evidence that
cannot be gathered is recorded as a release blocker, not replaced by a test.

## Rehearsals and what each needs

| #   | Rehearsal                                              | Proves                                                                                                                                                                            | Needs                                                                                                           |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Local browser E2E (`npm run test:e2e`, three browsers) | invitation reissue and accept, sign-in refusal and completion, recovery with two-factor, impersonation start and end                                                              | A dedicated local stack or an agreed window: the E2E setup reseeds the shared local database other sessions use |
| 2   | iOS simulator and an Android device or emulator        | recovery with two-factor, session revocation holding, the app-lock cover in the app switcher (F-42), teardown without the 5 s stall, presence retry                               | A dev build on the simulator and device access                                                                  |
| 3   | Email provider                                         | invitation, reissue, account deleted, impersonation notices and security alerts arrive with the right copy; Supabase password and email-change notices after `supabase start`     | Sending real mail through Resend to an address the owner controls                                               |
| 4   | Production migration 047                               | `end_user_auth_session` exists, locked and applied by the runbook, before the release PR merges                                                                                   | Approval to apply to production                                                                                 |
| 5   | Production Auth settings                               | the push script's read-only diff: templates, subjects, OTP settings and the notice flags; plus hook, password requirements, `secure_password_change`, `jwt_expiry` and `site_url` | Approval and the owner's `.env.remote` token                                                                    |
| 6   | Release PR                                             | every GitHub check green on the `dev` to `main` PR                                                                                                                                | Approval to push `dev` and open the PR                                                                          |

## Evidence already gathered

- Unit and integration suites green at each 41 sub-item's completion (web and
  mobile), including live local-Supabase tests for recovery assurance and
  provider-session ending.
- Render tests for every app-sent sign-in email and Supabase template.
- `supabase status` parses the notification sections.

## Blockers until approved

Each row above is a blocker for closing item 41. None of them is run by
Continuous Mode: they push, send, reach production or reseed shared state.

## Build steps

- [x] **Step 0 - owner decisions** (delegated 2026-09-25) - F-08 (Supabase
      MFA notices on, DubGrid's two-factor alert still emails), F-16 and F-17
      (role grants and audit export require fresh proof), F-42 (the lock
      effect keyed on having a session) and F-47 (the password rule requires
      a letter and a number).

- [x] **Step 1 - browser rehearsal** (approved 2026-09-25) - ran as the
      release PR's Playwright shards against CI's own stack. Run
      [36191730677](https://github.com/nickosmas/dub-grid/actions/runs/36191730677)
      on 49d44ea8 (#113's head): 12 of 12 Playwright jobs passed across
      chromium, firefox and webkit, and the shards running dashboard-states and
      role-variance report no retries. If #113's head moves before merge, the
      new head's run is the one that counts.

- [ ] **Step 2 - native rehearsal** (approved 2026-09-25; blocked) - the
      simulator's dev build predates current native dependencies, only Xcode
      27 is installed (Expo 54 needs Xcode 26), no Android device or emulator
      is attached, and signing in needs the owner.
- [ ] **Step 3 - email provider rehearsal** (approved 2026-09-25) - seven
      app-sent emails (invitation, reissue, account deleted, impersonation
      start and end, new sign-in and two-factor alerts) delivered through
      Resend to `delivered@resend.dev`. Open: Supabase's own password,
      email-change and MFA notices, which need production's flags pushed.
- [x] **Step 4 - production migration 047** - applied 2026-09-25 19:17 UTC
      by another session after a scratch rehearsal; the read-only inspector
      reports 47 ledger entries, none missing, every invariant passing.
      Latest backup before it: 2026-09-25 13:38:30 UTC (physical, completed).
      Migration 048 (`user_known_devices`) followed from another session; the
      inspector reads 48 entries, none missing, every invariant passing
      (2026-09-26).
- [ ] **Step 5 - production Auth settings** (read-only diff run
      2026-09-26) - the push script finds three templates behind the repo
      (email change, reauthentication, MFA factor enrolled: the 41c3 copy);
      subjects, OTP settings and all four notice flags already match. The
      hook, `jwt_expiry` (3600), refresh rotation and MFA match. Production
      is weaker than `config.toml` on settings the script does not push:
      minimum password length 6 (repo 10), no required characters (repo
      `letters_digits`), `secure_password_change` off (repo on), and no
      session timebox or inactivity limit (repo 24h and 8h). Templates
      applied 2026-09-26 with the owner's approval (`--apply`, 3 fields); a
      fresh diff reports production matches the repo. Password rules
      (length 10, `letters_digits`) approved by the owner and applied by the
      owner 2026-09-26 (the agent's write was refused by its permission
      mode); read back as 10 and letters plus digits. `secure_password_change` stays off in production: Supabase refuses
      the change on a session over 24 hours old without a nonce, which the
      authenticator-code step-up would hit (F-62). Session limits: owner decided
      (2026-09-26) mobile stays signed in until sign-out, so production keeps
      none and `config.toml` drops its 24h and 8h; the web app's 30-minute
      idle sign-out is unchanged.

- [x] **Step 6 - release PR green** (approved 2026-09-25) - `dev` pushed and
      [#113](https://github.com/nickosmas/dub-grid/pull/113) opened, marked
      not to merge until Step 5's apply lands. Its live-database run caught
      048's new service-role table missing from the isolation inventory
      (fixed in 739fa577), and a held-bootstrap deadlock in the e2e specs was
      fixed by its owning session (49d44ea8). All 27 checks green on
      49d44ea8. Merging needs its own yes.

- [x] **Release note from 41d4** - migration
      `049_invitation_token_server_only.sql` applied to production
      2026-09-26 with the owner's approval, by the runbook: candidate
      84f5591f; production at 048 with only 049 missing and every invariant
      passing; the dry run proposed exactly 049 and no seeds; a scratch stack
      started at 048 matched production line for line, took 049 and
      re-inspected complete; app smoke on the local stack (People loads its
      invitations); latest backup 2026-09-25 13:38:30 UTC (physical, PITR
      off). After the apply the inspector reads 49 entries, none missing,
      every invariant passing and health 200; the final dry run is up to
      date; `authenticated` can no longer read the token or write the table.

- [x] **Repair F-71** - `send_invitation` is server-only (migration 050);
      the setup wizard's route calls it as the service role. _Done when:_ the
      live function-grant check and the route test pass.
- [ ] **Release note: migration 050 goes after the deploy** - production's
      released setup wizard still calls `send_invitation` as the signed-in
      user, so apply 050 by the runbook right after the release that carries
      the service-role call deploys, not before (the usual order is
      reversed; before it, a Gridmaster's setup invitation would fail soft
      with a toast).
- [x] **Repair F-68** - a Gridmaster's department-admin changes require fresh
      proof, with the prompt in the screens that make them.
- [x] **Repair F-69** - the missing 41d4 view and route tests.

## Notes for the AI

- Never handle token values; the owner places them in `.env.remote`.
- Production changes follow the runbook; never `--auto` merge.
- No em dashes.
