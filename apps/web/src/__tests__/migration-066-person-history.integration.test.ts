// @vitest-environment node

/**
 * Migration 066: the person history's target-user index, and the actor-email
 * lookup that is safe only because of its grants (F-111). Each case runs 066
 * from its file inside BEGIN/ROLLBACK against the local database; both of its
 * statements are idempotent, so this holds whether or not 066 is applied.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const FUNCTION = "public.gridmaster_user_emails(uuid[])";
const INDEX = "idx_audit_log_details_target_user";

let db: Client;

describe.skipIf(!reachable)("migration 066: person history index and actor emails", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    // Building the index takes this lock anyway; taking it first means a
    // parallel suite's audit insert waits rather than deadlocks.
    await db.query("LOCK TABLE public.audit_log IN SHARE MODE");
    await db.query(readFileSync(migrationPath("066_person_history_target_index.sql"), "utf8"));
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("lets only the service role run the email lookup", async () => {
    const { rows } = await db.query<{ role: string; allowed: boolean }>(
      `SELECT role, has_function_privilege(role, $1, 'EXECUTE') AS allowed
         FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`,
      [FUNCTION],
    );
    expect(Object.fromEntries(rows.map((row) => [row.role, row.allowed]))).toEqual({
      anon: false,
      authenticated: false,
      service_role: true,
    });
  });

  it("refuses a signed-in caller", async () => {
    await db.query("SAVEPOINT signed_in");
    await db.query("SET LOCAL ROLE authenticated");
    await expect(
      db.query("SELECT * FROM public.gridmaster_user_emails(ARRAY[gen_random_uuid()])"),
    ).rejects.toThrow(/permission denied for function gridmaster_user_emails/);
    await db.query("ROLLBACK TO SAVEPOINT signed_in");
  });

  it("returns the emails of the accounts asked for, and nothing for an unknown id", async () => {
    const { rows: users } = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM auth.users WHERE email IS NOT NULL ORDER BY created_at LIMIT 1`,
    );
    if (!users[0]) throw new Error("No seeded account. Run npm run db:reset");

    const { rows } = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM public.gridmaster_user_emails(ARRAY[$1::uuid, gen_random_uuid()])`,
      [users[0].id],
    );
    expect(rows).toEqual([{ id: users[0].id, email: users[0].email }]);
  });

  it("serves the person history's target-user branch from the index", async () => {
    await db.query("SET LOCAL enable_seqscan = off");
    const id = "00000000-0000-4000-8000-000000000066";
    const { rows } = await db.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT id FROM public.audit_log
        WHERE actor_id = $1::uuid
           OR (resource_type = 'user' AND resource_id = $1::text)
           OR details ->> 'targetUserId' = $1::text`,
      [id],
    );
    const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
    expect(plan).toContain(`Bitmap Index Scan on ${INDEX}`);
    expect(plan).not.toContain("Seq Scan");
  });
});
