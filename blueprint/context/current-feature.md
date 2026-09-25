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

- [ ] **Step 1 - local browser rehearsal** (approval and an isolated stack)
- [ ] **Step 2 - native rehearsal** (device access)
- [ ] **Step 3 - email provider rehearsal** (approval to send)
- [ ] **Step 4 - production migration 047** (approval; runbook)
- [ ] **Step 5 - production Auth settings** (approval; owner's token)
- [ ] **Step 6 - release PR green** (approval to push and open)

## Notes for the AI

- Never handle token values; the owner places them in `.env.remote`.
- Production changes follow the runbook; never `--auto` merge.
- No em dashes.
