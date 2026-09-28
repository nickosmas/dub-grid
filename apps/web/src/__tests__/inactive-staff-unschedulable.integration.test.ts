// @vitest-environment node

/**
 * Migration 067: nothing can schedule an inactive or removed employee, while
 * clearing and archiving their leftovers still works. Each case runs 067 from
 * its file inside BEGIN/ROLLBACK against the seeded local database.
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

// A date no other integration test seeds, so no two suites contend for one cell.
const DATE = "2032-03-16";
const REFUSED = /Employee not found, archived, or inactive/;

interface Fixture {
  orgId: string;
  activeEmpId: string;
  leaverEmpId: string;
  shiftId: number;
  jobId: number;
  absenceTypeId: number;
  focusAreaId: number;
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
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.employees
      WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL AND $2 = ANY(focus_area_ids)
      ORDER BY seniority LIMIT 2`,
    [orgId, shift.fa],
  );
  if (rows.length < 2) throw new Error("Need two active employees. Run npm run db:reset");
  const absence = await one<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  return {
    orgId,
    activeEmpId: rows[0].id,
    leaverEmpId: rows[1].id,
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    absenceTypeId: Number(absence.id),
    focusAreaId: Number(shift.fa),
  };
}

async function newCell(empId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, empId, DATE],
  );
  return rows[0].id;
}

async function writeSnapshot(cellId: string, kind: "draft" | "published", state: string) {
  const worked = state === "worked";
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, $4, $5, NULL, NULL,
       $6::bigint[], $7::bigint[])`,
    [
      cellId,
      fx.orgId,
      kind,
      state,
      state === "absence" ? fx.absenceTypeId : null,
      worked ? [fx.shiftId] : [],
      worked ? [fx.jobId] : [],
    ],
  );
}

async function setStatus(empId: string, status: "inactive" | "removed") {
  await db.query(
    `UPDATE public.employees
        SET status = $2::public.employee_status,
            archived_at = CASE WHEN $2 = 'removed' THEN now() ELSE archived_at END
      WHERE id = $1`,
    [empId, status],
  );
}

/** Runs `sql` in a savepoint and returns the error it raised, if any. */
async function attempt(sql: string, params: unknown[] = []): Promise<Error | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    return error as Error;
  }
}

describe.skipIf(!reachable)("067 inactive staff are unschedulable", () => {
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
    await db.query(readFileSync(migrationPath("067_inactive_staff_unschedulable.sql"), "utf8"));
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("still schedules an active employee", async () => {
    const cellId = await newCell(fx.activeEmpId);
    await writeSnapshot(cellId, "draft", "worked");
    const { rows } = await db.query(
      `SELECT state_kind FROM public.schedule_cell_snapshots WHERE cell_id = $1`,
      [cellId],
    );
    expect(rows).toEqual([{ state_kind: "worked" }]);
  });

  it.each(["inactive", "removed"] as const)(
    "refuses a worked or absence snapshot for a %s employee, by the sync or directly",
    async (status) => {
      await setStatus(fx.leaverEmpId, status);
      const cellId = await newCell(fx.leaverEmpId);

      const viaSync = await attempt(
        `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
           $3::bigint[], $4::bigint[])`,
        [cellId, fx.orgId, [fx.shiftId], [fx.jobId]],
      );
      expect(viaSync?.message).toMatch(REFUSED);

      const direct = await attempt(
        `INSERT INTO public.schedule_cell_snapshots
           (cell_id, org_id, snapshot_kind, state_kind, absence_type_id)
         VALUES ($1, $2, 'published', 'absence', $3)`,
        [cellId, fx.orgId, fx.absenceTypeId],
      );
      expect(direct?.message).toMatch(REFUSED);
    },
  );

  it("refuses turning an inactive employee's existing snapshot back into a shift", async () => {
    const cellId = await newCell(fx.leaverEmpId);
    await writeSnapshot(cellId, "published", "worked");
    await writeSnapshot(cellId, "draft", "deleted");
    await setStatus(fx.leaverEmpId, "inactive");

    const error = await attempt(
      `UPDATE public.schedule_cell_snapshots SET state_kind = 'worked'
        WHERE cell_id = $1 AND snapshot_kind = 'draft'`,
      [cellId],
    );
    expect(error?.message).toMatch(REFUSED);

    const segment = await attempt(
      `INSERT INTO public.schedule_cell_segments (snapshot_id, org_id, position, shift_id, job_id)
       SELECT id, org_id, 5, $2, $3 FROM public.schedule_cell_snapshots
        WHERE cell_id = $1 AND snapshot_kind = 'published'`,
      [cellId, fx.shiftId, fx.jobId],
    );
    expect(segment?.message).toMatch(REFUSED);
  });

  it("still lets an inactive employee's leftovers be cleared", async () => {
    const cellId = await newCell(fx.leaverEmpId);
    await writeSnapshot(cellId, "published", "worked");
    await setStatus(fx.leaverEmpId, "inactive");

    expect(
      await attempt(
        `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'deleted', NULL, NULL, NULL,
         '{}'::bigint[], '{}'::bigint[])`,
        [cellId, fx.orgId],
      ),
    ).toBeNull();
    expect(await attempt(`DELETE FROM public.schedule_cells WHERE id = $1`, [cellId])).toBeNull();
  });

  it("refuses a live recurring template or series for an inactive employee, or reviving an archived one", async () => {
    const {
      rows: [template],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.recurring_shifts (emp_id, org_id, day_of_week, state, archived_at)
       VALUES ($1, $2, 1, '{}'::jsonb, now()) RETURNING id`,
      [fx.leaverEmpId, fx.orgId],
    );
    const {
      rows: [series],
    } = await db.query<{ id: string }>(
      `INSERT INTO public.shift_series (emp_id, org_id, state, frequency, start_date, archived_at)
       VALUES ($1, $2, '{}'::jsonb, 'weekly', $3, now()) RETURNING id`,
      [fx.leaverEmpId, fx.orgId, DATE],
    );
    await setStatus(fx.leaverEmpId, "inactive");

    expect(
      (
        await attempt(
          `INSERT INTO public.recurring_shifts (emp_id, org_id, day_of_week, state)
       VALUES ($1, $2, 2, '{}'::jsonb)`,
          [fx.leaverEmpId, fx.orgId],
        )
      )?.message,
    ).toMatch(REFUSED);
    expect(
      (
        await attempt(
          `INSERT INTO public.shift_series (emp_id, org_id, state, frequency, start_date)
       VALUES ($1, $2, '{}'::jsonb, 'daily', $3)`,
          [fx.leaverEmpId, fx.orgId, DATE],
        )
      )?.message,
    ).toMatch(REFUSED);
    expect(
      (
        await attempt(`UPDATE public.recurring_shifts SET archived_at = NULL WHERE id = $1`, [
          template.id,
        ])
      )?.message,
    ).toMatch(REFUSED);
    expect(
      (
        await attempt(`UPDATE public.shift_series SET archived_at = NULL WHERE id = $1`, [
          series.id,
        ])
      )?.message,
    ).toMatch(REFUSED);

    expect(
      await attempt(`UPDATE public.shift_series SET end_date = start_date + 7 WHERE id = $1`, [
        series.id,
      ]),
    ).toBeNull();
  });

  it("refuses a new request from an inactive requester, but still updates an existing one", async () => {
    const insertPickup = `INSERT INTO public.shift_requests
        (org_id, type, requester_emp_id, requester_shift_date, requester_state)
      VALUES ($1, 'pickup', $2, $3, '{}'::jsonb) RETURNING id`;
    const {
      rows: [existing],
    } = await db.query<{ id: string }>(insertPickup, [fx.orgId, fx.leaverEmpId, DATE]);
    await setStatus(fx.leaverEmpId, "inactive");

    expect((await attempt(insertPickup, [fx.orgId, fx.leaverEmpId, DATE]))?.message).toMatch(
      REFUSED,
    );
    expect(
      await attempt(
        `UPDATE public.shift_requests SET admin_note = 'settled after they left' WHERE id = $1`,
        [existing.id],
      ),
    ).toBeNull();
  });
});

describe.skipIf(!reachable)("067 leaving clears the future and keeps the past", () => {
  const PAST_PUBLISHED = "2020-03-17";
  const PAST_DRAFT_ONLY = "2020-03-18";
  const PAST_EDITED = "2020-03-19";
  const FUTURE_DRAFT_ONLY = "2032-03-17";
  const FUTURE_PUBLISHED = "2032-03-18";

  let cells: Record<string, string>;

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
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  async function applyMigration() {
    await db.query(readFileSync(migrationPath("067_inactive_staff_unschedulable.sql"), "utf8"));
  }

  async function cellOn(date: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
      [fx.orgId, fx.leaverEmpId, date],
    );
    return rows[0].id;
  }

  /** Gives the leaver, while still active, one of everything leaving should touch. */
  async function seedLeaver() {
    cells = {};
    for (const date of [
      PAST_PUBLISHED,
      PAST_DRAFT_ONLY,
      PAST_EDITED,
      FUTURE_DRAFT_ONLY,
      FUTURE_PUBLISHED,
    ]) {
      cells[date] = await cellOn(date);
    }
    await writeSnapshot(cells[PAST_PUBLISHED], "published", "worked");
    await writeSnapshot(cells[PAST_DRAFT_ONLY], "draft", "worked");
    await writeSnapshot(cells[PAST_EDITED], "published", "worked");
    await writeSnapshot(cells[PAST_EDITED], "draft", "absence");
    await writeSnapshot(cells[FUTURE_DRAFT_ONLY], "draft", "worked");
    await writeSnapshot(cells[FUTURE_PUBLISHED], "published", "worked");
    await db.query(
      `INSERT INTO public.recurring_shifts (emp_id, org_id, day_of_week, state)
       VALUES ($1, $2, 1, '{}'::jsonb)`,
      [fx.leaverEmpId, fx.orgId],
    );
    await db.query(
      `INSERT INTO public.shift_series (emp_id, org_id, state, frequency, start_date)
       VALUES ($1, $2, '{}'::jsonb, 'weekly', $3)`,
      [fx.leaverEmpId, fx.orgId, FUTURE_DRAFT_ONLY],
    );
    await db.query(
      `INSERT INTO public.shift_requests (org_id, type, requester_emp_id, requester_shift_date, requester_state)
       VALUES ($1, 'pickup', $2, $3, '{}'::jsonb)`,
      [fx.orgId, fx.leaverEmpId, FUTURE_PUBLISHED],
    );
  }

  /** Each seeded date's remaining snapshots as `kind:state`, or null once the cell is gone. */
  async function leaverSchedule(): Promise<Record<string, string[] | null>> {
    const { rows } = await db.query<{ date: string; snapshots: string[] | null }>(
      `SELECT to_char(c.date, 'YYYY-MM-DD') AS date,
              array_agg(s.snapshot_kind || ':' || s.state_kind ORDER BY s.snapshot_kind)
                FILTER (WHERE s.id IS NOT NULL) AS snapshots
         FROM public.schedule_cells c
         LEFT JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
        WHERE c.emp_id = $1
        GROUP BY c.date`,
      [fx.leaverEmpId],
    );
    const byDate = new Map(rows.map((row) => [row.date, row.snapshots ?? []]));
    return Object.fromEntries(Object.keys(cells).map((date) => [date, byDate.get(date) ?? null]));
  }

  async function leaverLeftovers() {
    const { rows } = await db.query<{ templates: number; series: number; requests: number }>(
      `SELECT
         (SELECT count(*)::int FROM public.recurring_shifts WHERE emp_id = $1 AND archived_at IS NULL) AS templates,
         (SELECT count(*)::int FROM public.shift_series WHERE emp_id = $1 AND archived_at IS NULL) AS series,
         (SELECT count(*)::int FROM public.shift_requests
           WHERE requester_emp_id = $1 AND status IN ('open', 'pending_approval')) AS requests`,
      [fx.leaverEmpId],
    );
    return rows[0];
  }

  const CLEARED = {
    [PAST_PUBLISHED]: ["published:worked"],
    [PAST_DRAFT_ONLY]: null,
    [PAST_EDITED]: ["published:worked"],
    [FUTURE_DRAFT_ONLY]: null,
    [FUTURE_PUBLISHED]: ["draft:deleted", "published:worked"],
  };

  it.each(["inactive", "removed"] as const)(
    "clears the future and keeps the past when an employee becomes %s",
    async (status) => {
      await applyMigration();
      await seedLeaver();
      const {
        rows: [before],
      } = await db.query<{ version: string }>(
        `SELECT version FROM public.schedule_cells WHERE id = $1`,
        [cells[FUTURE_PUBLISHED]],
      );

      await setStatus(fx.leaverEmpId, status);

      expect(await leaverSchedule()).toEqual(CLEARED);
      expect(await leaverLeftovers()).toEqual({ templates: 0, series: 0, requests: 0 });
      const {
        rows: [after],
      } = await db.query<{ version: string }>(
        `SELECT version FROM public.schedule_cells WHERE id = $1`,
        [cells[FUTURE_PUBLISHED]],
      );
      expect(Number(after.version)).toBe(Number(before.version) + 1);
    },
  );

  it("credits the pending removals to the actor the status write names", async () => {
    await applyMigration();
    await seedLeaver();
    const {
      rows: [actor],
    } = await db.query<{ id: string }>(
      `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
    );

    await db.query(
      `UPDATE public.employees SET status = 'inactive', updated_by = $2 WHERE id = $1`,
      [fx.leaverEmpId, actor.id],
    );

    const { rows } = await db.query<{ updated_by: string | null }>(
      `SELECT updated_by FROM public.schedule_cells WHERE id = $1`,
      [cells[FUTURE_PUBLISHED]],
    );
    expect(rows[0].updated_by).toBe(actor.id);
  });

  it("takes the leaver's notes with their cleared shifts, as 064 does for any removed shift", async () => {
    await applyMigration();
    await seedLeaver();
    const {
      rows: [note],
    } = await db.query<{ id: number }>(
      `INSERT INTO public.indicator_types (org_id, name, color)
       VALUES ($1, '067 note', '#E24B4A') RETURNING id`,
      [fx.orgId],
    );
    for (const [date, status] of [
      [PAST_PUBLISHED, "published"],
      [FUTURE_DRAFT_ONLY, "draft"],
      [FUTURE_PUBLISHED, "published"],
    ]) {
      await db.query(
        `INSERT INTO public.schedule_notes
           (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [fx.orgId, fx.leaverEmpId, date, note.id, fx.focusAreaId, fx.shiftId, fx.jobId, status],
      );
    }
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");
    await db.query("SET CONSTRAINTS ALL DEFERRED");

    await setStatus(fx.leaverEmpId, "inactive");
    await db.query("SET CONSTRAINTS ALL IMMEDIATE");

    const { rows } = await db.query<{ date: string; status: string }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, status FROM public.schedule_notes
        WHERE emp_id = $1 AND indicator_type_id = $2 ORDER BY date`,
      [fx.leaverEmpId, note.id],
    );
    expect(rows).toEqual([
      { date: PAST_PUBLISHED, status: "published" },
      { date: FUTURE_PUBLISHED, status: "draft_deleted" },
    ]);
  });

  it("publishes the leaver's pending removal and nothing else of theirs", async () => {
    await applyMigration();
    await seedLeaver();
    await setStatus(fx.leaverEmpId, "inactive");
    const {
      rows: [actor],
    } = await db.query<{ id: string }>(
      `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
    );

    await db.query(`SELECT public.publish_schedule($1, $2, $3, $4)`, [
      fx.orgId,
      FUTURE_DRAFT_ONLY,
      FUTURE_PUBLISHED,
      actor.id,
    ]);

    expect((await leaverSchedule())[FUTURE_PUBLISHED]).toBeNull();
  });

  it("leaves an active employee's schedule alone", async () => {
    await applyMigration();
    await seedLeaver();
    await db.query(`UPDATE public.employees SET status_note = 'still here' WHERE id = $1`, [
      fx.leaverEmpId,
    ]);

    expect((await leaverSchedule())[FUTURE_DRAFT_ONLY]).toEqual(["draft:worked"]);
    expect(await leaverLeftovers()).toEqual({ templates: 1, series: 1, requests: 1 });
  });

  it("clears staff who had already left when the migration runs", async () => {
    await seedLeaver();
    await setStatus(fx.leaverEmpId, "inactive");

    await applyMigration();

    expect(await leaverSchedule()).toEqual(CLEARED);
    expect(await leaverLeftovers()).toEqual({ templates: 0, series: 0, requests: 0 });
  });
});
