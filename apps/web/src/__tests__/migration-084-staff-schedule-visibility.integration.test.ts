// @vitest-environment node

/**
 * Migration 084: an organization can hide what changed and who published from
 * staff (item 46f). The routes apply the rule, so the browser role must not
 * read around them: a member still sees publish_history rows (staff apps
 * refresh on them) but not who published, and never the change rows.
 *
 * Runs 084 from its file inside BEGIN/ROLLBACK against the seeded local
 * database. Skipped when the local Postgres is unreachable (CI without
 * Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

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
const MIGRATION = readFileSync(migrationPath("084_staff_schedule_visibility.sql"), "utf8");

let db: Client;

interface Fixture {
  historyId: string;
  orgId: string;
  userId: string;
}

async function findFixture(): Promise<Fixture | null> {
  const { rows } = await db.query<Fixture>(
    `SELECT ph.id AS "historyId", ph.org_id AS "orgId", m.user_id AS "userId"
       FROM public.publish_history ph
       JOIN public.organization_memberships m ON m.org_id = ph.org_id AND m.org_role = 'user'
      LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** Runs a query as the staff member, reporting a refusal instead of aborting the transaction. */
async function asStaff(fixture: Fixture, sql: string, params: unknown[] = []) {
  await db.query("SAVEPOINT staff_read");
  try {
    await actAsAuthenticated(db, {
      sub: fixture.userId,
      role: "authenticated",
      org_id: fixture.orgId,
      org_role: "user",
    });
    const result = await db.query(sql, params);
    return { rows: result.rows as Record<string, unknown>[], error: null };
  } catch (error) {
    return { rows: [], error: (error as Error).message };
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT staff_read");
  }
}

describe.runIf(reachable)("what staff can read after a publish (084, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("adds both organization switches, on by default", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const { rows } = await db.query(
        `SELECT column_name, column_default, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'organizations'
            AND column_name IN ('staff_see_shift_changes', 'staff_see_publisher')
          ORDER BY column_name`,
      );
      expect(rows).toEqual([
        { column_name: "staff_see_publisher", column_default: "true", is_nullable: "NO" },
        { column_name: "staff_see_shift_changes", column_default: "true", is_nullable: "NO" },
      ]);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("lets a staff member see a publication but not who published it or what changed", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const fixture = await findFixture();
      expect(fixture).not.toBeNull();

      const row = await asStaff(
        fixture!,
        `SELECT id, published_at FROM public.publish_history WHERE id = $1`,
        [fixture!.historyId],
      );
      expect(row.error).toBeNull();
      expect(row.rows).toHaveLength(1);

      const publisher = await asStaff(
        fixture!,
        `SELECT published_by FROM public.publish_history WHERE id = $1`,
        [fixture!.historyId],
      );
      expect(publisher.error).toMatch(/permission denied/);

      const changes = await asStaff(
        fixture!,
        `SELECT from_state FROM public.schedule_publish_changes LIMIT 1`,
      );
      expect(changes.error).toMatch(/permission denied/);

      const history = await asStaff(
        fixture!,
        `SELECT * FROM public.get_publish_history($1, 1, 0)`,
        [fixture!.orgId],
      );
      expect(history.error).toMatch(/permission denied/);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps get_publish_history for the service role", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const { rows } = await db.query(
        `SELECT has_function_privilege('service_role', 'public.get_publish_history(uuid, integer, integer)', 'EXECUTE') AS service,
                has_table_privilege('service_role', 'public.schedule_publish_changes', 'SELECT') AS changes`,
      );
      expect(rows[0]).toEqual({ service: true, changes: true });
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
