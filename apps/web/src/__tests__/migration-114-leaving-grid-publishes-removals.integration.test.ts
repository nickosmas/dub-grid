// @vitest-environment node

/**
 * Migration 114: taking someone off the grid (Offboarded, or Away with no
 * return date) publishes their removals from today on, under one
 * publish_history row credited to whoever changed the status, and its one-time
 * block does the same for removals already pending. Each case runs 114 from its file inside BEGIN/ROLLBACK against the seeded local database.
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

const MIGRATION = readFileSync(migrationPath("114_leaving_grid_publishes_removals.sql"), "utf8");
const CLEANUP = MIGRATION.slice(MIGRATION.indexOf("DO $cleanup$"));

interface Fixture {
  orgId: string;
  actorId: string;
  shiftId: number;
  jobId: number;
  focusAreaId: number;
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
  return {
    orgId,
    actorId,
    today,
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    focusAreaId: Number(shift.fa),
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
       'Leaving', 'Fixture', 9999, ARRAY[$2]::bigint[])
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

async function writeSnapshot(
  cellId: string,
  kind: "draft" | "published",
  state: "worked" | "deleted",
) {
  const worked = state === "worked";
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, $4, NULL, NULL, NULL,
       $5::bigint[], $6::bigint[])`,
    [cellId, fx.orgId, kind, state, worked ? [fx.shiftId] : [], worked ? [fx.jobId] : []],
  );
}

async function publishedWorkFrom(from: number, to: number) {
  for (let offset = from; offset <= to; offset++) {
    await writeSnapshot(await cellOn(day(offset)), "published", "worked");
  }
}

async function update(set: string, actorId: string | null = fx.actorId) {
  await db.query(`UPDATE public.employees SET ${set}, updated_by = $2 WHERE id = $1`, [
    empId,
    actorId,
  ]);
}

const offboard = (actorId?: string | null) =>
  update("status = 'removed', archived_at = now()", actorId);

type DayState = { draft: string | null; published: string | null } | null;

/** Each day's draft and published state; null when the day has no cell. */
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

interface History {
  publishedBy: string;
  startDate: string;
  endDate: string;
  changeCount: number;
  changes: { date: string; kind: string; updatedBy: string; fromKind: string }[];
}

/** The publish_history rows that name this person, with their change rows. */
async function histories(): Promise<History[]> {
  const { rows } = await db.query<History & { id: string }>(
    `SELECT h.id, h.published_by AS "publishedBy",
            to_char(h.start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(h.end_date, 'YYYY-MM-DD') AS "endDate",
            h.change_count AS "changeCount"
       FROM public.publish_history h
      WHERE EXISTS (
        SELECT 1 FROM public.schedule_publish_changes c
         WHERE c.publish_history_id = h.id AND c.emp_id = $1
      )
      ORDER BY h.published_at`,
    [empId],
  );
  const result: History[] = [];
  for (const { id, ...history } of rows) {
    const { rows: changes } = await db.query<History["changes"][number]>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, kind, updated_by AS "updatedBy",
              from_state->>'kind' AS "fromKind"
         FROM public.schedule_publish_changes
        WHERE publish_history_id = $1
        ORDER BY date`,
      [id],
    );
    result.push({ ...history, changes });
  }
  return result;
}

function removedHistory(from: number, to: number, noteCount = 0): History {
  const changes = [];
  for (let offset = from; offset <= to; offset++) {
    changes.push({ date: day(offset), kind: "deleted", updatedBy: fx.actorId, fromKind: "worked" });
  }
  return {
    publishedBy: fx.actorId,
    startDate: day(from),
    endDate: day(to),
    changeCount: changes.length + noteCount,
    changes,
  };
}

describe.skipIf(!reachable)("114 leaving the grid publishes the removals", () => {
  const worked = { draft: null, published: "worked" };
  const pending = { draft: "deleted", published: "worked" };

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

  it("publishes the removals from today on when someone is offboarded, and keeps the past", async () => {
    await publishedWorkFrom(-1, 2);

    await offboard();

    expect(await days(-1, 2)).toEqual([worked, null, null, null]);
    const [history, ...rest] = await histories();
    expect(rest).toEqual([]);
    expect(history).toEqual(removedHistory(0, 2));
  });

  it("does the same for someone marked away with no return date", async () => {
    await publishedWorkFrom(0, 1);

    await update("status = 'inactive'");

    expect(await days(0, 1)).toEqual([null, null]);
    expect(await histories()).toEqual([removedHistory(0, 1)]);
  });

  it("keeps draft removals for someone away with a return date, and publishes them when it's cleared", async () => {
    await publishedWorkFrom(0, 2);

    await update(`status = 'inactive', away_until = '${day(5)}'`);
    expect(await days(0, 2)).toEqual([pending, pending, pending]);
    expect(await histories()).toEqual([]);

    await update("away_until = NULL");
    expect(await days(0, 2)).toEqual([null, null, null]);
    expect(await histories()).toEqual([removedHistory(0, 2)]);
  });

  it("publishes the days a last day already cleared when the job offboards them", async () => {
    await publishedWorkFrom(-1, 2);
    await db.query(
      `UPDATE public.employees
          SET planned_status = 'removed', planned_from = $2, planned_until = NULL,
              planned_absence_type_id = NULL
        WHERE id = $1`,
      [empId, day(0)],
    );
    expect(await days(-1, 2)).toEqual([worked, pending, pending, pending]);

    // The job's update (return-from-away), credited to whoever planned it.
    await offboard();

    expect(await days(-1, 2)).toEqual([worked, null, null, null]);
    expect(await histories()).toEqual([removedHistory(0, 2)]);
  });

  it("removes their notes ahead and counts the published ones", async () => {
    await publishedWorkFrom(-1, 1);
    const { id: noteType } = await one<{ id: number }>(
      `INSERT INTO public.indicator_types (org_id, name, color)
       VALUES ($1, '114 note', '#E24B4A') RETURNING id`,
      [fx.orgId],
    );
    for (const [offset, status] of [
      [-1, "published"],
      [0, "published"],
      [1, "draft"],
    ] as const) {
      await db.query(
        `INSERT INTO public.schedule_notes
           (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [fx.orgId, empId, day(offset), noteType, fx.focusAreaId, fx.shiftId, fx.jobId, status],
      );
    }

    await offboard();

    const { rows: notes } = await db.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, status FROM public.schedule_notes WHERE emp_id = $1`,
      [empId],
    );
    expect(notes).toEqual([{ date: day(-1), status: "published" }]);
    expect(await histories()).toEqual([removedHistory(0, 1, 1)]);
  });

  it("drops a day only drafted, clears a past draft, and writes no history when nothing published goes", async () => {
    const draftOnly = await cellOn(day(1));
    await writeSnapshot(draftOnly, "draft", "worked");
    await writeSnapshot(await cellOn(day(-2)), "published", "worked");
    const pastWithDraft = await cellOn(day(-1));
    await writeSnapshot(pastWithDraft, "published", "worked");
    await writeSnapshot(pastWithDraft, "draft", "worked");

    await offboard();

    expect(await days(-2, 1)).toEqual([worked, worked, null, null]);
    expect(await histories()).toEqual([]);
  });

  it("publishes removals already pending on someone off the grid, once someone is credited", async () => {
    await publishedWorkFrom(-1, 2);
    // A departure from before this migration, left pending with no actor.
    await offboard(null);
    expect(await days(-1, 2)).toEqual([worked, pending, pending, pending]);

    await db.query(CLEANUP);
    expect(await days(-1, 2)).toEqual([worked, pending, pending, pending]);

    await db.query(`UPDATE public.employees SET updated_by = $2 WHERE id = $1`, [
      empId,
      fx.actorId,
    ]);
    await db.query(CLEANUP);

    expect(await days(-1, 2)).toEqual([worked, null, null, null]);
    expect(await histories()).toEqual([removedHistory(0, 2)]);
  });

  it("leaves the removals pending when nobody is credited with the change", async () => {
    await publishedWorkFrom(0, 1);

    await offboard(null);

    expect(await days(0, 1)).toEqual([pending, pending]);
    expect(await histories()).toEqual([]);
  });
});
