// @vitest-environment node

/**
 * Migration 100: someone Away with a return date and an absence holds that
 * absence on every day from today up to the return date, in the draft, and
 * the days are rewritten when the date, the absence or the status changes.
 * Each case runs 100 from its file inside BEGIN/ROLLBACK against the seeded
 * local database, on a person created inside the transaction so no other
 * suite's cells are touched.
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

const REFUSED = /Employee not found, archived, or inactive/;
const MIGRATION = readFileSync(migrationPath("100_away_absence.sql"), "utf8");

interface Fixture {
  orgId: string;
  shiftId: number;
  jobId: number;
  focusAreaId: number;
  vacationId: number;
  sickId: number;
  today: string;
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
  const [vacation, sick] = (
    await db.query<{ id: number }>(
      `SELECT id FROM public.absence_types
        WHERE org_id = $1 AND archived_at IS NULL ORDER BY id OFFSET 1 LIMIT 2`,
      [orgId],
    )
  ).rows;
  return {
    orgId,
    today,
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    focusAreaId: Number(shift.fa),
    vacationId: Number(vacation.id),
    sickId: Number(sick.id),
  };
}

function day(offset: number): string {
  const date = new Date(`${fx.today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createPerson(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.employees
       (org_id, employee_number, first_name, last_name, seniority, focus_area_ids)
     VALUES ($1,
       (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
       'Away', 'Fixture', 9999, ARRAY[$2]::bigint[])
     RETURNING id`,
    [fx.orgId, fx.focusAreaId],
  );
  return rows[0].id;
}

async function cellOn(date: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, empId, date],
  );
  return rows[0].id;
}

async function writeWorked(cellId: string, kind: "draft" | "published") {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [cellId, fx.orgId, kind, [fx.shiftId], [fx.jobId]],
  );
}

async function writeAbsence(cellId: string, kind: "draft" | "published", absenceTypeId: number) {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'absence', $4, NULL, NULL,
       '{}'::bigint[], '{}'::bigint[])`,
    [cellId, fx.orgId, kind, absenceTypeId],
  );
}

async function setAway(awayUntil: string | null, absenceTypeId: number | null) {
  await db.query(
    `UPDATE public.employees
        SET status = 'inactive', away_until = $2, away_absence_type_id = $3
      WHERE id = $1`,
    [empId, awayUntil, absenceTypeId],
  );
}

type DayState = { draft: string | null; published: string | null } | null;

/** Each day's draft and published state, as "kind" or "absence:<type>". */
async function days(from: number, to: number): Promise<DayState[]> {
  const { rows } = await db.query<{ date: string; kind: string; state: string }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date, s.snapshot_kind AS kind,
            CASE WHEN s.state_kind = 'absence' THEN 'absence:' || s.absence_type_id
                 ELSE s.state_kind END AS state
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.emp_id = $1`,
    [empId],
  );
  const cells = new Set(
    (
      await db.query<{ date: string }>(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public.schedule_cells WHERE emp_id = $1`,
        [empId],
      )
    ).rows.map((row) => row.date),
  );
  const result: DayState[] = [];
  for (let offset = from; offset <= to; offset++) {
    const date = day(offset);
    if (!cells.has(date)) {
      result.push(null);
      continue;
    }
    const of = (kind: string) =>
      rows.find((row) => row.date === date && row.kind === kind)?.state ?? null;
    result.push({ draft: of("draft"), published: of("published") });
  }
  return result;
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

describe.skipIf(!reachable)("100 an absence while away", () => {
  const vacation = () => `absence:${fx.vacationId}`;

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
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("fills every day from today to the return date over shifts, and nothing else", async () => {
    await writeWorked(await cellOn(day(-1)), "published");
    await writeWorked(await cellOn(day(0)), "published");
    await writeWorked(await cellOn(day(1)), "draft");
    await writeWorked(await cellOn(day(3)), "published");

    await setAway(day(3), fx.vacationId);

    expect(await days(-1, 3)).toEqual([
      { draft: null, published: "worked" },
      { draft: vacation(), published: "worked" },
      { draft: vacation(), published: null },
      { draft: vacation(), published: null },
      { draft: null, published: "worked" },
    ]);
  });

  it("refuses anything else on an away day, and accepts the away absence", async () => {
    await setAway(day(3), fx.vacationId);
    const cellId = (
      await db.query<{ id: string }>(
        `SELECT id FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`,
        [empId, day(1)],
      )
    ).rows[0].id;

    const worked = await attempt(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
         $3::bigint[], $4::bigint[])`,
      [cellId, fx.orgId, [fx.shiftId], [fx.jobId]],
    );
    expect(worked?.message).toMatch(REFUSED);

    const sick = await attempt(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'absence', $3, NULL, NULL,
         '{}'::bigint[], '{}'::bigint[])`,
      [cellId, fx.orgId, fx.sickId],
    );
    expect(sick?.message).toMatch(REFUSED);

    const published = await attempt(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, 'published', 'absence', $3, NULL, NULL,
         '{}'::bigint[], '{}'::bigint[])`,
      [cellId, fx.orgId, fx.vacationId],
    );
    expect(published).toBeNull();
  });

  it("keeps a day already published as that absence free of drafts", async () => {
    await writeAbsence(await cellOn(day(1)), "published", fx.vacationId);

    await setAway(day(2), fx.vacationId);
    await setAway(day(2), fx.vacationId);

    expect(await days(0, 1)).toEqual([
      { draft: vacation(), published: null },
      { draft: null, published: vacation() },
    ]);
  });

  it("puts the days back when the return date moves earlier, and fills new ones when it moves later", async () => {
    await writeWorked(await cellOn(day(2)), "published");
    await setAway(day(4), fx.vacationId);

    await setAway(day(2), fx.vacationId);
    expect(await days(0, 3)).toEqual([
      { draft: vacation(), published: null },
      { draft: vacation(), published: null },
      { draft: null, published: "worked" },
      null,
    ]);

    await setAway(day(5), fx.vacationId);
    expect(await days(2, 5)).toEqual([
      { draft: vacation(), published: "worked" },
      { draft: vacation(), published: null },
      { draft: vacation(), published: null },
      null,
    ]);
  });

  it("swaps the absence when it changes, and empties the days when it is cleared", async () => {
    await writeWorked(await cellOn(day(1)), "published");
    await setAway(day(2), fx.vacationId);

    await setAway(day(2), fx.sickId);
    expect(await days(0, 1)).toEqual([
      { draft: `absence:${fx.sickId}`, published: null },
      { draft: `absence:${fx.sickId}`, published: "worked" },
    ]);

    await setAway(day(2), null);
    expect(await days(0, 1)).toEqual([null, { draft: "deleted", published: "worked" }]);
  });

  it("restores what was published when they are marked active early", async () => {
    await writeWorked(await cellOn(day(1)), "published");
    await writeAbsence(await cellOn(day(2)), "published", fx.vacationId);
    await setAway(day(3), fx.vacationId);

    await db.query(`UPDATE public.employees SET status = 'active' WHERE id = $1`, [empId]);

    expect(await days(0, 2)).toEqual([
      null,
      { draft: null, published: "worked" },
      { draft: "deleted", published: vacation() },
    ]);
  });

  it("clears every day ahead when they are archived", async () => {
    await writeWorked(await cellOn(day(4)), "published");
    await setAway(day(3), fx.vacationId);

    await db.query(
      `UPDATE public.employees SET status = 'removed', archived_at = now() WHERE id = $1`,
      [empId],
    );

    expect(await days(0, 4)).toEqual([
      null,
      null,
      null,
      null,
      { draft: "deleted", published: "worked" },
    ]);
  });

  it("refuses an absence without a return date or from another organization", async () => {
    await db.query(`UPDATE public.employees SET status = 'inactive' WHERE id = $1`, [empId]);

    const withoutDate = await attempt(
      `UPDATE public.employees SET away_absence_type_id = $2 WHERE id = $1`,
      [empId, fx.vacationId],
    );
    expect(withoutDate).toBeNull();
    const { rows } = await db.query<{ type: number | null }>(
      `SELECT away_absence_type_id AS type FROM public.employees WHERE id = $1`,
      [empId],
    );
    expect(rows[0].type).toBeNull();

    const foreign = await one<{ id: number }>(
      `SELECT id FROM public.absence_types WHERE org_id <> $1 AND archived_at IS NULL LIMIT 1`,
      [fx.orgId],
    );
    const crossOrg = await attempt(
      `UPDATE public.employees SET away_until = $2, away_absence_type_id = $3 WHERE id = $1`,
      [empId, day(2), foreign.id],
    );
    expect(crossOrg?.message).toMatch(/Absence type not found in this organization/);
  });
});
