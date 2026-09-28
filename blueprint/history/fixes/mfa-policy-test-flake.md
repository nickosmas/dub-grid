# Fix: The live MFA-policy test no longer loses its verified session

**Type:** Fix
**Status:** verified
**Fixes:** F-18

## The problem

`mfa-enforced-in-policies.integration.test.ts` computed a TOTP code and sent
it in one step. Under full-suite load it sometimes got no session back from
the challenge verify, then passed when run alone (again on 2026-09-28, in a full
`test:web`). A code made at the end of its 30-second window can reach the
server in the next one, and the server refuses a code it has already seen.

## The fix

- The owner approved the fix on 2026-09-28.
- The test answers the challenge through `answerChallenge`. It waits out a
  window edge (under 3 seconds left) before computing the code. If the answer
  is refused, it retries once in the next window with a fresh code instead of
  resending the old one.
- A second refusal fails with the auth server's actual error, so a real
  regression still shows.
- The test's timeout rises to 120 seconds to cover one window of waiting.

## Build steps

- [x] **1. Window-safe challenge answer.**
  - _Done when:_ the test passes three runs in a row alone and passes in the
    full suite through the pre-push gate.

## Verify

- `npx vitest run src/__tests__/mfa-enforced-in-policies.integration.test.ts`
  from `apps/web`
