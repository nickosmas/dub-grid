// @vitest-environment node

/**
 * Migration 116: leaving the grid removes today's published day only when it
 * hasn't started, in the organization's time zone, and the same rule keeps a
 * started day out of an away person's draft removals. Each case runs 116 from
 * its file inside BEGIN/ROLLBACK against the seeded local database, with the
 * organization moved to a time zone where it is around midday, so a 01:00
 * start has passed and a 23:00 start hasn't.
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

const MIGRATION = readFileSync(migrationPath("116_leaving_grid_keeps_started_today.sql"), "utf8");

const STARTED = { start: "01:00", end: "02:00" };
const AHEAD = { start: "23:00", end: "23:30" };

interface Fixture {
  orgId: string;
  actorId: string;
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

/** Moves the organization to a fixed-offset zone where it is 10 AM to 1 PM now. */
async function middayZone(orgId: string): Promise<string> {
  const { zone } = await one<{ zone: string }>(
    `SELECT zone FROM (
       SELECT 'Etc/GMT' || CASE WHEN n > 0 THEN '+' || n ELSE n::text END AS zone
         FROM generate_series(-12, 12) AS n
     ) zones
     WHERE extract(hour FROM now() AT TIME ZONE zone) BETWEEN 10 AND 13
     LIMIT 1`,
  );
  await db.query(`UPDATE public.organizations SET timezone = $2 WHERE id = $1`, [orgId, zone]);
  const { today } = await one<{ today: string }>(
    `SELECT to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM public.organizations WHERE id = $1`,
    [orgId],
  );
  return today;
}

async function loadFixture(): Promise<Omit<Fixture, "today">> {
  const { id: orgId } = await one<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const { user_id: actorId } = await one<{ user_id: string }>(
    `SELECT user_id FROM public.organization_memberships
      WHERE org_id = $1 AND org_role = 'super_admin' AND archived_at IS NULL
      ORDER BY user_id LIMIT 1`,
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
        AND $2 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [orgId, shift.id],
  );
  const absence = await one<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  return {
    orgId,
    actorId,
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
       'Started', 'Fixture', 9999, ARRAY[$2]::bigint[])
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

interface Snapshot {
  kind?: "draft" | "published";
  times?: { start: string; end: string } | null;
  absence?: { start: string; end: string };
  wholeDayAbsence?: boolean;
}

async function write(cellId: string, snapshot: Snapshot = {}) {
  const kind = snapshot.kind ?? "published";
  if (snapshot.wholeDayAbsence) {
    await db.query(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'absence', $4, NULL, NULL,
         '{}'::bigint[], '{}'::bigint[])`,
      [cellId, fx.orgId, kind, fx.absenceTypeId],
    );
    return;
  }
  const times = snapshot.times === undefined ? STARTED : snapshot.times;
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', $4, $5, $6,
       $7::bigint[], $8::bigint[], '{}'::boolean[], $9, $10)`,
    [
      cellId,
      fx.orgId,
      kind,
      snapshot.absence ? fx.absenceTypeId : null,
      times?.start ?? null,
      times?.end ?? null,
      [fx.shiftId],
      [fx.jobId],
      snapshot.absence?.start ?? null,
      snapshot.absence?.end ?? null,
    ],
  );
}

async function publishedOn(offset: number, snapshot: Snapshot = {}): Promise<string> {
  const cellId = await cellOn(day(offset));
  await write(cellId, snapshot);
  return cellId;
}

async function update(set: string) {
  await db.query(`UPDATE public.employees SET ${set}, updated_by = $2 WHERE id = $1`, [
    empId,
    fx.actorId,
  ]);
}

const offboard = () => update("status = 'removed', archived_at = now()");

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

/** The dates of the removals published for this person. */
async function publishedRemovals(): Promise<string[]> {
  const { rows } = await db.query<{ date: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public.schedule_publish_changes
      WHERE emp_id = $1 AND kind = 'deleted' ORDER BY date`,
    [empId],
  );
  return rows.map((row) => row.date);
}

async function noteOn(offset: number, status: "published" | "draft") {
  const { id: noteType } = await one<{ id: number }>(
    `INSERT INTO public.indicator_types (org_id, name, color)
     VALUES ($1, '116 note ' || $2, '#E24B4A') RETURNING id`,
    [fx.orgId, `${offset}-${status}`],
  );
  await db.query(
    `INSERT INTO public.schedule_notes
       (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [fx.orgId, empId, day(offset), noteType, fx.focusAreaId, fx.shiftId, fx.jobId, status],
  );
}

async function noteDates(): Promise<string[]> {
  const { rows } = await db.query<{ date: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public.schedule_notes
      WHERE emp_id = $1 ORDER BY date`,
    [empId],
  );
  return rows.map((row) => row.date);
}

async function started(snapshot: Snapshot, offset = 0): Promise<boolean> {
  const cellId = await publishedOn(offset, snapshot);
  const { rows } = await db.query<{ started: boolean }>(
    `SELECT public.schedule_day_has_started(
       $1, p.date, p.state_kind, p.shift_ids, p.job_ids, p.custom_start_time,
       p.custom_end_time, p.absence_start_time, p.absence_end_time) AS started
       FROM public.schedule_cells c,
            public.get_schedule_cell_snapshot_payload(c.org_id, c.emp_id, c.date, 'published') p
      WHERE c.id = $2`,
    [fx.orgId, cellId],
  );
  await db.query(`DELETE FROM public.schedule_cells WHERE id = $1`, [cellId]);
  return rows[0].started;
}

describe.skipIf(!reachable)("116 leaving the grid keeps today's shift once it has started", () => {
  const worked = { draft: null, published: "worked" };
  const pending = { draft: "deleted", published: "worked" };

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
    const base = await loadFixture();
    fx = { ...base, today: await middayZone(base.orgId) };
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("keeps today's started shift and its notes when someone is offboarded, and removes the days after", async () => {
    await publishedOn(0, { times: STARTED });
    await publishedOn(1);
    await noteOn(0, "published");
    await noteOn(1, "published");

    await offboard();

    expect(await days(0, 1)).toEqual([worked, null]);
    expect(await publishedRemovals()).toEqual([day(1)]);
    expect(await noteDates()).toEqual([day(0)]);
  });

  it("removes today's shift, with its notes, when it hasn't started", async () => {
    await publishedOn(0, { times: AHEAD });
    await noteOn(0, "published");

    await update("status = 'inactive'");

    expect(await days(0, 0)).toEqual([null]);
    expect(await publishedRemovals()).toEqual([day(0)]);
    expect(await noteDates()).toEqual([]);
  });

  it("leaves a started day's draft as it is", async () => {
    const cellId = await publishedOn(0, { times: STARTED });
    await write(cellId, { kind: "draft", times: AHEAD });

    await offboard();

    expect(await days(0, 0)).toEqual([{ draft: "worked", published: "worked" }]);
    expect(await publishedRemovals()).toEqual([]);
  });

  it("doesn't draft a started day for removal for someone away with a return date", async () => {
    await publishedOn(0, { times: STARTED });
    await publishedOn(1);

    await update(`status = 'inactive', away_until = '${day(5)}'`);

    expect(await days(0, 1)).toEqual([worked, pending]);
  });

  it("drafts today for removal for someone away with a return date when it hasn't started", async () => {
    await publishedOn(0, { times: AHEAD });

    await update(`status = 'inactive', away_until = '${day(5)}'`);

    expect(await days(0, 0)).toEqual([pending]);
  });

  it("works out when a day starts", async () => {
    expect(await started({ times: STARTED })).toBe(true);
    expect(await started({ times: AHEAD })).toBe(false);
    // The shift's own start (the seed's shifts all have one) decides without custom times.
    const { early } = await one<{ early: boolean }>(
      `SELECT (now() AT TIME ZONE timezone)::time >= sc.start_time AS early
         FROM public.organizations o, public.shift_categories sc
        WHERE o.id = $1 AND sc.id = $2`,
      [fx.orgId, fx.shiftId],
    );
    expect(await started({ times: null })).toBe(early);
    // A whole-day absence has started; so has a late arrival whose absence began.
    expect(await started({ wholeDayAbsence: true })).toBe(true);
    expect(await started({ times: AHEAD, absence: { start: "09:00", end: "23:00" } })).toBe(true);
    expect(await started({ times: AHEAD, absence: { start: "22:00", end: "23:00" } })).toBe(false);
    // An absence after the shift (left early) doesn't move the start.
    expect(await started({ times: AHEAD, absence: { start: "23:30", end: "23:45" } })).toBe(false);
    expect(await started({ times: AHEAD }, -1)).toBe(true);
    expect(await started({ times: STARTED }, 1)).toBe(false);
  });

  it("keeps a day whose start can't be worked out", async () => {
    const { rows } = await db.query<{ started: boolean }>(
      `SELECT public.schedule_day_has_started($1, $2::date, 'worked', ARRAY[NULL]::bigint[],
         ARRAY[$3]::bigint[], NULL, NULL) AS started`,
      [fx.orgId, day(0), -1],
    );
    expect(rows[0].started).toBe(true);
  });

  it("still closes their open requests, today's included", async () => {
    await publishedOn(0, { times: STARTED });
    await db.query(
      `INSERT INTO public.shift_requests
         (org_id, type, requester_emp_id, requester_shift_date, requester_state, status, expires_at)
       VALUES ($1, 'pickup', $2, $3,
         public.build_schedule_cell_state_json('worked', ARRAY[$4]::bigint[], ARRAY[$5]::bigint[]),
         'open', now() + interval '1 day')`,
      [fx.orgId, empId, day(0), fx.shiftId, fx.jobId],
    );

    await offboard();

    const { status } = await one<{ status: string }>(
      `SELECT status FROM public.shift_requests WHERE requester_emp_id = $1`,
      [empId],
    );
    expect(status).toBe("expired");
    expect(await days(0, 0)).toEqual([worked]);
  });
});
