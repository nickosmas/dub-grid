// @vitest-environment node

/**
 * Migration 063: a schedule note belongs to one shift of its cell. Each case
 * runs inside BEGIN/ROLLBACK against the seeded local database. It puts the
 * table back into its pre-063 shape when the migration is already applied, so
 * the backfill is exercised either way, then runs 063 from its file.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
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

// A date no other integration test seeds, so no two suites contend for one cell.
const DATE = "2031-11-19";

interface Fixture {
  orgId: string;
  empId: string;
  focusAreaId: number;
  otherFocusAreaId: number;
  dayShiftId: number;
  eveningShiftId: number;
  outsideShiftId: number;
  jobId: number;
  indicatorId: number;
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
  // Two shift codes in one focus area, as the report had: Day and Evening.
  const pair = await one<{ fa: number; day: number; evening: number }>(
    `SELECT a.focus_area_id AS fa, a.id AS day, b.id AS evening
       FROM public.shift_categories a
       JOIN public.shift_categories b
         ON b.org_id = a.org_id AND b.focus_area_id = a.focus_area_id AND b.start_time = a.end_time
      WHERE a.org_id = $1 AND a.archived_at IS NULL AND b.archived_at IS NULL
      ORDER BY a.id LIMIT 1`,
    [orgId],
  );
  const outside = await one<{ id: number; fa: number }>(
    `SELECT id, focus_area_id AS fa FROM public.shift_categories
      WHERE org_id = $1 AND focus_area_id IS NOT NULL AND focus_area_id <> $2
      ORDER BY id LIMIT 1`,
    [orgId, pair.fa],
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
  const indicator = await one<{ id: number }>(
    `SELECT id FROM public.indicator_types WHERE org_id = $1 ORDER BY id LIMIT 1`,
    [orgId],
  );
  return {
    orgId,
    empId: emp.id,
    focusAreaId: Number(pair.fa),
    otherFocusAreaId: Number(outside.fa),
    dayShiftId: Number(pair.day),
    eveningShiftId: Number(pair.evening),
    outsideShiftId: Number(outside.id),
    jobId: Number(job.id),
    indicatorId: Number(indicator.id),
  };
}

/** Undo 063 inside the open transaction, so its backfill has pre-063 rows to work on. */
async function rewindTo062(): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schedule_notes' AND column_name = 'job_id'`,
  );
  if (rows.length === 0) return;
  await db.query(`
    ALTER TABLE public.schedule_notes
      DROP CONSTRAINT schedule_notes_segment_unique,
      DROP CONSTRAINT schedule_notes_segment_key_check;
    DELETE FROM public.schedule_notes a
      USING public.schedule_notes b
     WHERE a.id > b.id
       AND a.emp_id = b.emp_id AND a.date = b.date
       AND a.indicator_type_id = b.indicator_type_id
       AND a.focus_area_id IS NOT DISTINCT FROM b.focus_area_id;
    -- 063's trigger names the columns, so it goes first; 015 below recreates it.
    DROP TRIGGER trigger_schedule_notes_require_shift ON public.schedule_notes;
    ALTER TABLE public.schedule_notes DROP COLUMN shift_id, DROP COLUMN job_id;
    ALTER TABLE public.schedule_notes
      ADD CONSTRAINT schedule_notes_emp_id_date_indicator_type_id_focus_area_id_key
      UNIQUE (emp_id, date, indicator_type_id, focus_area_id);
  `);
  await db.query(readFileSync(migrationPath("015_schedule_notes_require_shift.sql"), "utf8"));
}

/** A cell whose draft works the Day and the Evening shift in one focus area. */
async function seedDoubleShift(): Promise<void> {
  await db.query(`DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`, [
    fx.empId,
    DATE,
  ]);
  const { rows: cell } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (emp_id, date, org_id, focus_area_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [fx.empId, DATE, fx.orgId, fx.focusAreaId],
  );
  const { rows: snapshot } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
     VALUES ($1, $2, 'draft', 'worked') RETURNING id`,
    [cell[0].id, fx.orgId],
  );
  await db.query(
    `INSERT INTO public.schedule_cell_segments (snapshot_id, org_id, position, shift_id, job_id)
     VALUES ($1, $2, 0, $3, $5), ($1, $2, 1, $4, $5)`,
    [snapshot[0].id, fx.orgId, fx.dayShiftId, fx.eveningShiftId, fx.jobId],
  );
}

async function addNote(focusAreaId: number, segment?: { shiftId: number; jobId: number }) {
  const columns = segment ? ", shift_id, job_id" : "";
  const values = segment ? ", $6, $7" : "";
  await db.query(
    `INSERT INTO public.schedule_notes
       (org_id, emp_id, date, indicator_type_id, focus_area_id, status${columns})
     VALUES ($1, $2, $3, $4, $5, 'draft'${values})`,
    [
      fx.orgId,
      fx.empId,
      DATE,
      fx.indicatorId,
      focusAreaId,
      ...(segment ? [segment.shiftId, segment.jobId] : []),
    ],
  );
}

async function notesOnCell() {
  const { rows } = await db.query<{
    focus_area_id: string;
    shift_id: string | null;
    job_id: string | null;
  }>(
    `SELECT focus_area_id, shift_id, job_id FROM public.schedule_notes
      WHERE emp_id = $1 AND date = $2 ORDER BY focus_area_id, shift_id NULLS LAST`,
    [fx.empId, DATE],
  );
  return rows.map((row) => ({
    focusAreaId: Number(row.focus_area_id),
    shiftId: row.shift_id == null ? null : Number(row.shift_id),
    jobId: row.job_id == null ? null : Number(row.job_id),
  }));
}

async function sqlState(run: () => Promise<unknown>): Promise<string | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await run();
    await db.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe.skipIf(!reachable)("063 schedule notes per shift", () => {
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
    // Taken before anything else: the rewind alters the table, and acquiring
    // that lock after touching other rows deadlocked against the parallel
    // integration suites.
    await db.query("LOCK TABLE public.schedule_notes IN ACCESS EXCLUSIVE MODE");
    await rewindTo062();
    await seedDoubleShift();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  const runMigration = () =>
    db.query(readFileSync(migrationPath("063_schedule_notes_per_shift.sql"), "utf8"));

  it("gives a note shared by a double shift to each of its shifts", async () => {
    await addNote(fx.focusAreaId);
    await addNote(fx.otherFocusAreaId);

    await runMigration();

    expect(await notesOnCell()).toEqual([
      { focusAreaId: fx.focusAreaId, shiftId: fx.dayShiftId, jobId: fx.jobId },
      { focusAreaId: fx.focusAreaId, shiftId: fx.eveningShiftId, jobId: fx.jobId },
      // No shift works that area, so the note stays unattached, as before.
      { focusAreaId: fx.otherFocusAreaId, shiftId: null, jobId: null },
    ]);
  });

  it("keeps one shift's note apart from the other's and refuses a duplicate", async () => {
    await runMigration();
    const day = { shiftId: fx.dayShiftId, jobId: fx.jobId };

    await addNote(fx.focusAreaId, day);
    expect(await notesOnCell()).toEqual([{ focusAreaId: fx.focusAreaId, ...day }]);

    expect(await sqlState(() => addNote(fx.focusAreaId, day))).toBe("23505");
    expect(await sqlState(() => addNote(fx.focusAreaId))).toBeNull();
    expect(await sqlState(() => addNote(fx.focusAreaId))).toBe("23505");
  });

  it("lets the route's upsert target the new key, unattached notes included", async () => {
    await runMigration();
    const upsert = (shiftId: number | null, jobId: number | null, status: string) =>
      db.query(
        `INSERT INTO public.schedule_notes
           (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id)
         DO UPDATE SET status = EXCLUDED.status`,
        [fx.orgId, fx.empId, DATE, fx.indicatorId, fx.focusAreaId, shiftId, jobId, status],
      );

    await upsert(null, null, "draft");
    await upsert(null, null, "published");
    await upsert(fx.eveningShiftId, fx.jobId, "draft");
    await upsert(fx.eveningShiftId, fx.jobId, "published");

    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM public.schedule_notes WHERE emp_id = $1 AND date = $2`,
      [fx.empId, DATE],
    );
    expect(rows.map((row) => row.status)).toEqual(["published", "published"]);
  });

  it("refuses a note for a shift the cell does not have", async () => {
    await runMigration();

    const code = await sqlState(() =>
      addNote(fx.focusAreaId, { shiftId: fx.outsideShiftId, jobId: fx.jobId }),
    );

    expect(code).toBe("23514");
  });
});
