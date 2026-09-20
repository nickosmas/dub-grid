# Feature: Production migration safety

**From build-plan:** feature 37
**Status:** in progress

## Goal

Make the final Supabase migration release path auditable, repeatable, and safe:
identify the exact protected production target, reconcile its ledger against the
25 checked-in forward migrations, prove the sequence on a production-shaped
branch, and apply only reviewed missing migrations with post-apply verification.

## In scope

- A deterministic local preflight for migration numbering, file integrity,
  protected-target identification, legacy-patch disposition, and documentation
  drift.
- A read-only remote inventory that reports migration-ledger, schema, grants,
  critical functions, tenant-isolation invariants, and deployment health without
  exposing credentials or tenant data.
- A production-shaped branch rehearsal using a current production backup or
  equivalent sanitized restore, followed by the exact forward-only migration
  candidate and the same verification checks.
- An operator runbook with preflight, backup, dry-run, apply, verification,
  rollback/stop conditions, and durable evidence capture.
- Reconciliation of stale repository documentation that still says the schema
  is maintained in only four mutable files.

## Out of scope

- Resetting, dropping, truncating, or reseeding production.
- Rewriting migrations already present in any environment ledger.
- Applying migrations to production, creating a hosted branch, restoring a
  production backup, changing provider configuration, deploying, or pushing
  without separate explicit authorization at that boundary.
- Product features or schema changes unrelated to the migration-safety tooling.

## Build steps

- [x] **Step 1 - Lock the migration inventory and safety contract** - add a
      deterministic preflight that validates contiguous unique numbered files,
      immutable-baseline policy, protected linked-project identity, legacy patch
      disposition, and required operator documentation. _Done when:_ the local
      inventory fails closed on gaps, duplicates, stale patch ambiguity, or a
      production target used with a destructive command.
- [x] **Step 2 - Add read-only remote qualification** - provide a credential-safe
      inspector for the Supabase migration ledger, expected schema objects,
      grants, critical functions, and tenant-isolation invariants. _Done when:_
      it reports only counts, versions, names, and pass/fail facts; bounds network
      waits; and tests prove it cannot mutate or disclose row data.
- [x] **Step 3 - Document and rehearse the exact forward path** - replace stale
      four-file guidance, map legacy patches to their authoritative forward
      migration disposition, and write the production-shaped branch rehearsal
      and production runbook. _Done when:_ a clean local replay passes and the
      runbook has explicit backup, dry-run, reviewed-diff, apply, health, schema,
      tenant-isolation, ledger, stop, and rollback checks.
- [ ] **Step 4 - Qualify the linked production candidate** (read-only half done 2026-09-20; branch rehearsal and apply await authorization) - capture the linked
      target and its read-only ledger, rehearse the missing sequence on a hosted
      production-shaped branch, then—only with separate explicit authorization—
      apply the reviewed missing migrations and re-run the qualification packet.
      _Done when:_ production and repository ledgers match through migration 025,
      application health and isolation checks pass, and no unreviewed migration
      or legacy patch is applied.
- [ ] **Step 5 - Final release verification** (repository gate green 2026-09-20; post-apply checks await Step 4) - run the full repository gate and
      archive the evidence. _Done when:_ tests, type-check, lint, formatting, and
      production build pass; all migration checks are green; and no external
      mutation is left implicit or unreported.

## Files / areas

- `supabase/migrations/`, `supabase/patches/`, and `supabase/AGENTS.md` - ordered
  migration truth and legacy patch disposition.
- `scripts/` - fail-closed local preflight and read-only remote qualification.
- `docs/operations/` and root architecture/deployment docs - operator runbook.
- Script tests and SQL contract tests - safety, non-mutation, and invariants.

## Notes for the AI

- The linked ref `xpoylacxkbphnudsupuu` is protected production. Never run
  `db reset`, the remote reset script, seed, broad SQL, or an apply command
  against it without the separate explicit authorization required above.
- If the CLI proposes replaying older migrations `002`-`005`, stop. Reconcile
  the remote ledger and historical recovery record; do not accept the proposal.
- Historical patches are evidence, not a second migration stream. Each must be
  mapped to an authoritative ledger state or an explicit one-time prerequisite.
- A clean branch proves fresh install only. Upgrade safety requires a current
  production-shaped restore and the exact missing forward sequence.
- Never print connection strings, access tokens, secret keys, tenant names,
  emails, or row contents in reports.

## Evidence so far (checkpoint `ee4207e0`, 2026-09-14, migrations through 019)

- Local preflight: 19 contiguous, checksum-locked migrations and three mapped
  historical patches; linked ref correctly classified as protected production.
- Clean local replay: migrations 001-019 applied in order, seed completed, and
  the read-only local inspector passed every ledger, schema, RLS, grant, hook,
  legacy-patch, and migration-019 invariant.
- Protected production read: application health returned HTTP 200; the ledger
  contains 001-015; all applicable pre-migration invariants passed.
- Independent Supabase dry run: exactly 016, 017, 018, and 019 are pending. This
  matches the inspector and does not propose replaying any old migration.
- Hosted branch inventory: no preview or persistent branch currently exists.
  Creating the required production-data rehearsal branch is an external,
  potentially billable action and remains outside current authorization.
- Full repository gate: all workspace tests, type-check, lint, formatting, and
  the production build passed on the exact local candidate. Step 5 remains open
  only because its final post-apply migration checks depend on Step 4.

## Evidence, 2026-09-20 resume (migrations through 025)

Candidate commit `4fab2f39` (this spec's own commit follows it and changes
no migration). Every step below was read-only.

- Local preflight (`npm run db:migrations:check`, linked checkout): 25
  contiguous checksum-locked migrations (001-025), three mapped legacy patches,
  linked ref `xpoylacxkbphnudsupuu` classified as PROTECTED PRODUCTION, reset
  / seed / apply blocked by policy. `git diff --exit-code -- supabase/` clean.
- Protected production read (`npm run db:migrations:inspect`, SELECT-only):
  remote ledger 23 entries (001-023); missing forward migrations exactly
  `024`, `025`; all twelve invariants PASS (auth hook privileges, live-state
  caller org, legacy department columns and indexes, membership archive
  trigger, org-scoped RLS, publish split times, role certification columns,
  scheduler call-off function/trigger/json-null safety).
- Independent Supabase CLI view (`migration list` and `db push --dry-run`
  against the production URL): local and remote agree through 023; the dry
  run would push only `024_scrub_invite_token_from_audit.sql` and
  `025_count_schedule_cell_usage.sql`, in that order, and proposes no replay
  of any older migration. Nothing was applied.
- Production health before any change: `GET https://www.dubgrid.com/api/health`
  answered 200 with `db` and `redis` ok (the apex 307s to www).
- Pending migrations reviewed: 024 is a single scoped `UPDATE` on
  `audit_log.details` (removes the invitation token copies, touches nothing
  else; dry run on the local seed cleaned 3 rows). 025 adds one SECURITY
  DEFINER `STABLE` count function granted to `service_role` only. Neither
  rewrites a table, weakens RLS, or broadens a grant.
- Full repository gate on the candidate: Prettier clean; lint 0 errors
  (3 pre-existing `no-img-element` warnings); type-check 24/24 tasks; tests
  11/11 workspaces green (web 455 files, mobile 147, packages all passing);
  production build 11/11 tasks with `/_not-found` and the new mobile calendar
  route listed as dynamic.

## Stop point (needs separate explicit authorization)

Two actions remain and the plan itself says neither is authorized by it:

1. Create the persistent, data-bearing Supabase branch from production
   (dashboard, **Include data**; billable, needs point-in-time recovery) and
   rehearse `024`-`025` there with the inspector and health checks.
2. Apply `024` and `025` to production (`supabase db push`) after the
   rehearsal, then re-run the inspector and the health, schema and
   tenant-isolation checks.

Step 4's done-when (ledgers match through 025) and Step 5's post-apply checks
depend on those two. Everything else in both steps is complete.
