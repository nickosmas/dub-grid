// @vitest-environment node

/**
 * Migration 099: someone Away until a date can be scheduled from that date
 * and not before, and marking or changing the date clears only the days it
 * covers. Each case runs 099 from its file inside BEGIN/ROLLBACK against the
 * seeded local database.
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
const BEFORE = "2033-06-13";
const RETURN = "2033-06-14";
const AFTER = "2033-06-15";
const LATER = "2033-06-17";
const REFUSED = /Employee not found, archived, or inactive/;

const MIGRATION = readFileSync(migrationPath("099_away_until.sql"), "utf8");

/** The functions 099 rewrites; none may still ask for `status = 'active'`. */
const REWRITTEN = [
  "write_schedule_cell_snapshot",
  "create_shift_series",
  "reschedule_shift_series",
  "move_shift",
  "import_previous_schedule",
  "create_shift_request_unguarded",
  "claim_shift_request_unguarded",
  "volunteer_for_open_shift_unguarded",
  "resolve_shift_request_unchecked",
  "finalize_scheduler_staffed_calloffs",
  "refuse_unschedulable_employee",
];

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

async function cellOn(date: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, fx.empId, date],
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

async function setAway(awayUntil: string | null) {
  await db.query(`UPDATE public.employees SET status = 'inactive', away_until = $2 WHERE id = $1`, [
    fx.empId,
    awayUntil,
  ]);
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

async function scheduleWorked(date: string): Promise<Error | null> {
  const cellId = await cellOn(date);
  return attempt(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
       $3::bigint[], $4::bigint[])`,
    [cellId, fx.orgId, [fx.shiftId], [fx.jobId]],
  );
}

const insertPickup = `INSERT INTO public.shift_requests
    (org_id, type, requester_emp_id, requester_shift_date, requester_state)
  VALUES ($1, 'pickup', $2, $3, '{}'::jsonb) RETURNING id`;

describe.skipIf(!reachable)("099 an Away-until person is schedulable from the date", () => {
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

  it("asks one helper in every rewritten function", async () => {
    const { rows } = await db.query<{ proname: string; src: string }>(
      `SELECT proname, prosrc AS src FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)`,
      [REWRITTEN],
    );
    expect(new Set(rows.map((row) => row.proname))).toEqual(new Set(REWRITTEN));
    for (const row of rows) {
      expect(row.src, row.proname).not.toMatch(/status\s*(=|!=|<>)\s*'active'/);
      expect(row.src, row.proname).toMatch(/employee_schedulable_on\(/);
    }
  });

  it("answers per date", async () => {
    await setAway(RETURN);
    const { rows } = await db.query<{
      before: boolean;
      onDay: boolean;
      after: boolean;
      ever: boolean;
    }>(
      `SELECT public.employee_schedulable_on($1, $2) AS before,
              public.employee_schedulable_on($1, $3) AS "onDay",
              public.employee_schedulable_on($1, $4) AS after,
              public.employee_schedulable_on($1, 'infinity') AS ever`,
      [fx.empId, BEFORE, RETURN, AFTER],
    );
    expect(rows[0]).toEqual({ before: false, onDay: true, after: true, ever: true });

    await setAway(null);
    const {
      rows: [indefinite],
    } = await db.query<{ ever: boolean }>(
      `SELECT public.employee_schedulable_on($1, 'infinity') AS ever`,
      [fx.empId],
    );
    expect(indefinite.ever).toBe(false);
  });

  it("schedules on and after the return date and refuses the day before", async () => {
    await setAway(RETURN);

    expect((await scheduleWorked(BEFORE))?.message).toMatch(REFUSED);
    expect(await scheduleWorked(RETURN)).toBeNull();
    expect(await scheduleWorked(AFTER)).toBeNull();
  });

  it("takes a request from the return date on, and none before", async () => {
    await setAway(RETURN);

    expect((await attempt(insertPickup, [fx.orgId, fx.empId, BEFORE]))?.message).toMatch(REFUSED);
    expect(await attempt(insertPickup, [fx.orgId, fx.empId, RETURN])).toBeNull();
  });

  it("keeps recurring templates writable with a return date, and not without one", async () => {
    const insertTemplate = `INSERT INTO public.recurring_shifts (emp_id, org_id, day_of_week, state)
       VALUES ($1, $2, 3, '{}'::jsonb)`;
    await setAway(RETURN);
    expect(await attempt(insertTemplate, [fx.empId, fx.orgId])).toBeNull();

    await setAway(null);
    expect((await attempt(insertTemplate, [fx.empId, fx.orgId]))?.message).toMatch(REFUSED);
  });

  it("drops the return date when they leave Away, and ignores one on an active person", async () => {
    await setAway(RETURN);
    await db.query(`UPDATE public.employees SET status = 'active' WHERE id = $1`, [fx.empId]);
    const {
      rows: [active],
    } = await db.query<{ away_until: string | null }>(
      `SELECT away_until FROM public.employees WHERE id = $1`,
      [fx.empId],
    );
    expect(active.away_until).toBeNull();

    expect(
      await attempt(`UPDATE public.employees SET away_until = $2 WHERE id = $1`, [
        fx.empId,
        RETURN,
      ]),
    ).toBeNull();
    const {
      rows: [still],
    } = await db.query<{ away_until: string | null }>(
      `SELECT away_until FROM public.employees WHERE id = $1`,
      [fx.empId],
    );
    expect(still.away_until).toBeNull();
  });
});

describe.skipIf(!reachable)("099 clearing follows the return date", () => {
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
    await db.query(MIGRATION);
    await seed();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  /** A published shift on each date, a template, a series ending before and one after, and requests. */
  async function seed() {
    cells = {};
    for (const date of [BEFORE, RETURN, AFTER, LATER]) {
      cells[date] = await cellOn(date);
      await writeWorked(cells[date], "published");
    }
    await db.query(
      `INSERT INTO public.recurring_shifts (emp_id, org_id, day_of_week, state)
       VALUES ($1, $2, 1, '{}'::jsonb)`,
      [fx.empId, fx.orgId],
    );
    await db.query(
      `INSERT INTO public.shift_series (emp_id, org_id, state, frequency, start_date, end_date)
       VALUES ($1, $2, '{}'::jsonb, 'daily', $3, $3), ($1, $2, '{}'::jsonb, 'daily', $4, $5)`,
      [fx.empId, fx.orgId, BEFORE, RETURN, LATER],
    );
    for (const date of [BEFORE, AFTER]) {
      await db.query(insertPickup, [fx.orgId, fx.empId, date]);
    }
  }

  /** Each date's snapshots as `kind:state`. */
  async function schedule(): Promise<Record<string, string[]>> {
    const { rows } = await db.query<{ date: string; snapshots: string[] }>(
      `SELECT to_char(c.date, 'YYYY-MM-DD') AS date,
              array_agg(s.snapshot_kind || ':' || s.state_kind ORDER BY s.snapshot_kind) AS snapshots
         FROM public.schedule_cells c
         JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
        WHERE c.id = ANY($1)
        GROUP BY c.date`,
      [Object.values(cells)],
    );
    return Object.fromEntries(rows.map((row) => [row.date, row.snapshots]));
  }

  async function leftovers() {
    const { rows } = await db.query<{
      templates: number;
      series: string[];
      requests: string[];
    }>(
      `SELECT
         (SELECT count(*)::int FROM public.recurring_shifts
           WHERE emp_id = $1 AND archived_at IS NULL) AS templates,
         (SELECT COALESCE(array_agg(to_char(start_date, 'YYYY-MM-DD') ORDER BY start_date), '{}')
            FROM public.shift_series WHERE emp_id = $1 AND archived_at IS NULL) AS series,
         (SELECT COALESCE(array_agg(to_char(requester_shift_date, 'YYYY-MM-DD')
                   ORDER BY requester_shift_date), '{}')
            FROM public.shift_requests
           WHERE requester_emp_id = $1 AND status IN ('open', 'pending_approval')) AS requests`,
      [fx.empId],
    );
    return rows[0];
  }

  const KEPT = ["published:worked"];
  const CLEARED = ["draft:deleted", "published:worked"];

  it("clears only the days before the return date and keeps the recurring schedule", async () => {
    await setAway(RETURN);

    expect(await schedule()).toEqual({
      [BEFORE]: CLEARED,
      [RETURN]: KEPT,
      [AFTER]: KEPT,
      [LATER]: KEPT,
    });
    expect(await leftovers()).toEqual({ templates: 1, series: [RETURN], requests: [AFTER] });
  });

  it("clears the newly covered days when the date moves later", async () => {
    await setAway(RETURN);
    await db.query(`UPDATE public.employees SET away_until = $2 WHERE id = $1`, [fx.empId, LATER]);

    expect(await schedule()).toEqual({
      [BEFORE]: CLEARED,
      [RETURN]: CLEARED,
      [AFTER]: CLEARED,
      [LATER]: KEPT,
    });
    expect(await leftovers()).toEqual({ templates: 1, series: [RETURN], requests: [] });
  });

  it("clears everything ahead and archives the recurring schedule when the date is removed", async () => {
    await setAway(RETURN);
    await db.query(`UPDATE public.employees SET away_until = NULL WHERE id = $1`, [fx.empId]);

    expect(await schedule()).toEqual({
      [BEFORE]: CLEARED,
      [RETURN]: CLEARED,
      [AFTER]: CLEARED,
      [LATER]: CLEARED,
    });
    expect(await leftovers()).toEqual({ templates: 0, series: [], requests: [] });
  });

  it("clears everything when someone Away until a date is archived", async () => {
    await setAway(RETURN);
    await db.query(
      `UPDATE public.employees SET status = 'removed', archived_at = now() WHERE id = $1`,
      [fx.empId],
    );

    expect(await schedule()).toEqual({
      [BEFORE]: CLEARED,
      [RETURN]: CLEARED,
      [AFTER]: CLEARED,
      [LATER]: CLEARED,
    });
    expect(await leftovers()).toEqual({ templates: 0, series: [], requests: [] });
  });

  it("still clears everything when marked Away without a date", async () => {
    await setAway(null);

    expect(await schedule()).toEqual({
      [BEFORE]: CLEARED,
      [RETURN]: CLEARED,
      [AFTER]: CLEARED,
      [LATER]: CLEARED,
    });
    expect(await leftovers()).toEqual({ templates: 0, series: [], requests: [] });
  });
});
