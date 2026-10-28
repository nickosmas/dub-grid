// @vitest-environment node

/**
 * Migration 107: losing a focus area (51i). upcoming_focus_area_shifts counts
 * the days from today a person works in the given focus areas, as the
 * schedule stands now, and clear_focus_area_shifts clears exactly those days
 * in the draft and closes the requests on them. Each case runs 107 from its
 * file inside BEGIN/ROLLBACK against the seeded local database, on a person
 * created inside the transaction so no other suite's cells are touched.
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

const MIGRATION = readFileSync(migrationPath("107_focus_area_shifts.sql"), "utf8");

interface Area {
  focusAreaId: number;
  shiftId: number;
  jobId: number;
}

interface Fixture {
  orgId: string;
  today: string;
  east: Area;
  west: Area;
  sickId: number;
}

let db: Client;
let fx: Fixture;
let empId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function loadFixture(): Promise<Fixture> {
  const { id: orgId, today } = await one<{ id: string; today: string }>(
    `SELECT id, to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const { rows } = await db.query<{ fa: number; shift: number; job: number }>(
    `SELECT DISTINCT ON (sc.focus_area_id) sc.focus_area_id AS fa, sc.id AS shift, j.id AS job
       FROM public.shift_categories sc
       JOIN public.jobs j
         ON j.org_id = sc.org_id AND j.archived_at IS NULL
        AND j.assignment_mode = 'with_shift' AND sc.id = ANY (j.applicable_shift_ids)
      WHERE sc.org_id = $1 AND sc.archived_at IS NULL AND sc.focus_area_id IS NOT NULL
      ORDER BY sc.focus_area_id, sc.id, j.id
      LIMIT 2`,
    [orgId],
  );
  if (rows.length < 2) throw new Error("Calm Haven needs shifts in two focus areas");
  const area = (row: { fa: number; shift: number; job: number }): Area => ({
    focusAreaId: Number(row.fa),
    shiftId: Number(row.shift),
    jobId: Number(row.job),
  });
  const sick = await one<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY id LIMIT 1`,
    [orgId],
  );
  return { orgId, today, east: area(rows[0]), west: area(rows[1]), sickId: Number(sick.id) };
}

function day(offset: number): string {
  const date = new Date(`${fx.today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createPerson(focusAreaIds: number[], lastName = "Fixture"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.employees
       (org_id, employee_number, first_name, last_name, seniority, focus_area_ids)
     VALUES ($1,
       (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
       'Moving', $3, 9999, $2::bigint[])
     RETURNING id`,
    [fx.orgId, focusAreaIds, lastName],
  );
  return rows[0].id;
}

async function cellOn(offset: number, focusAreaId: number | null = null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date, focus_area_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [fx.orgId, empId, day(offset), focusAreaId],
  );
  return rows[0].id;
}

async function worked(cellId: string, kind: "draft" | "published", area: Area) {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [cellId, fx.orgId, kind, [area.shiftId], [area.jobId]],
  );
}

async function absence(cellId: string, kind: "draft" | "published") {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'absence', $4, NULL, NULL,
       '{}'::bigint[], '{}'::bigint[])`,
    [cellId, fx.orgId, kind, fx.sickId],
  );
}

async function upcoming(focusAreaIds: number[]) {
  const { rows } = await db.query<{
    focus_area_id: string;
    shift_count: number;
    first_date: string;
    last_date: string;
  }>(
    `SELECT focus_area_id, shift_count, to_char(first_date, 'YYYY-MM-DD') AS first_date,
            to_char(last_date, 'YYYY-MM-DD') AS last_date
       FROM public.upcoming_focus_area_shifts($1, $2::bigint[])`,
    [empId, focusAreaIds],
  );
  return rows.map((row) => ({ ...row, focus_area_id: Number(row.focus_area_id) }));
}

async function clear(focusAreaIds: number[]): Promise<number> {
  const { rows } = await db.query<{ cleared: number }>(
    `SELECT public.clear_focus_area_shifts($1, $2::bigint[], NULL) AS cleared`,
    [empId, focusAreaIds],
  );
  return rows[0].cleared;
}

/** The day's draft and published state, or null when the day has no cell. */
async function stateOn(offset: number) {
  const { rows } = await db.query<{ kind: string; state: string }>(
    `SELECT s.snapshot_kind AS kind, s.state_kind AS state
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.emp_id = $1 AND c.date = $2`,
    [empId, day(offset)],
  );
  const { rows: cells } = await db.query(
    `SELECT 1 FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`,
    [empId, day(offset)],
  );
  if (cells.length === 0) return null;
  const of = (kind: string) => rows.find((row) => row.kind === kind)?.state ?? null;
  return { draft: of("draft"), published: of("published") };
}

describe.skipIf(!reachable)("107 focus area shifts", () => {
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
    await db.query(MIGRATION);
    empId = await createPerson([fx.east.focusAreaId, fx.west.focusAreaId]);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("counts the days from today worked in each focus area, as the schedule stands now", async () => {
    await worked(await cellOn(-1), "published", fx.east);
    await worked(await cellOn(0), "published", fx.east);
    await worked(await cellOn(4), "draft", fx.east);
    await worked(await cellOn(2), "published", fx.west);
    await absence(await cellOn(3), "published");
    const movedAway = await cellOn(5);
    await worked(movedAway, "published", fx.east);
    await worked(movedAway, "draft", fx.west);
    const removed = await cellOn(6);
    await worked(removed, "published", fx.east);
    await db.query(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'deleted', NULL, NULL, NULL,
         '{}'::bigint[], '{}'::bigint[])`,
      [removed, fx.orgId],
    );

    expect(await upcoming([fx.east.focusAreaId])).toEqual([
      { focus_area_id: fx.east.focusAreaId, shift_count: 2, first_date: day(0), last_date: day(4) },
    ]);
    expect(await upcoming([fx.east.focusAreaId, fx.west.focusAreaId])).toHaveLength(2);
    expect(await upcoming([])).toEqual([]);
  });

  it("reads a day whose shift has no focus area by the day's own", async () => {
    const shared = await one<{ id: number }>(
      `INSERT INTO public.shift_categories (org_id, name, focus_area_id)
       VALUES ($1, 'Shared fixture shift', NULL) RETURNING id`,
      [fx.orgId],
    );
    const sharedShift = { ...fx.east, shiftId: Number(shared.id) };
    await worked(await cellOn(1, fx.east.focusAreaId), "published", sharedShift);
    await worked(await cellOn(2, fx.west.focusAreaId), "published", sharedShift);
    await worked(await cellOn(3), "published", sharedShift);

    expect(await upcoming([fx.east.focusAreaId])).toEqual([
      { focus_area_id: fx.east.focusAreaId, shift_count: 1, first_date: day(1), last_date: day(1) },
    ]);
    expect(await clear([fx.east.focusAreaId])).toBe(1);
    expect(await stateOn(1)).toEqual({ draft: "deleted", published: "worked" });
    expect(await stateOn(2)).toEqual({ draft: null, published: "worked" });
  });

  it("clears exactly the counted days, each the way the draft clears a day", async () => {
    await worked(await cellOn(-1), "published", fx.east);
    await worked(await cellOn(0), "published", fx.east);
    await worked(await cellOn(1), "draft", fx.east);
    const overAbsence = await cellOn(2);
    await absence(overAbsence, "published");
    await worked(overAbsence, "draft", fx.east);
    const overWest = await cellOn(3);
    await worked(overWest, "published", fx.west);
    await worked(overWest, "draft", fx.east);
    await worked(await cellOn(4), "published", fx.west);
    await absence(await cellOn(5), "published");
    const movedAway = await cellOn(6);
    await worked(movedAway, "published", fx.east);
    await worked(movedAway, "draft", fx.west);

    const counted = (await upcoming([fx.east.focusAreaId]))[0]?.shift_count;
    expect(await clear([fx.east.focusAreaId])).toBe(counted);
    expect(counted).toBe(4);

    expect(await stateOn(-1)).toEqual({ draft: null, published: "worked" });
    expect(await stateOn(0)).toEqual({ draft: "deleted", published: "worked" });
    expect(await stateOn(1)).toBeNull();
    expect(await stateOn(2)).toEqual({ draft: null, published: "absence" });
    expect(await stateOn(3)).toEqual({ draft: null, published: "worked" });
    expect(await stateOn(4)).toEqual({ draft: null, published: "worked" });
    expect(await stateOn(5)).toEqual({ draft: null, published: "absence" });
    expect(await stateOn(6)).toEqual({ draft: "worked", published: "worked" });
    expect(await upcoming([fx.east.focusAreaId])).toEqual([]);
    expect(await clear([fx.east.focusAreaId])).toBe(0);
  });

  it("closes the requests on cleared days only", async () => {
    await worked(await cellOn(1), "published", fx.east);
    await worked(await cellOn(2), "published", fx.west);
    const other = await createPerson([fx.east.focusAreaId], "Partner");
    const request = async (sql: string, params: unknown[]) =>
      (await db.query<{ id: string }>(sql, params)).rows[0].id;
    const callOff = (date: string) =>
      request(
        `INSERT INTO public.shift_requests
           (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
            absence_type_id)
         VALUES ($1, 'calloff', 'open', $2, $3, '{}'::jsonb, $4) RETURNING id`,
        [fx.orgId, empId, date, fx.sickId],
      );
    const clearedCallOff = await callOff(day(1));
    const keptCallOff = await callOff(day(2));
    // A swap's insert trigger checks both schedule states against real cells,
    // which this test has no use for; skip triggers for that one write.
    await db.query("SET LOCAL session_replication_role = replica");
    const swapIntoCleared = await request(
      `INSERT INTO public.shift_requests
         (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
          target_emp_id, target_shift_date, target_state)
       VALUES ($1, 'swap', 'pending_approval', $2, $3, '{}'::jsonb, $4, $5, '{}'::jsonb)
       RETURNING id`,
      [fx.orgId, other, day(4), empId, day(1)],
    );
    await db.query("SET LOCAL session_replication_role = origin");

    await clear([fx.east.focusAreaId]);

    const status = async (id: string) =>
      (
        await one<{ status: string }>(`SELECT status FROM public.shift_requests WHERE id = $1`, [
          id,
        ])
      ).status;
    expect(await status(clearedCallOff)).toBe("expired");
    expect(await status(keptCallOff)).toBe("open");
    expect(await status(swapIntoCleared)).toBe("expired");
  });

  it("is the service role's alone", async () => {
    const { rows } = await db.query<{ granted: boolean }>(
      `SELECT has_function_privilege('authenticated',
         'public.clear_focus_area_shifts(uuid, bigint[], uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated',
         'public.upcoming_focus_area_shifts(uuid, bigint[])', 'EXECUTE') AS granted`,
    );
    expect(rows[0].granted).toBe(false);
  });
});
