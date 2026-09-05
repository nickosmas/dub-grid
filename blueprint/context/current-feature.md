# Current Feature

**Title:** A production migration path that is not a full database reset

**Type:** Fix

**Status:** not started

## The problem

There is no way to apply a schema change to production without destroying its
data. `scripts/reset-remote-db.ts` is the only remote path and it runs
`DROP SCHEMA public CASCADE` before replaying every migration. With launch
approaching, that is not a deployment strategy.

The written policy is already right: `001`-`004` are the clean-install
definition and `005`+ are ordered forward migrations, with the canonical files
kept in step. What is missing is a mechanism to apply the forward ones. So the
team hand-writes `supabase/patches/*.sql` instead, a shadow migration system
with no ledger, no ordering, and no record of what an environment has received.

Three findings shape the fix:

- **The Supabase CLI already accepts the `001_` numbering.** `migration list`
  reads all thirteen as valid versions, so `supabase db push` works against the
  existing filenames. No renaming, no reformatting.
- **There is no deploy workflow.** CI runs on pull requests and pushes to `main`,
  but Vercel deploys itself from `main`, so migrations have nowhere to run and
  nothing sequences them against the code deploy.
- **The forward migrations are low risk to start applying.** All nine are pure
  DDL apart from four carrying data statements, and none is destructive.

`013_schedule_editor_sessions.sql` is the worked example of the failure. It ships
in the current release alongside the route that reads its table, so production
gets the code and not the table.

## The fix

Adopt Supabase branching, now that both Supabase and Vercel are on Pro.
Branching runs migrations against production when a branch merges, which is the
mechanism this project has never had, and its Vercel integration points each
preview deployment at that branch's own database.

Two gaps branching does not close, both of which still need handling:

- **A preview branch starts empty.** `[db.seed].sql_paths` is `[]`, because
  seeding here is a TypeScript script (`seed.ts`) run after `supabase db reset`,
  not a SQL path the CLI knows about. Left alone, a preview branch comes up with
  schema and no organization, no users, and nothing to sign in to.
- **A preview branch replays onto an empty database.** That proves a clean
  install, not the upgrade from production's real state, which is where the risk
  lives given the unknown ledger and the `011` and `007` drift.

Migrations still have to survive landing either side of the code deploy, because
Supabase migrates on merge and Vercel builds on merge.

| Concern                          | Owner                                                |
| -------------------------------- | ---------------------------------------------------- |
| What an environment has received | `supabase_migrations.schema_migrations`, via the CLI |
| Applying only what is missing    | Branching on merge, or `supabase db push`            |
| Surviving a code/schema race     | Expand and contract, enforced in review              |
| Clean installs                   | Canonical `001`-`004`, unchanged                     |

**Editing a canonical file is a no-op for any existing database, permanently.**
Once `001` is in the ledger it never runs again, so canonical edits are
documentation for future clean installs and must always be paired with a forward
migration. That is the trap the patches were papering over, and it belongs in
`AGENTS.md` in as many words.

## Build steps

- [ ] **1. Establish what production has already received.** Run
      `npx supabase migration list --linked` with a `SUPABASE_ACCESS_TOKEN`, and
      compare against `supabase/patches/*.sql` to see which forward migrations were
      applied by hand. Nothing else can proceed until this is known.
      Done when the applied set is written down here.

- [ ] **2. Baseline the remote ledger.** For every migration already live, run
      `supabase migration repair --status applied <version>`. Without this a first
      push replays `001` against a populated database and fails.
      Done when `migration list --linked` shows local and remote agreeing on
      everything except genuinely unapplied migrations.

- [ ] **3. Apply the outstanding migrations.** With the ledger baselined,
      branching (or `supabase db push`) should apply only what production lacks,
      `013` included.
      Note that `011_calendar_feed_tokens.sql` is the one migration that is not
      re-runnable (bare `CREATE TABLE`), so make it idempotent before any push that
      might retry.
      Done when production carries every migration and the ledger says so.

- [ ] **4. Sequence migrations ahead of the code deploy.** Vercel deploys on
      merge, so a migration job on the same trigger races it. Apply migrations before
      merging the release PR, and adopt expand and contract as the standing rule so a
      race degrades instead of breaking. The editor-sessions route already does this:
      a missing table reports "no terminations" rather than a 500.
      Done when the release checklist names the order and `AGENTS.md` records the
      rule.

- [ ] **5. Make preview branches usable.** Wire the seed SQL into
      `[db.seed].sql_paths`, or run `seed.ts` against a freshly created branch, so
      a preview has an organization to sign in to. Without it branching yields a
      correct but unusable database.
      Done when a preview branch accepts a seeded QA account.

- [ ] **6. Rehearse the upgrade, not just the clean install.** Restore a
      production backup into a persistent branch and take the migration against it
      before production sees it. Pro now provides the daily backup this depends on,
      and an untested restore is not a backup.
      Done when a production-shaped database has taken the migration cleanly.

- [x] **7. Guard the destructive path.** `reset-remote-db.ts` refuses production
      refs ahead of the typed confirmation, beyond the reach of `CONFIRM_RESET=yes`;
      overriding requires `ALLOW_PRODUCTION_RESET` to name the exact ref.
      `db:reset:staging` gives the script a legitimate target. Still open: a CI
      check that applies canonical `001`-`004` to one scratch database and every
      migration to another and asserts the schemas match, and retiring
      `supabase/patches/` once branching is live.

## Verify

- `npx supabase migration list --linked` agrees with the local set
- A deliberate unmirrored canonical change fails the new CI check
- `db:reset:remote` refuses the production project ref
- `npm run test:web`, `npm run type-check`, `npm run build`

## Out of scope

- Rewriting the canonical/forward split, which is sound as designed
- Zero-downtime tooling beyond expand and contract
- The `decode-uri-component` advisory, which needs react-navigation to move off
  `query-string@7`
