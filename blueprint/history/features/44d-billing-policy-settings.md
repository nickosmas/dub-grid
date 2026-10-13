# Feature: Billing policy settings

**From build-plan:** feature 44d
**Status:** verified

## Goal

Trial length, the grace period after a trial, the trial reminder window, and the
payment grace period become settings: platform defaults a Gridmaster can change,
plus per-organization overrides. Every place that decides billing access uses the
organization's effective values, without extra database reads per request.

Owner decisions: platform default **plus** per-organization override
(2026-09-22); no cap on trial days set through Change trial (2026-10-12).

## In scope

| #   | Item                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | One shared policy model: four values, platform defaults, per-org overrides, each value's source                                                        |
| 2   | Migration 076: a single-row platform settings table, nullable per-org override columns, range checks, a status check, trial start that uses the policy |
| 3   | A cached platform-policy reader that fails closed to the code defaults, and one helper that evaluates an organization's access with its policy         |
| 4   | Every server path that evaluates billing access, the trial alerts, and the reminder cron use the effective policy                                      |
| 5   | Gridmaster: a platform billing policy card and a per-organization overrides card showing each value and its source                                     |
| 6   | Customer copy that names grace days (trial welcome, public billing page) uses the organization's value                                                 |

The payment grace value is stored and editable here; 44f is what applies it to
past-due subscriptions.

## Out of scope

- Pause and resume, and manual grace extension (44e, which writes the
  per-organization grace override this feature adds).
- Past-due deadlines and lock alerts (44f), history (44g).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Policy model** - `packages/domain/src/billing-policy.ts`:
      `BillingPolicy` (`trialDays`, `trialGraceDays`, `trialReminderDays`,
      `paymentGraceDays`), `DEFAULT_BILLING_POLICY` (14, 3, 7, 14),
      `BILLING_POLICY_LIMITS`, and `resolveBillingPolicy(platform, overrides)`
      returning values plus each value's source (`platform` or `organization`).
      `effectiveBillingStatus` takes an optional grace length. _Done when:_
      domain tests cover defaults, overrides, and a null platform row.
- [x] **Step 2 - Migration 076** - `platform_billing_settings` (boolean primary
      key so only one row can exist, range checks, `updated_by`,
      `updated_at`), seeded with the defaults; RLS on with a Gridmaster-only
      read and no browser writes; nullable override columns on
      `organizations` with the same ranges, readable (not writable) by
      signed-in members because the request proxy reads billing state as the
      member; a `subscription_status` check added `NOT VALID` so new writes
      are checked without failing on unexpected old rows; `start_trial_for_org`
      reads the organization's trial length. Idempotent, checksum locked,
      applied to the local database. _Done when:_ `db:migrations:check`
      passes, the local apply succeeds twice, and SQL checks show the single
      row, the ranges, and a browser role refused.
- [x] **Step 3 - Policy reader and evaluator** - `apps/web/src/lib/billing-policy.ts`
      reads the platform row through the Redis cache with a short per-process
      memo, falls back to `DEFAULT_BILLING_POLICY` on any failure, and exposes
      `evaluateOrgBillingAccess(org)` and an invalidation hook. _Done when:_
      tests cover a cache hit, an override winning, a read error falling back,
      and the memo expiring.
- [x] **Step 4 - Every billing decision uses it** - the proxy, access-status,
      bootstrap, request permissions, employees, mobile org-status, the
      customer billing summary, and `mobile-api-core` sign-in (through its
      existing injected dependencies) select the override columns and evaluate
      with the effective policy; the trial alert's add-by date and the reminder
      cron use it too. _Done when:_ existing tests pass, new tests show an
      organization with a 10-day grace override stays open on day 5 in the
      proxy and the customer summary, and the cron reminds on the org's own
      window.
- [x] **Step 5 - Gridmaster policy API** - `GET /api/gridmaster/billing-policy`
      returns the platform values; `POST` updates them (fresh proof,
      `expectedUpdatedAt` for a 409 on a stale write, audit, cache drop) or an
      organization's overrides (`orgId`, a null value clears it; fresh proof,
      audit, organization cache drop). _Done when:_ route tests cover a
      non-Gridmaster 403, fresh proof, bounds, the 409, clearing an override,
      and both audit rows.
- [x] **Step 6 - Gridmaster policy UI** - a **Billing policy** card on the
      billing page (values plus an edit dialog) and an **Overrides** card on
      the organization Billing tab showing each effective value with
      "platform default" or "organization override"; billing summaries carry
      the effective policy so the Gridmaster views evaluate access with it.
      _Done when:_ component tests cover editing, clearing an override, and
      the source labels, and the browser shows both cards.
- [x] **Step 7 - Customer copy follows the policy** - the trial welcome modal
      and the customer billing summary use the organization's grace days; the
      public billing page says the trial and grace length can differ by
      organization. _Done when:_ a component test shows a 5-day grace override
      in the welcome copy, and `docs:check` passes with the page re-reviewed.

## Files / areas

- `packages/domain/src/billing-policy.ts` (new), `billing.ts`, and tests
- `supabase/migrations/076_billing_policy.sql`, `checksums.sha256`
- `apps/web/src/lib/billing-policy.ts` (new), `lib/cache.ts` key
- The evaluation call sites listed in Step 4, `features/notifications/server/events.ts`,
  `api/cron/trial-expiry`
- `api/gridmaster/billing-policy/route.ts` (new), Gridmaster billing view and tab,
  `TrialWelcomeModal.tsx`, `docs/reference/billing.mdx`

## Data / contracts

- `platform_billing_settings(id boolean PK, default_trial_days, trial_grace_days, trial_reminder_days, payment_grace_days, updated_by, updated_at)`.
- `organizations.{trial_length_days_override, trial_grace_days_override, trial_reminder_days_override, payment_grace_days_override}`, all nullable (null = platform default). Load-bearing for 44e and 44f.
- Limits: trial 1 to 365 days (the platform default only; Change trial stays uncapped), grace 0 to 90, reminder 0 to 90, payment grace 0 to 90.
- `subscription_status` allowed values: the Stripe statuses plus `trial_expired`, or null.

## Testing

- Vitest for the domain model, the reader, the evaluation paths, the cron, the
  route, and the UI; SQL checks against the local database for the migration.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- Fail closed to the code defaults: a cache or database blip must never
  silently lengthen or shorten anyone's grace.
- No extra per-request database read: platform values ride the Redis cache and
  a per-process memo; override columns ride the organization rows each path
  already selects.
- The override columns are granted read-only to `authenticated` (the proxy
  reads the organization row as the member under RLS); they hold day counts the
  member already sees. Anonymous users get nothing, writes stay with
  service-role code, and the platform table stays service-only.
- Apply the migration to the local database only. Production applies it from
  the release runbook before the release PR merges.
- Work in the billing worktree on `feature/44d-billing-policy`.
