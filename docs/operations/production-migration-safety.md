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
- The rehearsal database did not start from production's exact ledger state.
- The latest daily backup timestamp (or the PITR point, if PITR is on) has not
  been recorded.
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

Save the commit, the filename/checksum lines, the linked-project
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

## 2. Create the upgrade-path rehearsal

DubGrid does not use Supabase branching or PITR for releases (decided
2026-09-19: a schema-only branch proves nothing a local rehearsal does not, a
data-bearing branch needs PITR and larger compute, and PITR waits for client
revenue). The rehearsal is a scratch local Supabase stack that starts at
production's exact ledger and takes the same forward suffix production will.

Build it from the reviewed candidate, never from the shared local stack that
other sessions use on ports 5432x:

1. Copy `supabase/config.toml`, `supabase/migrations/` and `supabase/templates/`
   into a scratch directory. Give it a new `project_id`, shift every port
   (5432x to 5532x, for example), and disable studio, inbucket and analytics.
   Keep `[db.seed].sql_paths` empty and never run `seed.ts` or any seed file
   against it: Arden Wood is a real client and the rehearsal needs no data.
2. Move the pending migrations out of the scratch `migrations/` folder so it
   holds exactly the versions production already has.
3. Start it: `npx supabase start --workdir <scratch>` (exclude the services the
   rehearsal does not read with `-x`).
4. Run the inspector against it in local mode. Its ledger, missing list and
   invariant rows must match the production report line for line:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<api-port> DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<db-port>/postgres \
  npx tsx scripts/inspect-migration-readiness.ts --local
```

Have a second reviewer approve the commit, checksums, dry-run output, and
every pending SQL file before going further.

## 3. Rehearse on the scratch stack

Restore the pending migrations into the scratch `migrations/` folder, then
preview and apply with `--local` from the scratch directory. The CLI insists on
TLS for any `--db-url`, which the local container does not speak, so `--local`
is the only path that exercises `db push` here:

```bash
npx supabase db push --local --workdir <scratch> --dry-run
npx supabase db push --local --workdir <scratch>
NEXT_PUBLIC_SUPABASE_URL=... DATABASE_URL=... npx tsx scripts/inspect-migration-readiness.ts --local --expect-complete
npx supabase db push --local --workdir <scratch> --dry-run
```

The dry run must list exactly the suffix production is missing, the apply must
finish without error, the inspector must report a complete ledger with every
invariant passing, and the final dry run must say the database is up to date.

When a pending migration touches authentication, claims, RLS or grants (as
`021` did by replacing the access-token hook), also run the web app against the
scratch stack and sign in as the seeded QA super admin from a seeded copy, or
disclose that this evidence is unavailable. Additive migrations that touch
neither need no app smoke beyond the inspector.

Stop the scratch stack afterwards: `npx supabase stop --workdir <scratch>`.

Capture pass/fail facts, not personal or tenant data. Fix rehearsal failures
with a new forward migration; never edit an applied file.

## 4. Apply the reviewed production suffix

Immediately before the approved maintenance window:

1. Record the latest daily backup timestamp (Supabase dashboard, Database >
   Backups > Scheduled; PITR is off) and document the restore decision owner.
   Writes since that timestamp are the exposure if a restore is needed.
2. Re-run the clean-tree inventory, read-only inspector, migration list, and dry
   run against the protected production ref.
3. Confirm the output is byte-for-byte the reviewed contiguous suffix and that
   no deployment or schema change occurred since rehearsal.
4. Obtain the separate explicit production-apply authorization.
5. Apply once with `npx supabase db push --linked` from the candidate
   checkout or worktree (copy the gitignored `supabase/.temp/` link metadata
   into a worktree). Do not use `--db-url` with the `.env.remote` connection
   string: it targets the transaction-mode pooler on port 6543, and the CLI
   fails there with `prepared statement already exists` (SQLSTATE 42P05).
   Never include seed data.
6. Re-run the inspector with the production health URL, then repeat the
   authenticated smoke matrix.

Example post-apply qualification:

```bash
npm run db:migrations:inspect -- --expect-complete --health-url https://YOUR_PRODUCTION_ORIGIN/api/health
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The final dry run must report no pending migrations. The ledger must match every
local version through the last checked-in migration, and every schema, RLS,
grant, hook, historical-patch, and scheduler-calloff invariant must pass.

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
Production daily backup timestamp:
Production ledger before:
Rehearsal stack starting ledger:
Rehearsal dry run reviewed by:
Rehearsal apply result:
Rehearsal inspector and smoke result:
Production apply authorization:
Production apply result:
Production inspector, health, smoke, and final dry run:
Operator / second reviewer / timestamps:
```
