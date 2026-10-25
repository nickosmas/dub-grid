// @vitest-environment node

/**
 * Requests read an overnight shift by its real times (supabase/migrations/095)
 * against the seeded local database: two people's shifts on one date, and an
 * arrived-late absence against the shift someone would take that date. Each
 * case runs inside a transaction that is always rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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

let db: Client;

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end();
});

interface Fixture {
  org_id: string;
  emp_id: string;
  user_id: string;
  shift_id: number;
  job_id: number;
}

const DATE = "2031-06-10";

/** Runs `body` as the functions' owner inside a transaction that is always rolled back. */
async function inRolledBackTransaction(body: (fixture: Fixture) => Promise<void>) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '10s'");
    const {
      rows: [fixture],
    } = await db.query<Fixture>(`
      SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id,
        s.id::integer AS shift_id, j.id::integer AS job_id
      FROM public.organizations o
      JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
      JOIN public.employees e ON e.org_id = o.id AND e.status = 'active' AND e.archived_at IS NULL
      JOIN public.shift_categories s ON s.org_id = o.id AND s.archived_at IS NULL
      JOIN public.jobs j ON j.org_id = o.id AND j.archived_at IS NULL
      WHERE o.slug = 'calmhaven'
      ORDER BY e.id, s.id, j.id
      LIMIT 1
    `);
    if (!fixture) throw new Error("Local QA fixtures missing; run npm run db:reset");
    await db.query("DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2::date", [
      fixture.emp_id,
      DATE,
    ]);
    await body(fixture);
  } finally {
    await db.query("ROLLBACK");
  }
}

async function overlap(fixture: Fixture, a: [string, string], b: [string, string]) {
  const {
    rows: [row],
  } = await db.query<{ overlaps: boolean }>(
    `SELECT public.work_assignment_times_overlap(
       ARRAY[$1::bigint], ARRAY[$2::bigint], $3, $4,
       ARRAY[$1::bigint], ARRAY[$2::bigint], $5, $6) AS overlaps`,
    [fixture.shift_id, fixture.job_id, a[0], a[1], b[0], b[1]],
  );
  return row.overlaps;
}

/** Publishes a cell worked from `worked` with an arrived-late absence over `absent`. */
async function publishArrivedLate(
  fixture: Fixture,
  worked: [string, string],
  absent: [string, string],
) {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1::uuid, $2::uuid, $3::date, 'published', 'worked', ARRAY[$4::bigint], ARRAY[$5::bigint],
       (SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1),
       $6, $7, NULL, FALSE, NULL, NULL, $8::uuid, ARRAY[FALSE],
       p_absence_start_time => $9, p_absence_end_time => $10)`,
    [
      fixture.org_id,
      fixture.emp_id,
      DATE,
      fixture.shift_id,
      fixture.job_id,
      worked[0],
      worked[1],
      fixture.user_id,
      absent[0],
      absent[1],
    ],
  );
}

async function absenceConflict(fixture: Fixture, taken: [string, string]) {
  const {
    rows: [row],
  } = await db.query<{ conflict: string | null }>(
    `SELECT public.rest_of_day_absence_conflict(
       $1::uuid, $2::uuid, $3::date, ARRAY[$4::bigint], ARRAY[$5::bigint], $6, $7) AS conflict`,
    [fixture.org_id, fixture.emp_id, DATE, fixture.shift_id, fixture.job_id, taken[0], taken[1]],
  );
  return row.conflict;
}

describe.runIf(reachable)("overnight shifts in requests against the local database", () => {
  it("runs a night shift past midnight instead of onto that morning", async () => {
    await inRolledBackTransaction(async (fixture) => {
      expect(await overlap(fixture, ["06:00", "14:00"], ["23:00", "07:00"])).toBe(false);
      expect(await overlap(fixture, ["23:00", "07:00"], ["06:00", "14:00"])).toBe(false);
      expect(await overlap(fixture, ["15:00", "23:30"], ["23:00", "07:00"])).toBe(true);
      expect(await overlap(fixture, ["22:00", "06:00"], ["23:00", "07:00"])).toBe(true);
      expect(await overlap(fixture, ["07:00", "15:00"], ["15:00", "23:00"])).toBe(false);
    });
  });

  it("lets someone who arrived late to an early shift take that night's shift", async () => {
    await inRolledBackTransaction(async (fixture) => {
      await publishArrivedLate(fixture, ["08:00", "14:00"], ["06:00", "08:00"]);

      expect(await absenceConflict(fixture, ["23:00", "07:00"])).toBeNull();
      expect(await absenceConflict(fixture, ["07:00", "15:00"])).toBe("during that shift");
    });
  });

  it("reads a late arrival to a night shift from that evening", async () => {
    await inRolledBackTransaction(async (fixture) => {
      await publishArrivedLate(fixture, ["01:00", "07:00"], ["23:00", "01:00"]);

      expect(await absenceConflict(fixture, ["22:00", "23:30"])).toBe("during that shift");
      expect(await absenceConflict(fixture, ["06:00", "14:00"])).toBeNull();
    });
  });
});
