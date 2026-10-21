// @vitest-environment node

/**
 * Migration 087: a publish no longer writes the per-person shift_change
 * alert; the publish route sends one alert per person with every changed day
 * (item 46e). Runs 087 from its file inside BEGIN/ROLLBACK against the seeded
 * local database, as a Calm Haven Super Admin, and publishes a change for a
 * linked staff member. Skipped when the local Postgres is unreachable.
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
const MIGRATION = readFileSync(migrationPath("087_publish_alerts_leave_the_database.sql"), "utf8");
const DAY = "2031-03-04";

let db: Client;

interface Fixture {
  org_id: string;
  emp_id: string;
  emp_user_id: string;
  publisher_id: string;
  shift_id: number;
  job_id: number;
}

describe.runIf(reachable)("publishing writes no alert rows (087, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("publishes a linked staff member's change without a notification row", async () => {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL statement_timeout = '10s'");
      await db.query(MIGRATION);
      const {
        rows: [fixture],
      } = await db.query<Fixture>(`
        SELECT o.id AS org_id, e.id AS emp_id, e.user_id AS emp_user_id,
          publisher.id AS publisher_id, pair.shift_id, pair.job_id
        FROM public.organizations o
        JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
          AND e.archived_at IS NULL AND e.user_id IS NOT NULL
        JOIN auth.users publisher ON publisher.email = 'qa-super-admin@dubgrid.test'
        CROSS JOIN LATERAL (
          SELECT sc.id::integer AS shift_id, j.id::integer AS job_id
          FROM public.shift_categories sc
          JOIN public.jobs j ON j.org_id = o.id AND j.archived_at IS NULL
          WHERE sc.org_id = o.id AND sc.archived_at IS NULL
            AND public.is_employee_qualified_for_shift_job(e.id, sc.id, j.id) IS NULL
          ORDER BY sc.id, j.id
          LIMIT 1
        ) AS pair
        WHERE o.slug = 'calmhaven' AND e.user_id <> publisher.id
        ORDER BY e.id
        LIMIT 1
      `);
      expect(fixture).toBeDefined();
      await db.query(`DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2::date`, [
        fixture!.emp_id,
        DAY,
      ]);

      await actAsAuthenticated(db, {
        sub: fixture!.publisher_id,
        role: "authenticated",
        org_id: fixture!.org_id,
        org_role: "super_admin",
        platform_role: "none",
      });
      await db.query(
        `SELECT public.write_schedule_cell_snapshot(
           $1::uuid, $2::uuid, $3::date, 'draft', 'worked',
           $4::bigint[], $5::bigint[], NULL::bigint
         )`,
        [fixture!.org_id, fixture!.emp_id, DAY, [fixture!.shift_id], [fixture!.job_id]],
      );
      const {
        rows: [published],
      } = await db.query<{ history_id: string }>(
        "SELECT public.publish_schedule($1::uuid, $2::date, $2::date, $3::uuid) AS history_id",
        [fixture!.org_id, DAY, fixture!.publisher_id],
      );
      expect(published?.history_id).toBeTruthy();

      await db.query("RESET ROLE");
      const {
        rows: [counts],
      } = await db.query<{ changes: number; alerts: number }>(
        `SELECT
           (SELECT count(*)::integer FROM public.schedule_publish_changes
             WHERE publish_history_id = $1 AND emp_id = $2) AS changes,
           (SELECT count(*)::integer FROM public.notifications
             WHERE user_id = $3 AND created_at >= now()) AS alerts`,
        [published!.history_id, fixture!.emp_id, fixture!.emp_user_id],
      );
      expect(counts).toEqual({ changes: 1, alerts: 0 });
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
