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
      Android interim (2026-09-26, Pixel 7 Pro emulator, Android 13, dev
      build of d9ef2a26 against local web and Supabase, a throwaway Calm
      Haven user; host load 15 to 60, so durations are environment-bound): - Pass: presence retry. An injected 503 on session-presence was
      retried about 4.9 s later and answered 200 for the same session. - Pass: session revocation holds. Revoked from the web, the phone's
      next requests got 401, it signed out to the sign-in screen, and a
      force-stop and relaunch stayed there. - Pass: two-factor recovery. The emailed code led to the
      authenticator step, a wrong code was refused, the right one led to
      a new password (updated at aal2), and recovery signed out. - Defect found and fixed: after the authenticator step the new
      password field showed plain text on Android, because React reused
      the number-pad field and Android dropped the password flag. Each
      stage is now keyed (30bbebab, with a test); device re-check
      pending. - Inconclusive: teardown without the 5 s stall. Sign-out completes,
      but under this load the server's sign-out took 13 to 36 s, so the
      client's time cannot be isolated; to re-time on a quiet machine. - Pending: sign-in with the new password and the authenticator code
      (the emulator stopped responding before the code was entered). - Not exercisable: disabling push at teardown (the build has no
      `google-services.json`, so no push token exists). - Notes: a login that outlives the app's 15 s timeout still creates a
      server session the phone never receives (Security showed two
      devices); Realtime join errors appear under this load; F-42 stays
      with iOS.
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
- [x] **Release note: migration 050 goes after the deploy** - release PR
      #115 merged 2026-09-26 10:34 UTC (`b6f1ff56`, all 27 checks green) and
      deployed (health 200). Migration 050 then applied by the runbook with
      the owner's approval: production at 049 with only 050 missing and every
      invariant passing; the dry run proposed exactly 050; a scratch stack at
      049 took it and re-inspected complete; latest backup 2026-09-25
      13:38:30 UTC. After the apply the inspector reads 50 entries, none
      missing, health 200, the final dry run is up to date, and
      `authenticated` can no longer execute `send_invitation` (the service
      role still can). The nine reworded auth email templates were pushed the
      same day (`--apply`, 9 fields), and a fresh diff matches the repo.
- [x] **Repair F-68** - a Gridmaster's department-admin changes require fresh
      proof, with the prompt in the screens that make them.
- [x] **Repair F-69** - the missing 41d4 view and route tests.

- [x] **Release note from 41d5** - migrations 051, 052 and 053 applied to
      production 2026-09-26 with the owner's approval, by the runbook:
      candidate 53dacf24; production at 050 with exactly 051 to 053 missing
      and every invariant passing; the dry run proposed those three; a
      scratch stack started at 050 (ledger read directly: 50, then 53) took
      them and re-inspected complete; latest backup 2026-09-25 13:38:30 UTC.
      After the apply the inspector reads 53 entries, none missing, health
      200, the final dry run is up to date, `authenticated` holds no insert
      or update on memberships and no insert or delete on profiles, cannot
      execute `caller_has_fresh_proof()`, and all five grant functions carry
      the guard.

- [x] **Release note from 41d6** - migration 054 goes to production by the
      runbook, after 051 to 053 (applied), before or after the release; its
      notifications bulk route change ships with the release, and until then
      a Gridmaster's inbox mark-read or archive changes nothing once their
      sign-in is over five minutes old, so apply 054 with or after that
      release. Needs the owner's approval.

- [x] **Release note from 41d7** - migration 055 goes to production by the
      runbook only after the release carrying the impersonation route's
      fresh-proof gate deploys (production's current route does not map the
      database refusal, so a stale Gridmaster's impersonation start would
      fail with a generic error until then). Needs the owner's approval.
      Applied 2026-09-26 by the owner, after the release carrying both
      (pull request 116, merge fb2ad5c0) deployed. Before: ledger at 053
      with only 054 and 055 missing, every invariant passing, and the latest
      backup 2026-09-26 13:40:45 UTC (physical, completed). A scratch
      rehearsal from 053 applied both (ledger 53 to 55). After: 55 ledger
      entries, none missing, health 200, a final dry run up to date;
      read-only checks show restrictive policies on 36 tables,
      `gridmaster_write_allowed()` executable by `authenticated`, and the
      guard in `start_impersonation` and `force_logout_user`.

## Notes for the AI

- Never handle token values; the owner places them in `.env.remote`.
- Production changes follow the runbook; never `--auto` merge.
- No em dashes.
