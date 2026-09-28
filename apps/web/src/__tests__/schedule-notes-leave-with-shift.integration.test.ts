// @vitest-environment node

/**
 * Migration 064: a schedule note leaves with its shift however the shift is
 * removed. Each case runs 064 from its file inside BEGIN/ROLLBACK against the
 * seeded local database (063 applied), drives the real SQL paths, and fires
 * the deferred triggers with SET CONSTRAINTS ALL IMMEDIATE.
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
    const { rows } = await probe.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schedule_notes' AND column_name = 'job_id'`,
    );
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

// A date no other integration test seeds, so no two suites contend for one cell.
const DATE = "2031-12-09";

interface Fixture {
  orgId: string;
  actorId: string;
  empId: string;
  focusAreaId: number;
  dayShiftId: number;
  eveningShiftId: number;
  jobId: number;
  indicatorIds: number[];
}

let db: Client;
let fx: Fixture;
let cellId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function loadFixture(): Promise<Fixture> {
  const { id: orgId } = await one<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const { id: actorId } = await one<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
  );
  const pair = await one<{ fa: number; day: number; evening: number }>(
    `SELECT a.focus_area_id AS fa, a.id AS day, b.id AS evening
       FROM public.shift_categories a
       JOIN public.shift_categories b
         ON b.org_id = a.org_id AND b.focus_area_id = a.focus_area_id AND b.start_time = a.end_time
      WHERE a.org_id = $1 AND a.archived_at IS NULL AND b.archived_at IS NULL
      ORDER BY a.id LIMIT 1`,
    [orgId],
  );
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND $2 = ANY(applicable_shift_ids) AND $3 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [orgId, pair.day, pair.evening],
  );
  const emp = await one<{ id: string }>(
    `SELECT id FROM public.employees
      WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL AND $2 = ANY(focus_area_ids)
      ORDER BY seniority LIMIT 1`,
    [orgId, pair.fa],
  );
  return {
    orgId,
    actorId,
    empId: emp.id,
    focusAreaId: Number(pair.fa),
    dayShiftId: Number(pair.day),
    eveningShiftId: Number(pair.evening),
    jobId: Number(job.id),
    indicatorIds: [],
  };
}

/** Writes the cell's draft through the sync every series and request path uses. */
async function writeDraft(shiftIds: number[]): Promise<void> {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
       $3::bigint[], $4::bigint[])`,
    [cellId, fx.orgId, shiftIds, shiftIds.map(() => fx.jobId)],
  );
}

async function addNote(
  indicatorTypeId: number,
  shiftId: number,
  status: "draft" | "published",
): Promise<void> {
  await db.query(
    `INSERT INTO public.schedule_notes
       (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [fx.orgId, fx.empId, DATE, indicatorTypeId, fx.focusAreaId, shiftId, fx.jobId, status],
  );
}

/** Runs the deferred triggers now, as a commit would. */
async function settle(): Promise<void> {
  await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  await db.query("SET CONSTRAINTS ALL DEFERRED");
}

async function notes(): Promise<Array<[number, number | null, string]>> {
  const { rows } = await db.query<{
    indicator_type_id: string;
    shift_id: string | null;
    status: string;
  }>(
    `SELECT indicator_type_id, shift_id, status FROM public.schedule_notes
      WHERE emp_id = $1 AND date = $2 ORDER BY indicator_type_id, shift_id NULLS LAST`,
    [fx.empId, DATE],
  );
  return rows.map((row) => [
    Number(row.indicator_type_id),
    row.shift_id == null ? null : Number(row.shift_id),
    row.status,
  ]);
}

describe.skipIf(!reachable)("064 schedule notes leave with their shift", () => {
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
    // Taken first and all together, so this suite never holds one of these
    // while waiting on another that a parallel suite holds.
    await db.query(
      `LOCK TABLE public.schedule_cells, public.schedule_cell_snapshots,
         public.schedule_cell_segments, public.schedule_notes IN ACCESS EXCLUSIVE MODE`,
    );
    await db.query(
      readFileSync(migrationPath("064_schedule_notes_leave_with_their_shift.sql"), "utf8"),
    );
    await db.query(`DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`, [
      fx.empId,
      DATE,
    ]);
    await db.query(`DELETE FROM public.schedule_notes WHERE emp_id = $1 AND date = $2`, [
      fx.empId,
      DATE,
    ]);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.schedule_cells (emp_id, date, org_id, focus_area_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [fx.empId, DATE, fx.orgId, fx.focusAreaId],
    );
    cellId = rows[0].id;
    // Note types of the test's own: a freshly seeded Calm Haven has none.
    const { rows: indicators } = await db.query<{ id: number }>(
      `INSERT INTO public.indicator_types (org_id, name, color)
       VALUES ($1, '064 note A', '#E24B4A'), ($1, '064 note B', '#378ADD') RETURNING id`,
      [fx.orgId],
    );
    fx.indicatorIds = indicators.map((row) => Number(row.id)).sort((a, b) => a - b);
    await writeDraft([fx.dayShiftId, fx.eveningShiftId]);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("clears only the removed shift's notes when a draft drops it", async () => {
    const [readings, shower] = fx.indicatorIds;
    await addNote(readings, fx.dayShiftId, "draft");
    await addNote(readings, fx.eveningShiftId, "draft");
    await addNote(shower, fx.eveningShiftId, "published");
    await settle();

    await writeDraft([fx.dayShiftId]);
    await settle();

    // Evening's draft note goes, its published one waits for the publish, and
    // Day's note stays.
    expect(await notes()).toEqual([
      [readings, fx.dayShiftId, "draft"],
      [shower, fx.eveningShiftId, "draft_deleted"],
    ]);
  });

  it("keeps both shifts' notes through a publish, and a discard restores a cleared one", async () => {
    const [dayNote, eveningNote] = fx.indicatorIds;
    await addNote(dayNote, fx.dayShiftId, "draft");
    await addNote(eveningNote, fx.eveningShiftId, "draft");
    await settle();

    await db.query(`SELECT public.publish_schedule($1, $2::date, $2::date, $3)`, [
      fx.orgId,
      DATE,
      fx.actorId,
    ]);
    await settle();
    expect(await notes()).toEqual([
      [dayNote, fx.dayShiftId, "published"],
      [eveningNote, fx.eveningShiftId, "published"],
    ]);

    await writeDraft([fx.dayShiftId]);
    await settle();
    expect(await notes()).toEqual([
      [dayNote, fx.dayShiftId, "published"],
      [eveningNote, fx.eveningShiftId, "draft_deleted"],
    ]);

    await db.query(`SELECT public.discard_schedule_drafts($1, NULL, $2::date, $2::date)`, [
      fx.orgId,
      DATE,
    ]);
    await settle();
    expect(await notes()).toEqual([
      [dayNote, fx.dayShiftId, "published"],
      [eveningNote, fx.eveningShiftId, "published"],
    ]);
  });

  it("clears a pruned cell's notes", async () => {
    const [dayNote, eveningNote] = fx.indicatorIds;
    await addNote(dayNote, fx.dayShiftId, "draft");
    await addNote(eveningNote, fx.eveningShiftId, "draft");
    await settle();

    await db.query(`DELETE FROM public.schedule_cells WHERE id = $1`, [cellId]);
    await settle();

    expect(await notes()).toEqual([]);
  });
});
