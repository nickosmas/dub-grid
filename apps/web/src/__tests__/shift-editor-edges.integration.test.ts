// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

// These write tests only ever target the local development database.
const connectionString = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const probe = new Client({ connectionString, connectionTimeoutMillis: 2000 });
const reachable = await probe.connect().then(
  () => true,
  () => false,
);
await probe.end();

const db = new Client({ connectionString });

beforeAll(async () => {
  if (reachable) await db.connect();
});
afterAll(async () => {
  if (reachable) await db.end();
});

interface Fixture {
  org_id: string;
  emp_id: string;
  user_id: string;
  job_id: number;
  shift_id: number;
  other_shift_id: number;
}

const DAYS = ["2031-02-03", "2031-02-04", "2031-02-05"];

function worked(shiftId: number, jobId: number, isMentored = false) {
  return JSON.stringify({
    kind: "worked",
    segments: [{ shiftId, jobId, position: 0, isMentored }],
    absenceTypeId: null,
  });
}

/** Runs `body` as a Calm Haven Super Admin inside a transaction that is always rolled back. */
async function asSuperAdmin(body: (fixture: Fixture) => Promise<void>) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '10s'");
    // Two daytime shifts the employee is qualified for with the same job.
    const {
      rows: [fixture],
    } = await db.query<Fixture>(`
      SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id,
        pair.job_id, pair.shift_id, pair.other_shift_id
      FROM public.organizations o
      JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
        AND e.archived_at IS NULL
      JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
      CROSS JOIN LATERAL (
        SELECT j.id::integer AS job_id, a.id::integer AS shift_id, b.id::integer AS other_shift_id
        FROM public.jobs j
        JOIN public.shift_categories a ON a.org_id = o.id AND a.archived_at IS NULL
        JOIN public.shift_categories b ON b.org_id = o.id AND b.archived_at IS NULL AND b.id > a.id
        WHERE j.org_id = o.id AND j.archived_at IS NULL
          AND public.is_employee_qualified_for_shift_job(e.id, a.id, j.id) IS NULL
          AND public.is_employee_qualified_for_shift_job(e.id, b.id, j.id) IS NULL
        ORDER BY j.id, a.id, b.id
        LIMIT 1
      ) pair
      WHERE o.slug = 'calmhaven'
      LIMIT 1
    `);
    if (!fixture) throw new Error("Local QA fixtures missing; run npm run db:reset");
    await db.query(
      "DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = ANY($2::date[])",
      [fixture.emp_id, DAYS],
    );
    await actAsAuthenticated(db, {
      sub: fixture.user_id,
      role: "authenticated",
      org_id: fixture.org_id,
      org_role: "super_admin",
      platform_role: "none",
    });
    await body(fixture);
  } finally {
    await db.query("ROLLBACK");
  }
}

async function createSeries(fixture: Fixture): Promise<string> {
  const seriesId = randomUUID();
  await db.query(
    `SELECT public.create_shift_series(
       $1::uuid, $2::uuid, $3::uuid, $4::jsonb, 'daily', NULL,
       $5::date, $6::date, NULL, FALSE, NULL
     )`,
    [
      seriesId,
      fixture.emp_id,
      fixture.org_id,
      worked(fixture.shift_id, fixture.job_id),
      DAYS[0],
      DAYS[DAYS.length - 1],
    ],
  );
  return seriesId;
}

/** Gives one day of the series its own times, the way a This day only edit does. */
async function setDayTimes(fixture: Fixture, seriesId: string, date: string) {
  await db.query("SET LOCAL ROLE postgres");
  const {
    rows: [cell],
  } = await db.query<{ version: number }>(
    "SELECT version::integer FROM public.schedule_cells WHERE emp_id = $1 AND date = $2",
    [fixture.emp_id, date],
  );
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1::uuid, $2::uuid, $3::date, 'draft', 'worked', ARRAY[$4::bigint], ARRAY[$5::bigint],
       NULL, '08:00', '12:00', $6::uuid, FALSE, NULL, $7::bigint, NULL, ARRAY[FALSE]
     )`,
    [
      fixture.org_id,
      fixture.emp_id,
      date,
      fixture.shift_id,
      fixture.job_id,
      seriesId,
      cell.version,
    ],
  );
  await db.query("SET LOCAL ROLE authenticated");
}

async function draftTimes(fixture: Fixture): Promise<Record<string, string | null>> {
  const { rows } = await db.query<{ date: string; times: string | null }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date,
       s.custom_start_time || '-' || s.custom_end_time AS times
     FROM public.schedule_cells c
     JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = 'draft'
     WHERE c.emp_id = $1 AND c.date = ANY($2::date[])`,
    [fixture.emp_id, DAYS],
  );
  return Object.fromEntries(rows.map((row) => [row.date, row.times]));
}

describe.runIf(reachable)("shift editor edge cases against the local database", () => {
  it("keeps a day's own times when a ranged series edit leaves its shift alone", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createSeries(fixture);
      await setDayTimes(fixture, seriesId, DAYS[1]);

      await db.query("SELECT public.update_series_all_shifts($1, $2, $3::jsonb, $4::date, NULL)", [
        seriesId,
        fixture.org_id,
        worked(fixture.shift_id, fixture.job_id, true),
        DAYS[0],
      ]);

      const times = await draftTimes(fixture);
      expect(DAYS.map((day) => times[day])).toEqual([null, "08:00-12:00", null]);
    });
  });

  it("gives a day the new shift's standard times when the edit changes its shift", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createSeries(fixture);
      await setDayTimes(fixture, seriesId, DAYS[1]);

      await db.query("SELECT public.update_series_all_shifts($1, $2, $3::jsonb, $4::date, NULL)", [
        seriesId,
        fixture.org_id,
        worked(fixture.other_shift_id, fixture.job_id),
        DAYS[0],
      ]);

      const times = await draftTimes(fixture);
      expect(DAYS.map((day) => times[day])).toEqual([null, null, null]);
    });
  });

  it("lets a night shift follow an early one under conflict prevention, and still refuses a real overlap", async () => {
    await asSuperAdmin(async (fixture) => {
      // The check is internal to the save functions, so call it as their owner.
      await db.query("SET LOCAL ROLE postgres");
      await db.query(
        "UPDATE public.organizations SET enforce_conflict_prevention = TRUE WHERE id = $1",
        [fixture.org_id],
      );

      const check = (start: string, end: string) =>
        db.query(
          `SELECT public.assert_non_overlapping_work_assignment_times(
             $1::uuid, ARRAY[$2::bigint, $3::bigint], ARRAY[$4::bigint, $4::bigint], $5, $6
           )`,
          [fixture.org_id, fixture.shift_id, fixture.other_shift_id, fixture.job_id, start, end],
        );

      await expect(check("05:00|23:00", "13:00|07:00")).resolves.toBeDefined();
      await db.query("SAVEPOINT overlap");
      await expect(check("15:00|22:00", "23:00|06:00")).rejects.toThrow(
        "have overlapping time ranges",
      );
      await db.query("ROLLBACK TO SAVEPOINT overlap");
    });
  });
});
