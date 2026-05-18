import { Client } from "pg";

async function main() {
  const url =
    process.env.TARGET_DB_URL ??
    "postgres://postgres:postgres@127.0.0.1:54322/postgres";
  console.log(`target: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const db = new Client({
    connectionString: url,
    ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : false,
  });
  await db.connect();

  for (const fn of ["change_user_role", "assign_org_role_by_email"]) {
    const r = await db.query(
      `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1`,
      [fn],
    );
    const def: string = r.rows[0]?.def ?? "(NOT FOUND)";
    console.log(`\n=== ${fn} ===`);
    const checks = [
      "admin cannot change the role of an admin",
      "admin cannot assign admin or super_admin",
      "Cannot change your own role",
      "No active organization context",
    ];
    for (const c of checks) {
      console.log(`  contains "${c}"?`, def.includes(c));
    }
  }
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
