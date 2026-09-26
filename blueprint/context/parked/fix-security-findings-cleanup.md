# Fix: Security findings cleanup

**Type:** Fix
**Status:** in progress (built alongside 43a, which holds
`current-feature.md` in another session)

## Goal

Close the open review findings from item 41 that need no product decision,
one small reviewed step each, so the ledger holds only decisions and
evidence the owner must supply.

## In scope

- **F-32:** only the server writes `audit_log` and `role_change_log`
  (a migration revokes `authenticated`'s writes; every app path already
  uses the service role or a SECURITY DEFINER function).
- **F-46:** a detection error in the new-sign-in claim answers 5xx so the
  client retries instead of losing the alert.
- **F-29:** a sign-in refused by the access-token hook writes a `rejected`
  audit row with a disabled-account reason.
- **F-57:** the app's password rule has the maximum Supabase accepts.
- **F-38:** the in-app impersonation notices use the same wording as the
  emails.
- **F-41:** stale references to the retired notify route are updated.
- **F-72:** the SQL entry-point allowlist helper tracks signatures and role
  lists.
- **F-56:** view tests for the Users tab and compliance export step-up.
- **F-54:** re-reviewed and closed.

## Out of scope (need a decision or owner evidence)

- F-05 (tied to F-08's client-reported label), F-62 (setting stays off),
  F-75 remainder (schedule editing), F-18 (flaky, unverified), and the
  race findings that need unique indexes or RPC changes (F-20, F-25, F-26),
  which are recorded for a later item.

## Build steps

- [x] **Step 1 - F-32 audit tables server-written only** (migration 056)
- [x] **Step 2 - F-46 and F-29 sign-in audit and alert gaps**
- [ ] **Step 3 - F-57 password maximum**
- [ ] **Step 4 - F-38 impersonation notice wording** (migration)
- [ ] **Step 5 - F-41, F-72 and F-56 references, helper and tests**
- [ ] **Step 6 - review and close**

## Notes for the AI

- Production migrations from this fix go by the runbook with the owner's
  approval. No em dashes.
