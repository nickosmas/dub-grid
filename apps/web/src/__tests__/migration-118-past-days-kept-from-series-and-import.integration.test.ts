// @vitest-environment node

/**
 * Migration 118: removing or editing a repeating shift, and importing the
 * previous period, leave days before the organization's today as they are.
 * Each case runs 118 from its file inside BEGIN/ROLLBACK against the seeded
 * local database, as a Super Admin the way PostgREST calls it.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";
import { asSuperuser, asUser, type Member } from "./helpers/request-fixture";

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

const MIGRATION = readFileSync(
  migrationPath("118_past_days_kept_from_series_and_import.sql"),
  "utf8",
);

interface Fixture {
  orgId: string;
  superAdmin: Member;
  shiftId: number;
  jobId: number;
  focusAreaId: number;
  absenceTypeId: number;
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
  const superAdmin = await one<{ userId: string; empId: string }>(
    `SELECT u.id AS "userId", e.id AS "empId"
       FROM auth.users u
       JOIN public.employees e ON e.user_id = u.id AND e.org_id = $1
      WHERE u.email = 'qa-super-admin@dubgrid.test'`,
    [orgId],
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
        AND (cardinality(applicable_shift_ids) = 0 OR $2 = ANY(applicable_shift_ids))
        -- Anyone in the shift's focus area qualifies, so the import isn't refused.
        AND cardinality(eligible_role_ids) = 0 AND cardinality(required_certification_ids) = 0
        AND cardinality(department_ids) = 0
        AND (cardinality(focus_area_ids) = 0 OR $3 = ANY(focus_area_ids))
      ORDER BY id LIMIT 1`,
    [orgId, shift.id, shift.fa],
  );
  const absence = await one<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  return {
    orgId,
    today,
    superAdmin: { ...superAdmin, orgRole: "super_admin" },
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    focusAreaId: Number(shift.fa),
    absenceTypeId: Number(absence.id),
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
       'Series', 'Fixture', 9999, ARRAY[$2]::bigint[])
     RETURNING id`,
    [fx.orgId, fx.focusAreaId],
  );
  return rows[0].id;
}

async function writeWorked(date: string, seriesId: string | null = null) {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, 'published', 'worked', ARRAY[$4::bigint], ARRAY[$5::bigint],
       NULL, NULL, NULL, $6::uuid, FALSE, $7::bigint, NULL, $8, ARRAY[false])`,
    [fx.orgId, empId, date, fx.shiftId, fx.jobId, seriesId, fx.focusAreaId, fx.superAdmin.userId],
  );
}

/** A daily series from `from` to `to` (offsets from today), every day published. */
async function series(from: number, to: number): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.shift_series (org_id, emp_id, state, frequency, start_date, end_date)
     VALUES ($1, $2,
       public.build_schedule_cell_state_json('worked', ARRAY[$3]::bigint[], ARRAY[$4]::bigint[]),
       'daily', $5, $6)
     RETURNING id`,
    [fx.orgId, empId, fx.shiftId, fx.jobId, day(from), day(to)],
  );
  for (let offset = from; offset <= to; offset++) await writeWorked(day(offset), rows[0].id);
  return rows[0].id;
}

type DayState = { draft: string | null; published: string | null } | null;

async function days(from: number, to: number): Promise<DayState[]> {
  const { rows } = await db.query<{ date: string; kind: string | null; state: string | null }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date, s.snapshot_kind AS kind, s.state_kind AS state
       FROM public.schedule_cells c
       LEFT JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.emp_id = $1`,
    [empId],
  );
  const result: DayState[] = [];
  for (let offset = from; offset <= to; offset++) {
    const date = day(offset);
    const of = (kind: string) =>
      rows.find((row) => row.date === date && row.kind === kind)?.state ?? null;
    result.push(
      rows.some((row) => row.date === date)
        ? { draft: of("draft"), published: of("published") }
        : null,
    );
  }
  return result;
}

async function asSuperAdmin<T>(run: () => Promise<T>): Promise<T> {
  await asUser(db, fx.superAdmin, fx.orgId);
  try {
    return await run();
  } finally {
    await asSuperuser(db);
  }
}

async function removeSeries(seriesId: string, from: string | null, to: string | null) {
  return asSuperAdmin(async () => {
    const { rows } = await db.query<{ count: number }>(
      `SELECT public.delete_shift_series($1, $2, $3::date, $4::date) AS count`,
      [seriesId, fx.orgId, from, to],
    );
    return Number(rows[0].count);
  });
}

async function seriesRow(seriesId: string) {
  return one<{ end_date: string | null; archived: boolean }>(
    `SELECT to_char(end_date, 'YYYY-MM-DD') AS end_date, archived_at IS NOT NULL AS archived
       FROM public.shift_series WHERE id = $1`,
    [seriesId],
  );
}

describe.skipIf(!reachable)("118 series and import leave days before today alone", () => {
  const worked = { draft: null, published: "worked" };
  const removed = { draft: "deleted", published: "worked" };

  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    fx = await loadFixture();
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("removes all days of a series from today on and ends it yesterday", async () => {
    const seriesId = await series(-2, 2);

    expect(await removeSeries(seriesId, null, null)).toBe(3);

    expect(await days(-2, 2)).toEqual([worked, worked, removed, removed, removed]);
    expect(await seriesRow(seriesId)).toEqual({ end_date: day(-1), archived: false });
  });

  it("removes this and earlier days only from today", async () => {
    const seriesId = await series(-2, 2);

    expect(await removeSeries(seriesId, null, day(1))).toBe(2);

    expect(await days(-2, 2)).toEqual([worked, worked, removed, removed, worked]);
  });

  it("changes nothing when every day chosen is before today", async () => {
    const seriesId = await series(-3, 1);

    expect(await removeSeries(seriesId, null, day(-1))).toBe(0);

    expect(await days(-3, 1)).toEqual([worked, worked, worked, worked, worked]);
    expect(await seriesRow(seriesId)).toEqual({ end_date: day(1), archived: false });
  });

  it("still archives a series with no days before today", async () => {
    const seriesId = await series(0, 2);

    expect(await removeSeries(seriesId, null, null)).toBe(3);

    expect(await seriesRow(seriesId)).toMatchObject({ archived: true });
  });

  it("edits all days of a series from today on", async () => {
    const seriesId = await series(-2, 1);

    const { state } = await one<{ state: unknown }>(
      `SELECT public.build_schedule_cell_state_json('absence', '{}'::bigint[], '{}'::bigint[], $1) AS state`,
      [fx.absenceTypeId],
    );

    await asSuperAdmin(() =>
      db.query(`SELECT public.update_series_all_shifts($1, $2, $3::jsonb, NULL, NULL)`, [
        seriesId,
        fx.orgId,
        state,
      ]),
    );

    expect(await days(-2, 1)).toEqual([
      worked,
      worked,
      { draft: "absence", published: "worked" },
      { draft: "absence", published: "worked" },
    ]);
  });

  it("imports the previous period only into today and later", async () => {
    for (const offset of [-9, -8, -7]) await writeWorked(day(offset));

    const { rows } = await asSuperAdmin(() =>
      db.query<{ target_date: string; outcome: string }>(
        `SELECT to_char(target_date, 'YYYY-MM-DD') AS target_date, outcome
           FROM public.import_previous_schedule($1, $2::date, $3::date, $4::date, $5::date, FALSE)
          WHERE emp_id = $6
          ORDER BY target_date`,
        [fx.orgId, day(-9), day(-7), day(-2), day(0), empId],
      ),
    );

    expect(rows).toEqual([{ target_date: day(0), outcome: "imported" }]);
    expect(await days(-2, 0)).toEqual([null, null, { draft: "worked", published: null }]);
  });
});
