// @vitest-environment node

/**
 * Migration 111: a day before the organization's today is never drafted
 * (53b). The cell save and the cell clear refuse it, so paste, fills, moves
 * and bulk delete can't touch a past day, while today and later save as
 * before and a correction (110) still writes the past day. Each case runs
 * 110 and 111 from their files inside BEGIN/ROLLBACK against the seeded local
 * database, on a person created inside the transaction.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
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

const MIGRATIONS = ["110_past_day_corrections.sql", "111_past_days_not_drafted.sql"].map((name) =>
  readFileSync(migrationPath(name), "utf8"),
);
const PAST = /Past days are corrected, not drafted/;

type Member = { userId: string; orgRole: "admin" | "super_admin" };

interface Fixture {
  orgId: string;
  timeZone: string;
  shiftId: number;
  jobId: number;
  focusAreaId: number;
  sickId: number;
  today: string;
  admin: Member;
  superAdmin: Member;
}

let db: Client;
let fx: Fixture;
let empId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function loadMember(orgId: string, email: string): Promise<Member> {
  const row = await one<{ user_id: string; org_role: Member["orgRole"] }>(
    `SELECT u.id AS user_id, m.org_role
       FROM auth.users u
       JOIN public.organization_memberships m ON m.user_id = u.id AND m.org_id = $1
      WHERE u.email = $2 AND m.archived_at IS NULL`,
    [orgId, email],
  );
  return { userId: row.user_id, orgRole: row.org_role };
}

async function loadFixture(): Promise<Fixture> {
  const org = await one<{ id: string; tz: string; today: string }>(
    `SELECT id, timezone AS tz,
            to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const shift = await one<{ id: number; fa: number }>(
    `SELECT id, focus_area_id AS fa FROM public.shift_categories
      WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
      ORDER BY id LIMIT 1`,
    [org.id],
  );
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND $2 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [org.id, shift.id],
  );
  const sick = await one<{ id: number }>(
    `SELECT id FROM public.absence_types
      WHERE org_id = $1 AND archived_at IS NULL ORDER BY id OFFSET 1 LIMIT 1`,
    [org.id],
  );
  return {
    orgId: org.id,
    timeZone: org.tz,
    today: org.today,
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    focusAreaId: Number(shift.fa),
    sickId: Number(sick.id),
    admin: await loadMember(org.id, "qa-admin@dubgrid.test"),
    superAdmin: await loadMember(org.id, "qa-super-admin@dubgrid.test"),
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
       'Correction', 'Fixture', 9999, ARRAY[$2]::bigint[])
     RETURNING id`,
    [fx.orgId, fx.focusAreaId],
  );
  return rows[0].id;
}

async function cellOn(date: string): Promise<string> {
  const { rows: existing } = await db.query<{ id: string }>(
    `SELECT id FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`,
    [empId, date],
  );
  if (existing[0]) return existing[0].id;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, empId, date],
  );
  return rows[0].id;
}

async function writeWorked(date: string, kind: "draft" | "published") {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [await cellOn(date), fx.orgId, kind, [fx.shiftId], [fx.jobId]],
  );
}

/** The period of `from` to `to` days from today counts as published. */
async function publishedRange(from: number, to: number) {
  await db.query(
    `INSERT INTO public.publish_history (org_id, published_by, start_date, end_date)
     VALUES ($1, $2, $3, $4)`,
    [fx.orgId, fx.superAdmin.userId, day(from), day(to)],
  );
}

async function asMember(member: Member) {
  await actAsAuthenticated(db, {
    sub: member.userId,
    role: "authenticated",
    org_id: fx.orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
}

async function asSuperuser() {
  await db.query(`RESET ROLE`);
  await db.query(`SELECT set_config('request.jwt.claims', '', true)`);
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

/** Corrects the day to a whole-day absence as `member`. */
async function correct(
  member: Member,
  date: string,
  options: { reason?: string | null; note?: string | null; expectedVersion?: number | null } = {},
): Promise<Error | null> {
  await asMember(member);
  const error = await attempt(
    `SELECT public.correct_schedule_cell(
       $1, $2, $3::date, 'absence', '{}'::bigint[], '{}'::bigint[], $4::bigint,
       NULL, NULL, NULL, $5::bigint, '{}'::boolean[], NULL, NULL, $6, $7)`,
    [
      fx.orgId,
      empId,
      date,
      fx.sickId,
      options.expectedVersion ?? null,
      options.reason === undefined ? "called_off" : options.reason,
      options.note ?? null,
    ],
  );
  await asSuperuser();
  return error;
}

async function cellState(
  date: string,
): Promise<{ draft: string | null; published: string | null }> {
  const { rows } = await db.query<{ kind: string; state: string }>(
    `SELECT s.snapshot_kind AS kind, s.state_kind AS state
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.emp_id = $1 AND c.date = $2`,
    [empId, date],
  );
  const of = (kind: string) => rows.find((row) => row.kind === kind)?.state ?? null;
  return { draft: of("draft"), published: of("published") };
}

async function saveDraft(date: string): Promise<Error | null> {
  await asMember(fx.admin);
  const error = await attempt(
    `SELECT public.write_schedule_cell_snapshot(
       $1, $2, $3::date, 'draft', 'worked', $4::bigint[], $5::bigint[])`,
    [fx.orgId, empId, date, [fx.shiftId], [fx.jobId]],
  );
  await asSuperuser();
  return error;
}

async function clearDraft(date: string): Promise<Error | null> {
  await asMember(fx.admin);
  const error = await attempt(`SELECT public.delete_schedule_cell_draft($1, $2, $3::date)`, [
    fx.orgId,
    empId,
    date,
  ]);
  await asSuperuser();
  return error;
}

describe.skipIf(!reachable)("111 past days not drafted", () => {
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
    for (const migration of MIGRATIONS) await db.query(migration);
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refuses a draft for a day before today and saves today and later", async () => {
    expect(await saveDraft(day(-1))).toMatchObject({ message: expect.stringMatching(PAST) });
    expect(await saveDraft(day(0))).toBeNull();
    expect(await saveDraft(day(3))).toBeNull();
    expect(await cellState(day(-1))).toEqual({ draft: null, published: null });
  });

  it("refuses to clear a past day and clears today", async () => {
    await writeWorked(day(-1), "published");
    await writeWorked(day(0), "published");
    expect(await clearDraft(day(-1))).toMatchObject({ message: expect.stringMatching(PAST) });
    expect(await cellState(day(-1))).toEqual({ draft: null, published: "worked" });
    expect(await clearDraft(day(0))).toBeNull();
    expect(await cellState(day(0))).toEqual({ draft: "deleted", published: "worked" });
  });

  it("refuses to move a shift into or out of a past day", async () => {
    await writeWorked(day(-1), "published");
    await writeWorked(day(1), "published");
    await asMember(fx.admin);
    const move = (from: string, to: string) =>
      attempt(
        `SELECT public.move_shift($1, $2, $3::date, $2, $4::date, 'worked',
           $5::bigint[], $6::bigint[])`,
        [fx.orgId, empId, from, to, [fx.shiftId], [fx.jobId]],
      );
    const intoPast = await move(day(1), day(-2));
    const outOfPast = await move(day(-1), day(2));
    await asSuperuser();
    expect(intoPast).toMatchObject({ message: expect.stringMatching(PAST) });
    expect(outOfPast).toMatchObject({ message: expect.stringMatching(PAST) });
  });

  it("still corrects a past day", async () => {
    await publishedRange(-10, 0);
    await writeWorked(day(-1), "published");
    expect(await correct(fx.admin, day(-1))).toBeNull();
    expect(await cellState(day(-1))).toEqual({ draft: null, published: "absence" });
  });
});
