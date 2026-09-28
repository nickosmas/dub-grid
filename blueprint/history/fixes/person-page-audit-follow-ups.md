# Fix: Person page follow-ups from the 2026-09-28 re-review

**Type:** Fix
**Status:** verified
**Fixes:** F-102, F-103, F-104, F-105, F-110

## The problem

The re-review of the person page fixes and the follow-up audit left five small
findings in code this session wrote. The owner delegated every decision on
2026-09-28, so the choices below are recorded as made, not open.

| ID    | Problem                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-104 | Any CFNetwork client reads "DubGrid app on iPhone" and any `okhttp/` client "DubGrid app on Android", on consent evidence from a client-set header                                            |
| F-110 | "Shift requests" and "Profile change requests" show open ones plus the last 90 days, but their titles don't say so                                                                            |
| F-105 | History removes only three top-level hash keys, so a later `ipHash`, `userAgent` or nested key would reach the export; an uppercase user id would drop the person's own impersonation actions |
| F-102 | A partial two-factor reset still emails "signed you out everywhere"; a `listFactors` failure leaves the re-enroll flag set with no record; two failure paths lack tests; a stale comment      |
| F-103 | A step-up-refused status change is sent three times, so a quick bulk of five or more can hit the rate limiter and partly apply; the status route test covers only deactivate                  |

## The fix

- **F-104:**
  - Name the app only when the agent carries the app's own `DubGrid/` token (the iOS app's bundle name); otherwise say "iPhone or iPad app" for CFNetwork and "Android app" for `okhttp/`.
  - Decision: keep "Mac" and "Windows" as the owner worded them in F-96 ("Safari on Mac"), rather than the sessions list's older "Macintosh" and "Windows PC".
- **F-110:** title both groups "…, open and last 90 days".
- **F-105:**
  - Strip, at any depth of `details`, every key naming a hash, an IP address or a user agent (`*hash`, `ip`, `ip_*`, `ipAddress`, `userAgent`, `user_agent`), not only the three known ones.
  - `loadPersonHistory` lowercases a user target's id before it compares or queries.
  - The cap is already covered: the card warns that the history is partial whenever any source, the impersonation sessions included, returned its full read.
- **F-102:**
  - The notice email takes `partial`: when sessions may not have ended, it says so and asks the person to sign out of any device they don't recognize instead of claiming everywhere.
  - The reset lists factors before setting the re-enroll flag, so a failed list changes nothing.
  - Tests for a profile update failure and an `endUserSessions` failure after every factor is gone.
  - Refresh the stale comment in `gridmaster/users/route.ts`; the terminate route's comment is F-101's file and its session is fixing it.
- **F-103** (lands after `fix/billing-active-staff`, which also edits the status route):
  - `useStepUpAction` gains `prompt(action)`, which asks for proof straight away. `useSharedStepUp` calls it after a refusal, so a refused row is sent twice (the refusal, then the assured retry), not three times.
  - The bulk runs its status changes with at most three at a time.
  - `useSharedStepUp.test.tsx` counts the calls.
  - The status route test adds remove gated, activate not gated, and a fresh Gridmaster going on to write.

Must not break: admins' People flows, the person record's refusal of Gridmaster targets, the history's one-entry-per-event rule, and the shared `useStepUpAction` contract for its existing callers.

## Build steps

- [x] **1. Honest labels (F-104, F-110).**
  - _Done when:_ helper tests cover a `DubGrid/` iOS agent, a foreign CFNetwork agent and `okhttp/`; the two titles read "…, open and last 90 days".
- [x] **2. History stripping and ids (F-105).**
  - _Done when:_ a merge test with nested and differently named hash, IP and user-agent keys gets none back, and an uppercase user id keeps the person's own impersonation actions.
- [x] **3. Two-factor reset (F-102).**
  - _Done when:_ tests cover a partial email's wording, a `listFactors` failure leaving no flag, and the two failures after every factor is gone.
- [x] **4. One prompt, fewer sends (F-103).** Built once
      `fix/billing-active-staff` reached `origin/dev` (c6dfdb51).
  - _Done when:_ tests show a refused row is sent twice, a bulk never runs
    more than three at once, and the three route cases pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`
