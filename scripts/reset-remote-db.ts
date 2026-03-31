import { readFileSync } from "fs";
import { Client } from "pg";

/**
 * Resets the remote Supabase database by dropping the public schema
 * and re-running all 4 consolidated migration files.
 *
 * Called by `npm run db:reset:remote` which loads .env.remote via --env-file.
 */
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl?.includes("supabase.co")) {
    console.error("ERROR: .env.local is not pointing to a remote Supabase project.");
    console.error("Run `npm run db:reset:remote` (auto-pulls from Vercel), or `npm run db:reset` for local.");
    process.exit(1);
  }

  let connectionString: string;

  if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (process.env.SUPABASE_DB_PASSWORD) {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;
  } else {
    console.error("ERROR: DATABASE_URL or SUPABASE_DB_PASSWORD not found in .env.local.");
    process.exit(1);
  }

  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  console.log(`Connecting to REMOTE Supabase (${ref})...\n`);

  const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // Drop and recreate public schema
  console.log("Dropping public schema...");
  await db.query("DROP SCHEMA public CASCADE");
  await db.query("CREATE SCHEMA public");
  await db.query("GRANT ALL ON SCHEMA public TO postgres");
  await db.query("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role");

  // Run each migration file in order
  const migrations = [
    "supabase/migrations/001_schema.sql",
    "supabase/migrations/002_functions_triggers.sql",
    "supabase/migrations/003_rls_policies.sql",
    "supabase/migrations/004_grants.sql",
  ];

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
    console.error("004_grants.sql must include: GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;");
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
    console.error("002_functions_triggers.sql may have partially failed. Check the SQL for errors.");
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
