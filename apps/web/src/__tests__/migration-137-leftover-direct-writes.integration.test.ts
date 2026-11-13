// @vitest-environment node

/**
 * Migration 137: the last direct writes a signed-in user held go (F-200,
 * F-214, F-215), and removing a focus area from people names its organization
 * (F-216). Each test applies the migration inside a transaction and rolls it
 * back, so it runs on a database at 136 or later without changing it.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

const MIGRATION = readFileSync(
  resolve(__dirname, "../../../../supabase/migrations/137_leftover_direct_writes_server_only.sql"),
  "utf8",
);

const ORG_A = "00000000-0000-4000-8000-0000000137a1";
const ORG_B = "00000000-0000-4000-8000-0000000137b1";

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
let db: Client;

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

async function inMigratedTransaction(run: () => Promise<void>): Promise<void> {
  await db.query("BEGIN");
  try {
    await db.query(MIGRATION);
    await run();
  } finally {
    await db.query("ROLLBACK");
  }
}

async function privilegesHeld(table: string): Promise<string[]> {
  const { rows } = await db.query<{ privilege: string }>(
    `SELECT privilege
       FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS privilege
      WHERE has_table_privilege('authenticated', $1::regclass, privilege)`,
    [`public.${table}`],
  );
  return rows.map((row) => row.privilege);
}

describe.runIf(reachable)("migration 137: leftover direct writes (live DB)", () => {
  it("leaves a signed-in user no write on organizations or schedule notes", async () => {
    await inMigratedTransaction(async () => {
      expect(await privilegesHeld("organizations")).toEqual([]);
      expect(await privilegesHeld("schedule_notes")).toEqual([]);
      const { rows } = await db.query<{ count: string }>(
        `SELECT count(*)::TEXT AS count
           FROM information_schema.column_privileges
          WHERE grantee = 'authenticated' AND table_schema = 'public'
            AND table_name = 'organizations' AND privilege_type = 'UPDATE'`,
      );
      expect(rows[0].count).toBe("0");
    });
  });

  it("refuses a direct delete of a focus area, shift or job", async () => {
    await inMigratedTransaction(async () => {
      for (const table of ["focus_areas", "shift_categories", "jobs"]) {
        expect(await privilegesHeld(table)).not.toContain("DELETE");
        expect(await privilegesHeld(table)).not.toContain("TRUNCATE");
      }
    });
  });

  it("removes a focus area only from the named organization's people", async () => {
    await inMigratedTransaction(async () => {
      await db.query(
        `INSERT INTO public.organizations (id, name, slug)
         VALUES ($1, 'Migration 137 A', 'migration-137-a'), ($2, 'Migration 137 B', 'migration-137-b')`,
        [ORG_A, ORG_B],
      );
      const { rows: areas } = await db.query<{ id: string; org_id: string }>(
        `INSERT INTO public.focus_areas (org_id, name)
         VALUES ($1, 'North'), ($2, 'South')
         RETURNING id, org_id`,
        [ORG_A, ORG_B],
      );
      const areaA = areas.find((area) => area.org_id === ORG_A)!.id;
      const areaB = areas.find((area) => area.org_id === ORG_B)!.id;
      await db.query(
        `INSERT INTO public.employees (org_id, first_name, last_name, employee_number, seniority, focus_area_ids)
         VALUES ($1, 'Ann', 'A', 91371, 1, ARRAY[$3::BIGINT]),
                ($2, 'Ben', 'B', 91372, 1, ARRAY[$4::BIGINT])`,
        [ORG_A, ORG_B, areaA, areaB],
      );

      await db.query("SET LOCAL ROLE service_role");
      await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await db.query("SELECT public.remove_focus_area_from_employees($1, $2)", [areaA, ORG_A]);
      // Another organization's area named under this organization touches nobody.
      await db.query("SELECT public.remove_focus_area_from_employees($1, $2)", [areaB, ORG_A]);
      await db.query("RESET ROLE");

      const { rows } = await db.query<{ first_name: string; focus_area_ids: string[] }>(
        `SELECT first_name, focus_area_ids FROM public.employees
          WHERE org_id IN ($1, $2) ORDER BY first_name`,
        [ORG_A, ORG_B],
      );
      expect(rows).toEqual([
        { first_name: "Ann", focus_area_ids: [] },
        { first_name: "Ben", focus_area_ids: [areaB] },
      ]);
    });
  });

  it("refuses a caller who is neither the service role nor signed in", async () => {
    await inMigratedTransaction(async () => {
      await db.query("SET LOCAL ROLE authenticated");
      await db.query(`SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      await expect(
        db.query("SELECT public.remove_focus_area_from_employees(1, $1)", [ORG_A]),
      ).rejects.toThrow(/Unauthorized/);
    });
  });
});
