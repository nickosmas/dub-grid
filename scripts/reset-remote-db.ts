import { readFileSync, readdirSync } from "fs";
import { createInterface } from "node:readline/promises";
import { connectSqlClient } from "./lib/db-client";
import { protectedProductionRefs } from "./lib/migration-readiness";

/**
 * Project refs this script will not drop, whatever the operator types.
 *
 * A staging project makes this script routine, and routine is exactly when a
 * stale `.env.remote` or a copied command reaches the wrong database. The ref
 * is not a secret: it is the hostname of the public API URL.
 *
 * Overriding is deliberately awkward. `ALLOW_PRODUCTION_RESET` has to name the
 * exact ref, so no blanket truthy value opens it, and `CONFIRM_RESET=yes` does
 * not bypass it: automation can skip the prompt but never the denylist.
 */
const PRODUCTION_PROJECT_REFS = protectedProductionRefs(process.env.PRODUCTION_PROJECT_REFS);

function refuseProductionReset(ref: string): void {
  if (!PRODUCTION_PROJECT_REFS.has(ref)) return;
  if (process.env.ALLOW_PRODUCTION_RESET === ref) {
    console.warn(`\n⚠️  Production reset explicitly authorised for "${ref}".\n`);
    return;
  }
  console.error(`\n✗ "${ref}" is a production project. This script drops the public schema.`);
  console.error("  Point .env.remote at staging, or run migrations with `supabase db push`.");
  console.error(`  To override deliberately: ALLOW_PRODUCTION_RESET=${ref}`);
  process.exit(1);
}

/**
 * Require the operator to type the project ref back before we DROP its schema
 * (L-8). The only prior guard was `url.includes("supabase.co")`, which production
 * also passes. Skipped when CONFIRM_RESET=yes (for intentional automation).
 */
async function confirmDestructiveReset(ref: string): Promise<void> {
  if (process.env.CONFIRM_RESET === "yes") return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.warn(
    `\n⚠️  This will reset REMOTE project "${ref}" — ALL DATA IS LOST.\n` +
      "   Drops the public schema, deletes every auth user, replays all migrations,\n" +
      "   and records the migration ledger. Signed-in accounts will not survive.",
  );
  const answer = await rl.question(`Type the project ref "${ref}" to confirm: `);
  rl.close();
  if (answer.trim() !== ref) {
    console.error("Confirmation did not match. Aborting.");
    process.exit(1);
  }
}

/**
 * Resets the remote Supabase database by dropping the public schema
 * and re-running every numbered migration file in lexical order.
 *
 * Called by `npm run db:reset:remote` which loads .env.remote via --env-file.
 */
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl?.includes("supabase.co")) {
    console.error("ERROR: .env.remote is not pointing to a remote Supabase project.");
    console.error(
      "Run `npm run db:reset:remote` (loads .env.remote), or `npm run db:reset` for local.",
    );
    process.exit(1);
  }

  let connectionString: string;

  if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (process.env.SUPABASE_DB_PASSWORD) {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;
  } else {
    console.error("ERROR: DATABASE_URL or SUPABASE_DB_PASSWORD not found in .env.remote.");
    process.exit(1);
  }

  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  refuseProductionReset(ref);
  await confirmDestructiveReset(ref);
  console.log(`Connecting to REMOTE Supabase (${ref})...\n`);

  const db = await connectSqlClient({ connectionString, projectRef: ref });

  // Drop and recreate public schema
  console.log("Dropping public schema...");
  await db.query("DROP SCHEMA public CASCADE");
  await db.query("CREATE SCHEMA public");
  await db.query("GRANT ALL ON SCHEMA public TO postgres");
  await db.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");

  // Dropping `public` alone leaves auth.users fully populated, which is worse
  // than either extreme: those accounts still authenticate, but the profile and
  // membership rows the JWT hook reads to build their claims are gone. Clear
  // them here, once the foreign keys that pointed at them no longer exist.
  console.log("Clearing auth users...");
  const { rows: authRows } = await db.query("SELECT count(*)::int AS cnt FROM auth.users");
  await db.query("DELETE FROM auth.users");
  console.log(`  ${authRows[0].cnt} auth user(s) removed`);

  // Run every numbered migration in lexical order. Keeping discovery here
  // prevents remote resets from silently omitting forward migrations.
  const migrationsDirectory = "supabase/migrations";
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
    .sort()
    .map((file) => `${migrationsDirectory}/${file}`);
  if (migrations.length === 0) {
    throw new Error(`No numbered migrations found in ${migrationsDirectory}.`);
  }

  for (const file of migrations) {
    const sql = readFileSync(file, "utf-8");
    console.log(`Running ${file}...`);
    try {
      await db.query(sql);
      console.log(`  ✓ ${file} completed successfully`);
    } catch (err) {
      const pgErr = err as { message: string; position?: string; detail?: string; hint?: string };
      const pos = pgErr.position ? parseInt(pgErr.position, 10) : null;
      let context = "";
      if (pos !== null) {
        const before = sql.substring(Math.max(0, pos - 200), pos);
        const after = sql.substring(pos, pos + 200);
        const lineNum = sql.substring(0, pos).split("\n").length;
        context = `\n  Near line ${lineNum} in ${file}:\n  ...${before}⟨ERROR HERE⟩${after}...`;
      }
      console.error(`\n  ✗ ${file} FAILED`);
      console.error(`  Error: ${pgErr.message}`);
      if (pgErr.detail) console.error(`  Detail: ${pgErr.detail}`);
      if (pgErr.hint) console.error(`  Hint: ${pgErr.hint}`);
      if (context) console.error(context);
      await db.end();
      process.exit(1);
    }
  }

  // Replaying the files as raw SQL applies the schema but tells Supabase
  // nothing, leaving the ledger empty. Branching and `supabase db push` both
  // read that ledger to decide what to apply, so an unrecorded reset looks like
  // a database that has received no migrations at all and the next push tries
  // to replay 001 over a populated schema. Record what we just ran.
  console.log("\nRecording the migration ledger...");
  await db.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
  await db.query(
    `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
       version TEXT PRIMARY KEY, statements TEXT[], name TEXT
     )`,
  );
  for (const file of migrations) {
    const base = file.split("/").pop() ?? file;
    const version = base.slice(0, 3);
    const name = base.slice(4).replace(/\.sql$/, "");
    await db.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name)
       VALUES ($1, $2)
       ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name`,
      [version, name],
    );
  }
  console.log(`  ${migrations.length} migration(s) recorded`);

  // Verify grants are correct — this catches the exact bug where
  // DROP SCHEMA + CREATE SCHEMA wipes Supabase's default grants
  // and ALTER DEFAULT PRIVILEGES only applies to future objects.
  console.log("\nVerifying grants...");
  const { rows } = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
  `);
  const grantCount = parseInt(rows[0].cnt, 10);
  if (grantCount === 0) {
    await db.end();
    console.error("FATAL: No grants found for 'authenticated' role on public tables.");
    console.error(
      "004_grants.sql must include: GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;",
    );
    process.exit(1);
  }
  console.log(`  ${grantCount} table grants for 'authenticated' — OK`);

  // Force PostgREST to reload its schema cache so new functions are immediately available
  await db.query("NOTIFY pgrst, 'reload schema'");
  console.log("  PostgREST schema cache reloaded — OK");

  // Verify critical functions exist
  const { rows: fnRows } = await db.query(`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'custom_access_token_hook',
        'is_gridmaster',
        'start_impersonation',
        'end_impersonation',
        'get_impersonation_history',
        'get_notifications',
        'switch_org'
      )
    ORDER BY routine_name
  `);
  const foundFns = fnRows.map((r: { routine_name: string }) => r.routine_name);
  const expectedFns = [
    "custom_access_token_hook",
    "end_impersonation",
    "get_impersonation_history",
    "get_notifications",
    "is_gridmaster",
    "start_impersonation",
    "switch_org",
  ];
  const missingFns = expectedFns.filter((f) => !foundFns.includes(f));
  if (missingFns.length > 0) {
    console.error(`\nWARNING: Missing critical functions: ${missingFns.join(", ")}`);
    console.error(
      "002_functions_triggers.sql may have partially failed. Check the SQL for errors.",
    );
  } else {
    console.log(`  ${foundFns.length} critical functions verified — OK`);
  }

  await db.end();
  console.log("\nRemote DB reset complete.");
}

main().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
