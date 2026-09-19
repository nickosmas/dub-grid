# Production migration safety

This is the final release gate for DubGrid's hosted Supabase database. It is an
operator runbook, not authorization to change production. The protected
production project ref is `xpoylacxkbphnudsupuu`.

DubGrid uses an immutable ordered stream: migrations 001-004 are the frozen
baseline and every later schema change is a new, retry-safe numbered migration.
The checked-in checksum manifest makes an edited or missing locked file fail the
local preflight.
Supabase compares these files with `supabase_migrations.schema_migrations` and
`db push --dry-run` previews the missing sequence before an apply. See the
[Supabase migration guide](https://supabase.com/docs/guides/deployment/database-migrations)
and [CLI reference](https://supabase.com/docs/reference/cli/v0/supabase-gen-types-typescript).

## Non-negotiable stops

Stop without applying anything when any of these is true:

- The linked project is not the expected target.
- The local preflight fails, the remote ledger has a gap or renamed/unknown
  entry, or the inspector reports a failed invariant.
- A dry run proposes replaying an old migration, especially 002-005.
- The branch does not contain a current production-shaped data restore.
- A reviewed backup or point-in-time recovery point is unavailable.
- The application commit, migration checksums, or dry-run output changes after
  review.
- Any migration includes an unexplained destructive statement, long table
  rewrite, unbounded backfill, RLS weakening, or broad grant.

Never use `npm run db:reset:remote`, `supabase db reset --linked`, seed data,
historical patches, `--include-all`, or `--include-seed` against production.

## 1. Freeze and inventory the candidate

From the reviewed `dev` commit:

```bash
git rev-parse HEAD
npm run db:migrations:check
git diff --exit-code
```

Save the commit, the 20 filename/checksum lines, the linked-project
classification, and the time of the run in the release ticket. Do not save
connection strings, keys, tokens, or tenant data.

For a clean-install rehearsal, reset the local stack and qualify the resulting
ledger and schema:

```bash
npm run db:reset
npm run db:migrations:inspect:local -- --expect-complete
```

Run the read-only production inspection with the production environment file:

```bash
npm run db:migrations:inspect
```

This reports ledger versions and pass/fail facts only. It does not apply SQL.
If direct Postgres is unavailable it can use the Management API transport; all
HTTP requests are bounded. A failed or timed-out read is an unresolved gate,
not a reason to skip inspection.

After the inspector passes, preview the Supabase CLI candidate:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The missing versions must be one contiguous suffix of the local sequence and
must exactly match the inspector. Do not run `migration repair` merely because
the CLI suggests it; first reconcile the real schema and the release history.

## 2. Create the production-shaped rehearsal

Create a persistent Supabase branch from production using the dashboard. Enable
**Include data** so it is backed by a current production restore; this requires
the project's point-in-time recovery capability. Supabase documents that a
data-bearing branch must be treated with the same care as production and may
increase cost. See [dashboard branching](https://supabase.com/docs/guides/deployment/branching/dashboard).

Record the branch project ref and restore timestamp in the release ticket. Put
its URL and database credentials in a temporary, ignored `.env.branch` file.
Do not run DubGrid's seed command against this branch.

Before mutation, run the same inspector and dry run against the branch:

```bash
npx tsx --env-file=.env.branch scripts/inspect-migration-readiness.ts
npx supabase db push --db-url "$DATABASE_URL" --dry-run
```

The branch ledger and proposed suffix must match production exactly. Have a
second reviewer approve the commit, checksums, dry-run output, and every pending
SQL file.

## 3. Rehearse on the branch

Applying to the hosted branch is an external mutation and needs explicit
authorization for that branch:

```bash
npx supabase db push --db-url "$DATABASE_URL"
npx tsx --env-file=.env.branch scripts/inspect-migration-readiness.ts
```

Deploy the exact reviewed web commit to a branch/preview environment wired only
to that branch. Verify:

- `GET /api/health` returns success.
- A regular user can sign in, restore a session, switch organizations only where
  they hold active membership, and cannot read another tenant.
- An Admin and Super Admin retain only their intended organization permissions.
- Schedule read, draft, publish, open-shift assignment, People, alerts, and
  settings smoke paths work.
- Auth token refresh still contains the expected top-level organization claims.
- The read-only inspector passes and the branch ledger ends at 020 with no
  unknown rows. An environment holding 019 without 020 is broken (every publish
  that adds a cell fails); the inspector's `scheduler_calloff_json_null_safe`
  check reports exactly that state and is never deferred.

Capture pass/fail facts, not personal or tenant data. Fix rehearsal failures
with a new forward migration; never edit an applied file.

## 4. Apply the reviewed production suffix

Immediately before the approved maintenance window:

1. Confirm the latest automated backup/PITR point and document the restore
   decision owner.
2. Re-run the clean-tree inventory, read-only inspector, migration list, and dry
   run against the protected production ref.
3. Confirm the output is byte-for-byte the reviewed contiguous suffix and that
   no deployment or schema change occurred since rehearsal.
4. Obtain the separate explicit production-apply authorization.
5. Apply once with `npx supabase db push --linked`; never include seed data.
6. Re-run the inspector with the production health URL, then repeat the
   authenticated smoke matrix.

Example post-apply qualification:

```bash
npm run db:migrations:inspect -- --expect-complete --health-url https://YOUR_PRODUCTION_ORIGIN/api/health
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The final dry run must report no pending migrations. The ledger must match local
versions 001-020 and every schema, RLS, grant, hook, historical-patch, and
scheduler-calloff invariant must pass.

## Recovery

On an apply error or failed health/isolation check, stop deployments and writes
that could compound the failure. Preserve logs and the exact database error.
Prefer a reviewed forward repair when the transaction left the old schema
usable. If integrity or tenant isolation is uncertain, invoke the documented
PITR/backup restore with the incident owner; do not improvise reverse SQL or
edit the migration ledger. Re-run the entire qualification packet before
restoring traffic.

## Evidence template

```text
Commit:
Migration checksums reviewed:
Production ref confirmed:
Production backup/PITR timestamp:
Production ledger before:
Branch ref and restore timestamp:
Branch dry run reviewed by:
Branch apply result:
Branch inspector and smoke result:
Production apply authorization:
Production apply result:
Production inspector, health, smoke, and final dry run:
Operator / second reviewer / timestamps:
```
