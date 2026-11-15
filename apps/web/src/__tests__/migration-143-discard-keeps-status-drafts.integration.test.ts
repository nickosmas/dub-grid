// @vitest-environment node

/**
 * Migration 143: discarding drafts leaves the ones a status change wrote. A
 * person marked Away has their days cleared in the draft; discarding the
 * period's drafts used to put their published shifts back while they were
 * still away. Each case runs 143 from its file inside BEGIN/ROLLBACK against
 * the seeded local database.
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
    await probe.query("SELECT 1 FROM public.schedule_cell_snapshots LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

// Dates no other integration test seeds, so no two suites contend for one cell.
const AWAY_DAY = "2034-03-06";
const RETURN = "2034-03-08";
const BACK_DAY = "2034-03-09";

const MIGRATION = readFileSync(migrationPath("143_discard_keeps_status_drafts.sql"), "utf8");

interface Fixture {
  orgId: string;
  empId: string;
  shiftId: number;
  jobId: number;
}

let db: Client;
let fx: Fixture;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function loadFixture(): Promise<Fixture> {
  const { id: orgId } = await one<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const shift = await one<{ id: number; fa: number }>(
    `SELECT id, focus_area_id AS fa FROM public.shift_categories
      WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
      ORDER BY id LIMIT 1`,
    [orgId],
  );
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND $2 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [orgId, shift.id],
  );
  const emp = await one<{ id: string }>(
    `SELECT id FROM public.employees
      WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL AND $2 = ANY(focus_area_ids)
      ORDER BY seniority LIMIT 1`,
    [orgId, shift.fa],
  );
  return { orgId, empId: emp.id, shiftId: Number(shift.id), jobId: Number(job.id) };
}

async function scheduleWorked(date: string, kind: "draft" | "published"): Promise<string> {
  const {
    rows: [cell],
  } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, fx.empId, date],
  );
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [cell.id, fx.orgId, kind, [fx.shiftId], [fx.jobId]],
  );
  return cell.id;
}

async function hasDraft(date: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots d
         ON d.cell_id = c.id AND d.org_id = c.org_id AND d.snapshot_kind = 'draft'
      WHERE c.org_id = $1 AND c.emp_id = $2 AND c.date = $3`,
    [fx.orgId, fx.empId, date],
  );
  return rows.length > 0;
}

describe.skipIf(!reachable)("143 discarding drafts keeps a status change's own", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    fx = await loadFixture();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query("LOCK TABLE public.schedule_cells IN SHARE ROW EXCLUSIVE MODE");
    await db.query(MIGRATION);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("leaves the Away days' drafts and discards the rest", async () => {
    await scheduleWorked(AWAY_DAY, "published");
    await db.query(
      `UPDATE public.employees SET status = 'inactive', away_until = $2 WHERE id = $1`,
      [fx.empId, RETURN],
    );
    // Marking them Away took the published shift off in the draft.
    expect(await hasDraft(AWAY_DAY)).toBe(true);
    // A manager's own draft, after they're back.
    await scheduleWorked(BACK_DAY, "draft");
    expect(await hasDraft(BACK_DAY)).toBe(true);

    await db.query(`SELECT public.discard_schedule_drafts($1, NULL, $2, $3)`, [
      fx.orgId,
      AWAY_DAY,
      BACK_DAY,
    ]);

    expect(await hasDraft(AWAY_DAY)).toBe(true);
    expect(await hasDraft(BACK_DAY)).toBe(false);
  });

  it("discards as before for someone who can be scheduled", async () => {
    await scheduleWorked(AWAY_DAY, "draft");
    await db.query(`SELECT public.discard_schedule_drafts($1, NULL, $2, $2)`, [fx.orgId, AWAY_DAY]);
    expect(await hasDraft(AWAY_DAY)).toBe(false);
  });
});
