import { readFileSync } from "fs";
import { Client } from "pg";

/**
 * Resets the remote Supabase database by dropping the public schema
 * and re-running all 4 consolidated migration files.
 *
 * Expects .env.local to be pointed at the remote project (via `npm run use:remote`).
 */
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl?.includes("supabase.co")) {
    console.error("ERROR: .env.local is not pointing to a remote Supabase project.");
    console.error("Run `npm run use:remote` first, or use `npm run db:reset` for local.");
    process.exit(1);
  }

  let connectionString: string;

  if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else if (process.env.SUPABASE_DB_PASSWORD) {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    connectionString = `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
  } else {
    console.error("ERROR: Set DATABASE_URL or SUPABASE_DB_PASSWORD in .env.remote");
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
    await db.query(sql);
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

  await db.end();
  console.log("\nRemote DB reset complete.");
}

main().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
