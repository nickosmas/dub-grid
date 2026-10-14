# Feature: Isolated migration readiness qualification

**From build-plan:** feature 40e2
**Status:** verified

## Goal

Turn the scratch-stack rehearsal in the migration runbook into one repeatable,
local-only command, and use it to qualify the current ledger (001 to 079). The
release then has recorded evidence that each of these works on an isolated
database: a clean install, the forward upgrade from production's recorded
boundary (075), and a signed-in app on upgraded data. Nothing in this feature
reads or writes a remote project.

## In scope

- **A rehearsal command, `npm run db:migrations:rehearse`.**
  - It builds a throwaway Supabase stack with its own project id and ports,
    starting from a chosen ledger boundary.
  - It previews, applies and qualifies the forward suffix, then stops and
    removes the stack.
  - It writes a point-in-time evidence file.
- **Inspector invariants for 076 to 079.** These are the billing tables'
  row-level security, grants and append-only history, plus the replaced
  `start_trial_for_org`. Each is deferred while its migration is still
  pending, as the 016 to 020 checks already are.
- **Three recorded rehearsals** on the candidate commit:
  1. **Clean install:** an empty database takes 001 to 079.
  2. **Unseeded upgrade:** a database at 001 to 075 takes 076 to 079.
  3. **Seeded upgrade:** a copy seeded at 075 takes 076 to 079, then the web
     app signs in against it.
- **Migration-range drift in internal docs.** Correct the stale "through 075" (in five living docs),
  "005...040" and "Supabase branching" claims, and point the runbook's
  sections 2 and 3 at the new command.

## Out of scope

- Any read of, or write to, the production or staging project, including
  `db:migrations:inspect` and `supabase ... --linked`. The real release still
  starts with the runbook's live read (section 1). This feature assumes the
  production boundary recorded on 2026-09-28 (075) and says so in every
  evidence file.
- Applying 076 to 079 to production. That stays the owner's release step, with
  its own authorization.
- Product API, schema or UI changes (item 40's charter). No new migration.
- Browser qualification (40e3) and native evidence (40e4).
- `blueprint/project-plan.md:261` ("through 075"). It is owner-written, so it
  is flagged for the owner rather than edited.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step you haven't read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - Rehearsal plan module.**
  - Add pure functions in `scripts/lib/migration-rehearsal.ts`:
    - **`buildScratchConfig(configToml, { projectId, portBase })`** rewrites
      `project_id` and every port. That includes those outside 5432x, such as
      the edge-runtime inspector's 8083. It turns off studio, inbucket and
      analytics, and empties `[db.seed].sql_paths`.
    - **`splitAtBoundary(files, from)`** returns the files to install up front
      and the suffix to apply later. It rejects a boundary that is not an
      existing version, or `0` for a clean install.
    - **`assertLoopbackUrl(url)`** refuses any host other than `127.0.0.1`,
      `localhost` or `::1`.
    - **`parseDryRunVersions(output)`** reads the versions a
      `db push --dry-run` would apply, and recognizes the up-to-date message.
    - **`renderEvidence(record)`** fills the runbook's evidence template.
  - _Done when:_ unit tests cover:
    - each port rewritten, with none left in 5432x and no duplicates
    - a seed path left in place is rejected
    - boundary edges: 0, 075, 079 and an unknown 080
    - the loopback guard refusing a `supabase.co` URL and a pooler URL
    - dry-run parsing of a captured CLI output for both cases
    - the evidence renderer's output
- [x] **Step 2 - Inspector invariants for 076 to 079.**
  - Add rows to `QUALIFICATION_SQL` in `scripts/inspect-migration-readiness.ts`:
    - `platform_billing_settings`, `subscription_seat_history` and
      `billing_invoice_events` have RLS on, and grant nothing to `anon` or
      `authenticated`.
    - `service_role` holds no `UPDATE`, `DELETE` or `TRUNCATE` on the two
      history tables.
    - `start_trial_for_org(uuid)` is `SECURITY DEFINER`, has a pinned
      `search_path`, and is executable by `authenticated`.
  - Add each to `CHECK_INTRODUCED_BY` with its migration number.
  - _Done when:_
    - `npm run db:migrations:inspect:local -- --expect-complete` passes on the
      shared local stack (079).
    - A unit test pins the new deferral entries.
    - Against a 075 database, the same rows print `DEFER` rather than `FAIL`.
      That case is proved in Step 3's first run.
- [x] **Step 3 - The rehearsal runner.**
  - Add `scripts/rehearse-migrations.ts` and the root script
    `db:migrations:rehearse`.
  - Flags:
    - `--from <NNN|0>` (required)
    - `--port-base` (default 55320)
    - `--evidence <path>`
  - The order of a run:
    1. Run `db:migrations:check` first.
    2. Refuse to start unless every scratch port is free. Another session's
       stack, such as `dubgrid-audit-*`, may hold some.
    3. Copy `config.toml`, the boundary migrations and `templates/` into a
       fresh temp dir. Never copy `supabase/.temp/`.
    4. Start the stack with `npx supabase start --workdir <dir> -x ...`.
    5. Run the inspector with `--local`, with its environment set only to the
       scratch URLs.
    6. Restore the suffix and run `db push --local --workdir <dir> --dry-run`.
       Its versions must equal the suffix exactly.
    7. Apply, then run the inspector with `--expect-complete`.
    8. A final dry run must report up to date.
  - It always stops the stack with `supabase stop --workdir <dir> --no-backup`
    and deletes the temp dir, including after a failure.
  - It never loads `.env.remote`, `.env.staging` or `.env.local`.
  - Classify the new command in `internal/documentation/source-policy.json` as
    operations/internal and regenerate the inventory.
  - _Done when:_
    - `npm run db:migrations:rehearse -- --from 075` exits 0. Its output shows
      the 076 to 079 checks deferred before the apply and passing after it.
    - `docker ps` afterwards shows no container for the scratch project id.
    - The shared 5432x stack's ledger is unchanged; check it with
      `db:migrations:inspect:local` before and after.
    - A forced failure leaves no containers behind, for example a deliberately
      wrong `--from` against a free port set.
    - `npm run docs:check:closed` passes.
- [x] **Step 4 - Seeded upgrade with an app sign-in.**
  - Add a `--seeded` mode. After the boundary stack starts, it seeds it with
    `seed.ts` from the commit where the ledger ended at the boundary,
    checked out in a temporary detached worktree. It uses
    `DATABASE_URL=<scratch db>`, and the URL must pass `assertLoopbackUrl`.
  - Then it applies the suffix as in Step 3 and leaves the stack running for
    the smoke. It prints the scratch API URL and keys from
    `supabase status --workdir <dir> -o env`, so a worktree dev server can
    point at them.
  - A separate `--stop` call tears it down.
  - **Found while building:** the web app's Content Security Policy allowed
    only the shared stack's `127.0.0.1:54321`, so a browser signed in against
    any other local stack was sent back to sign-in. `connect-src` now allows
    whichever loopback origin `NEXT_PUBLIC_SUPABASE_URL` names (new
    `localSupabaseConnectSources`, with a unit test). A hosted URL still adds
    nothing, so production's policy is unchanged.
  - Why this is needed: 076 replaces `start_trial_for_org`, which runs on a
    Super Admin's sign-in, and 076 to 079 change grants and RLS. The runbook
    requires a signed-in smoke for such a suffix, or an explicit disclosure
    that the evidence is unavailable.
  - _Done when_, signed in as `qa-super-admin@dubgrid.test` against the
    upgraded seeded copy, in a worktree dev server (`--webpack`, port 3002):
    - Dashboard, Schedule and Settings > Billing load.
    - The server log has no `42501` or `42703` errors.
    - The stack is then torn down with no containers left.
- [x] **Step 5 - Reconcile the migration docs.**
  - `ARCHITECTURE.md:229` and `:239`: replace "currently through 075" with a
    pointer to the checksum manifest, so the number cannot go stale again.
    Drop "Supabase branching" as an apply path.
  - `supabase/AGENTS.md:19`: replace the `005...040` range claim the same way.
  - `CONTRIBUTING.md:179`, `README.md:191` and
    `internal/architecture/folder-structure.md:244`: the "075" range.
  - `internal/operations/production-migration-safety.md` sections 2 and 3:
    present `db:migrations:rehearse` as the way to build the rehearsal.
    Keep the manual commands as what it does, and keep every
    non-negotiable stop.
  - _Done when:_
    - A grep for `through \`?07[0-9]`and`005.*040` in those living docs
      finds nothing.
    - `npm run docs:check:closed` passes.
- [x] **Step 6 - Record the qualification.**
  - On the candidate commit, run the three rehearsals:
    1. `--from 0`
    2. `--from 075`
    3. `--from 075 --seeded`
  - Write each evidence file to
    `internal/operations/migration-rehearsals/2026-10-NN-<from>-to-079.md`.
    Each records:
    - the commit and checksum file hash
    - the assumed production boundary and its source (2026-09-28 record, not
      a live read)
    - the starting ledger, the dry-run list and the apply result
    - every inspector row
    - the final dry run and timestamps
    - for the seeded run, the smoke result
  - Link the files from the runbook.
  - _Done when_ the three files exist and every field is filled, and they
    record no tenant data, keys or connection strings with passwords.

## Files / areas

- **New:**
  - `scripts/lib/migration-rehearsal.ts` and its test (next to
    `apps/web/src/__tests__/migration-readiness.test.ts`, which already
    covers `scripts/lib`)
  - `scripts/rehearse-migrations.ts`
  - `internal/operations/migration-rehearsals/`
- **Changed:**
  - `scripts/inspect-migration-readiness.ts`
  - `package.json` (one script)
  - `internal/documentation/source-policy.json` and the generated inventory
  - `apps/web/src/proxy.ts` and new `apps/web/src/lib/local-supabase-csp.ts`
    with its test (the local-only CSP origin, Step 4)
  - `ARCHITECTURE.md`, `CONTRIBUTING.md` and `README.md`
  - `supabase/AGENTS.md`
  - `internal/architecture/folder-structure.md`
  - `internal/operations/production-migration-safety.md`
- **Read only:** `supabase/config.toml`, `supabase/migrations/`, `seed.ts` (at
  the boundary commit).

## Data / contracts

- **No schema change and no new migration.** The checksum manifest is
  untouched.
- **Evidence file format** (load-bearing for 40e's closing check and for
  future releases): the runbook's evidence template, with the production rows
  marked "not exercised (local-only qualification)". Add three fields:
  - `Assumed production boundary`
  - `Boundary source`
  - `Rehearsal mode: clean | upgrade | seeded upgrade`
- **Inspector output stays line-compatible:** `PASS|FAIL|DEFER <check>
(<detail>)`. The new check names are stable identifiers, because future
  rehearsals compare them line for line.

## Testing

- **Unit tests (Vitest, gate on):**
  - Step 1's pure functions.
  - Step 2's deferral map.
  - Mock nothing in the pure module.
  - The runner itself is integration and rides on its recorded runs.
- **Live evidence:**
  - Step 3: the 075 run and the forced-failure cleanup.
  - Step 4: the browser sign-in.
  - Step 6: the three evidence files.
- **Final gates:**
  - `npm run type-check`, `npm run lint`, `npm run test`, `npm run build` and
    `npm run docs:check:closed`
  - `npm run db:migrations:inspect:local -- --expect-complete` on the shared
    stack, before and after the work

## Notes for the AI

- **Never touch a remote project.** Do not read `.env.remote`, run `--linked`,
  or call `db:migrations:inspect` without `:local`. Every scratch URL goes
  through `assertLoopbackUrl`.
- **Never touch the shared 5432x stack** beyond a read-only
  `inspect:local`. Other sessions depend on it.
- **Containers.** Check `docker ps` before a run. Another session's
  `dubgrid-audit-*` stack is up, so choose a port base clear of it.
- **Seeding.** Seeding Arden Wood on a local scratch copy is allowed; it is
  never seeded remotely. Evidence files carry pass/fail facts only, never
  tenant names, emails or keys.
- **Supabase CLI.** 2.120.0 is installed. `db push` refuses a non-TLS
  `--db-url`, so the scratch path is `--local --workdir`.
- **Commands.** Run gates through npm scripts, not `npx tsc` (the RTK proxy
  misreports). Build in a worktree with hardlinked `node_modules` (`cp -al`),
  because Turbopack rejects symlinks.
- **Stop rule.** If the CLI cannot run a second stack beside the shared one on
  this machine, stop and report rather than stopping the shared stack.

## Verification

- **Unit tests:** `migration-rehearsal.test.ts` (15), the deferral and
  read-only tests in `migration-readiness.test.ts`, and
  `local-supabase-csp.test.ts` (3) pass.
- **Gates (in the worktree):**
  - `npm run lint` (2 pre-existing `<img>` warnings) and
    `npm run type-check` pass.
  - `npm run test` passes: 23/23 tasks; web 5566 tests in 628 files, mobile
    1407 in 167.
  - `npm run build` passes (11/11 tasks).
  - `npm run docs:check:closed` passes.
- **Shared stack:** `inspect:local --expect-complete` reported the same 79
  entries and 19 passing checks before and after every rehearsal.
- **Runner behavior:**
  - With the scratch database killed mid-run, the command exits 1 and leaves
    no containers or temp folders.
  - It refuses a busy port base (another session's stack on 5632x) and an
    unknown boundary (080).
- **Rehearsals (commit a53d9eea):**
  - [clean install](../../../internal/operations/migration-rehearsals/2026-10-13-000-to-079.md)
  - [upgrade from 075](../../../internal/operations/migration-rehearsals/2026-10-13-075-to-079.md)
  - [seeded upgrade with a signed-in smoke](../../../internal/operations/migration-rehearsals/2026-10-13-075-to-079-seeded.md)
- **Signed-in smoke:**
  - The first attempt found that the dev CSP allowed only port 54321. That
    is fixed by `localSupabaseConnectSources`.
  - The `organization` and `billing` docs fingerprints were refreshed
    because `proxy.ts` is their evidence; their content is unchanged.
- **Not run:**
  - `npm run test:e2e`.
  - Any remote read: the 075 production boundary is the 2026-09-28 record,
    not a live ledger.

## Follow-ups

- **Owner:** `blueprint/project-plan.md:261` still says "through 075".
- **Release:** 076 to 079 still need the runbook's production steps: a live
  ledger read, backup timestamp, owner review of the dry run, then an
  authorized apply.
