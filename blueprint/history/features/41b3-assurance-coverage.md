# Feature: Assurance coverage

**From build-plan:** feature 41b3
**Status:** verified

## Goal

Every route that changes a credential or platform authority should demand
fresh assurance, and the inventory that enforces it should notice such a
route by itself. Two Gridmaster routes act on the Gridmaster session alone:
sending a password reset to any account, and promoting, demoting or
deactivating a Gridmaster, which is a privilege grant. The sensitive-action
inventory missed both because it only looks for a fixed list of calls. On
mobile, the app lock can show content for one frame between the setting
finishing loading and the lock taking hold.

## In scope

- **Gridmaster password reset and account changes require fresh assurance.**
  Both POST handlers call `requireSensitiveActionAuth` after the Gridmaster
  session check; the Gridmaster UI runs them through `useStepUpAction` with
  the credential preflight, as force-logout already does.
- **The inventory notices credential and authority changes by itself.** Its
  source marker also matches a password-reset send, a Gridmaster role change
  and the 41b1 provider-session helpers, and every newly matched route is
  classified with its policy.
- **Mobile change-request approval is held by the delegate inventory.**
- **The app lock has no uncovered frame.** Whether the lock shows is derived
  during render from the loaded setting and an explicit unlocked flag, so the
  first render with the setting enabled already shows it.

## Out of scope

- Gridmaster user deactivation in `gridmaster/users` keeps its recorded
  "authorized-target-revocation" policy.
- Credential mutations that bypass DubGrid (41b2/F-08) stay a decision.

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - Gridmaster password reset requires fresh assurance** - route
      gate plus step-up in both Gridmaster views that send it. _Done when:_
      route tests prove a stale session gets the step-up response and sends
      nothing, and the views run the preflight first.
- [x] **Step 2 - Gridmaster account changes require fresh assurance** - the
      accounts POST (promote, demote, deactivate) gates on assurance; the view
      runs each through step-up. _Done when:_ route tests prove no RPC runs
      without assurance for each action, and view tests the step-up path.
- [x] **Step 3 - the inventory finds these by itself** - extend the source
      marker, classify every newly matched route, add the mobile approval
      delegate. _Done when:_ the inventory test passes and fails if either
      Gridmaster route loses its gate.
- [x] **Step 4 - no uncovered app-lock frame** - derive the lock from render
      state. _Done when:_ a provider test proves the first render after the
      setting resolves to enabled shows the lock, and the existing lock tests
      still pass.

- [x] **Step 5 - audit repairs** - F-09 (unlock keyed on the account, not
      the token), F-10 (confirmations hide behind step-up), F-11 (the cover
      stays under the lock), F-12 and F-13 (inventory scans mobile handlers
      and pins gate order), F-14 (step-up test gaps), F-15 (reset failure
      copy). _Done when:_ each repair has a test that fails without it.

## Files / areas

- `apps/web/src/app/api/gridmaster/password-reset/route.ts`,
  `apps/web/src/app/api/gridmaster/accounts/route.ts` and their tests.
- `apps/web/src/components/gridmaster/GridmasterAccountsView.tsx`,
  `apps/web/src/components/gridmaster/AllUsersView.tsx`,
  `apps/web/src/features/gridmaster/client/api.ts`.
- `apps/web/src/__tests__/sensitive-action-authorization-boundaries.test.ts`.
- `apps/mobile/src/shared/providers/AppLockProvider.tsx` and its test.

## Data / contracts

- No schema change. Both routes return the standard `STEP_UP_REQUIRED` 403
  the step-up hook already handles.

## Testing

- Route, view and inventory tests; the app-lock provider test.

## Notes for the AI

- Follow force-logout's pattern exactly: `requireGridmasterSession`, then
  `requireSensitiveActionAuth`; the client passes the assured token.
- No em dashes.

## Findings

### 41b3/F-09 [P2] closed - A passed Face ID check can leave the app locked when the token refreshes during the prompt

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:87`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The unlock recorded the token captured when the prompt started. A resume with an expired token refreshes it while the prompt is up, so success left `unlockedFor !== accessToken`, the lock stayed, and the automatic prompt never fired again. The same keying re-locked on every refresh while the app was open.
**Suggested fix:** Key the unlock on the stable `sub` claim.
**Resolution:** Keyed on `getUserIdFromAccessToken(accessToken) ?? accessToken`; a test refreshes the token mid-prompt and passes the check once, and fails when the key is the raw token. Another account signing in still locks. Re-review (6164ca4e): closed; a same-account sign-in after signing out does not re-lock, accepted because signing in is a stronger check than the lock.

### 41b3/F-10 [P2] closed - Stepped-up confirmations stay open underneath the step-up dialog

**File:** `apps/web/src/components/gridmaster/GridmasterAccountsView.tsx:517`; `apps/web/src/components/gridmaster/AllUsersView.tsx:733`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The activation, reset, promote and demote confirmations did not follow the existing `confirm && !stepUp.dialog` rule, so two modal dialogs were open at once.
**Suggested fix:** Add `&& !stepUp.dialog` to all five and extend the source assertion.
**Resolution:** Done; the source assertion now covers every stepped-up confirmation in both views. Re-review (6164ca4e): closed.

### 41b3/F-11 [P2] closed - Content can show through while the lock modal fades in

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:143`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The splash cover unmounted in the same render the native fade-in lock modal became visible, so content could show through during the fade.
**Suggested fix:** Render the opaque cover whenever `hydrating || showLock`.
**Resolution:** Done (testID `app-lock-cover`); the frame test now requires every frame covered and the last frame covered and locked. Re-review (6164ca4e): closed.

### 41b3/F-12 [P3] closed - The inventory's marker comment overclaimed; helper mutations and mobile handlers were unscanned

**File:** `apps/web/src/__tests__/sensitive-action-authorization-boundaries.test.ts:191`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** A new route or mobile handler calling `deleteUserAccountWithCleanup` or `syncLinkedLoginEmail` without a gate would not have been caught.
**Suggested fix:** Add the helper names and scan `features/mobile/server/routes/*.ts` against `MOBILE_DELEGATES`.
**Resolution:** Done, with the comment scoped to what it reads. A probe handler calling `syncLinkedLoginEmail` failed the new mobile scan. Re-review (6164ca4e): closed.

### 41b3/F-13 [P3] closed - Two inventory assertions were too loose

**File:** `apps/web/src/__tests__/sensitive-action-authorization-boundaries.test.ts:184`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The mobile approval assertion did not pin `action === "approve"`, and the Gridmaster assertions did not require the gate before the mutation.
**Suggested fix:** Tighten the delegate regex; anchor the gate before the send and the RPCs.
**Resolution:** Done. Replacing the approve-only gate with an unconditional one fails the test. Re-review (6164ca4e): closed.

### 41b3/F-14 [P3] closed - Step-up test gaps

**File:** `apps/web/src/__tests__/GridmasterAccountsView.test.tsx`; `apps/web/src/app/api/gridmaster/accounts/route.test.ts`; `apps/mobile/src/shared/providers/AppLockProvider.frame.test.tsx`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** Demote, activation and a cancelled step-up had no view test, GET was not proven ungated, and the frame test could pass on one entry.
**Suggested fix:** Add the cases and assert the final frame.
**Resolution:** Added demote, deactivate and cancelled step-up view tests, the GET assertion, and the final-frame assertion. Re-review (6164ca4e): closed.

### 41b3/F-15 [P3] closed - The password-reset failure message regressed to a generic one

**File:** `apps/web/src/features/gridmaster/client/api.ts:138`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** A non-JSON failure showed "Gridmaster request failed." instead of "We couldn't send that password reset."
**Suggested fix:** Let the reset call supply its own fallback.
**Resolution:** `requestGridmasterJson` takes a fallback message; the reset passes its own, with a transport test. Re-review (6164ca4e): closed.
