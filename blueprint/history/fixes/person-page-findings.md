# Fix: Person page findings from the item 43 audit

**Type:** Fix
**Status:** verified
**Fixes:** F-85, F-86, F-87, F-88, F-89, F-90, F-96

## The problem

The audit of item 43 (54f5c12d..43327601) found six P2 problems on the
Gridmaster person page and its routes, and left two owner decisions (F-96)
that the owner settled on 2026-09-27.

| ID   | Problem                                                                                                                     | Where                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F-85 | History and its export return `sourceHash` (a hashed IP), `targetHash` and `sessionHash` from the person's own sign-in rows | `features/gridmaster/server/person-history.ts`                       |
| F-86 | Notifications return the raw `ipAddress` and a session-derived `dedupe_key` stored on new-device alerts                     | `features/gridmaster/server/person-notifications.ts`                 |
| F-87 | Every impersonation appears twice: the staff source still matches the started and ended rows                                | `person-history.ts`                                                  |
| F-88 | History, export and notifications do not refuse another Gridmaster's account (force logout does not either, on purpose)     | the three routes and `loadPersonHistory`                             |
| F-89 | Deactivate and terminate leave refresh tokens alive, so a lost device works again after reactivation                        | `api/gridmaster/users/route.ts`, `users/[userId]/terminate/route.ts` |
| F-90 | A two-factor reset that fails after removing some factors records nothing and emails no one                                 | `features/gridmaster/server/two-factor-reset.ts` and its route       |

Owner decisions (F-96):

1. **User agents stay, readably.** Terms and consent rows keep the browser
   detail but show it as "Safari on Mac", not the raw string. 43e's archive
   wrongly says the record never carries user agents; correct it.
2. **Access removal needs fresh proof from a Gridmaster.** Removing someone
   from an organization and deactivating or removing a staff record require
   fresh proof when a Gridmaster does them, server and client together.
   Organization admins keep their current flow with no prompt.

## The fix

- **F-85:** `loadPersonHistory` drops `sourceHash`, `targetHash` and
  `sessionHash` from every row's `details`, beside the network columns it
  already strips. The export uses the same rows, so it is covered too.
- **F-86:** `loadPersonNotifications` keeps only an allowlist of metadata keys
  that carry no network or session detail; `ipAddress`, `dedupe_key` and
  anything unknown are dropped.
- **F-87:** after the merge, drop `impersonation.started` and `.ended` rows
  whose actor is not the person, from every source, as the account source
  already does.
- **F-88:** `loadPersonHistory` returns null for a Gridmaster account, both for
  a user target and for a staff record linked to one. The notifications route loads the target through `loadPersonTarget`, so it
  answers 404 for a Gridmaster like the other person routes. Force logout stays
  as it is: the Gridmaster accounts screen uses it on purpose to sign out
  another Gridmaster.
- **F-89:** deactivate and terminate call `endUserSessions` (which ends the
  provider sessions and their refresh tokens) where they now call
  `revokeAllUserSessions`.
- **F-90:** the reset helper reports how many factors it removed even when it
  fails part way. The route then records `user.mfa_reset` with
  `partial: true` and sends the notice whenever at least one factor was
  removed, before answering 500. A retry records its own row.
- **F-96 (2):**
  - `DELETE /api/organizations/access` and `POST /api/employees/status`
    (deactivate and remove only) call `requireSensitiveActionAuth` when the
    caller is a Gridmaster, before any write.
  - Every screen that calls them runs the call through step-up with the
    credential preflight: the person page's organization and staff actions,
    and the People page screens, where an impersonating Gridmaster uses the
    same routes.
  - An organization admin is never asked: the server only asks a Gridmaster,
    and step-up prompts only when the server asks.
  - Both routes are classified in the sensitive-action inventory.
- **F-96 (1):** a small tested helper turns a user agent into "Browser on
  system" (for example "Safari on Mac", "Chrome on Windows", "DubGrid app on
  iPhone"), falling back to "Unknown browser". The account card shows that;
  the full string stays available as the hint. 43e's archive wording is
  corrected.

Must not break:

- The person record's refusal of Gridmaster targets.
- The People page flows for organization admins.
- The existing CSRF and fresh-proof order on every route.
- The re-enrollment gate after a two-factor reset.

## Build steps

- [x] **1. Strip hashes and unsafe metadata (F-85, F-86).**
  - _Done when:_ a merge test row carrying the three hashes comes back
    without them, in the history and in the export's rows.
  - A new-device notification row comes back without `ipAddress` or
    `dedupe_key`.
- [x] **2. One entry per impersonation, and no Gridmaster targets (F-87,
      F-88).**
  - _Done when:_ a merge test with a staff-source `impersonation.started`
    row shows one entry.
  - History, export and notifications each answer 404 for a Gridmaster
    account in their route tests.
- [x] **3. End provider sessions, and record partial resets (F-89, F-90).**
  - _Done when:_ route tests show deactivate and terminate call
    `endUserSessions`.
  - A reset that fails after removing one factor writes a `partial: true`
    audit row and schedules the notice before answering 500.
- [x] **4a. Fresh proof for a Gridmaster's access removal: server and
      Gridmaster screens (F-96, 2).**
  - `DELETE /api/organizations/access` and the deactivate and remove actions
    of `POST /api/employees/status` require fresh proof from a Gridmaster.
  - The client helpers take the assured token and throw errors step-up
    recognizes.
  - The person page's remove, deactivate and remove-staff actions and the
    organization Users tab's removal run through step-up with the credential
    preflight.
  - _Done when:_ route tests show a stale Gridmaster session removes nothing
    and changes no status, a fresh one succeeds, and an organization admin is
    never asked; view tests show the person page's actions going through
    step-up; the sensitive-action inventory classifies both routes.
- [x] **4b. The People page asks an impersonating Gridmaster (F-96, 2).**
  - `useEmployees` and `StaffDetailPage` deactivate and remove handlers pass a
    step-up request through (reverting their optimistic change) instead of
    toasting it, and the People page runs them through step-up.
  - An organization admin is never prompted, since the server asks only a
    Gridmaster. There is no credential preflight here, since it would ask the
    admin too.
  - A bulk action shares one prompt: refusals that arrive while it is open
    wait for it and retry with its token (`useSharedStepUp`).
  - _Done when:_ tests show a step-up refusal reaches the prompt and a retry
    with the assured token succeeds, and an admin's deactivate is unchanged.
- [x] **5. Readable user agents (F-96, 1).**
  - _Done when:_ helper tests cover Safari on Mac, Chrome on Windows, Firefox
    on Linux, Edge, the DubGrid app on iPhone and Android, and an unknown
    string.
  - The account card shows the readable form.
  - 43e's archive no longer claims the record never carries user agents.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`.
- **Gridmaster portal:**
  1. Open a person and show their history. Each impersonation appears once.
  2. Remove them from an organization. You're asked to confirm your identity
     unless you did so in the last five minutes.
  3. The terms rows read like "Safari on Mac".
- **As an organization admin on People:** deactivating a staff member asks
  nothing new.
