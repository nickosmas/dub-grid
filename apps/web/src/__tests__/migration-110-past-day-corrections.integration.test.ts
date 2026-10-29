// @vitest-environment node

/**
 * Migration 110: a past-day correction (53a) writes one person's published
 * day with an optional typed reason (112), clears its draft, records Before and After, and leaves
 * Publish History alone; it needs Edit shifts and Publish schedule, a day
 * more than 14 days ago needs a Super Admin, and only a day the person could
 * have worked is accepted. The cell-save function stops writing published
 * cells. Each case runs 110 to 112 from their files inside BEGIN/ROLLBACK against the
 * seeded local database, on a person created inside the transaction.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
import { beginWithLocks, policyGrantTables } from "./helpers/migration-locks";
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

const MIGRATIONS = [
  "110_past_day_corrections.sql",
  "111_past_days_not_drafted.sql",
  "112_correction_reason_typed.sql",
].map((name) => readFileSync(migrationPath(name), "utf8"));
const REFUSED = /Employee not found, archived, or inactive/;

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
let lockTables: string[] = [];
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
  options: { reason?: string | null; expectedVersion?: number | null } = {},
): Promise<Error | null> {
  await asMember(member);
  const error = await attempt(
    `SELECT public.correct_schedule_cell(
       $1, $2, $3::date, 'absence', '{}'::bigint[], '{}'::bigint[], $4::bigint,
       NULL, NULL, NULL, $5::bigint, '{}'::boolean[], NULL, NULL, $6)`,
    [
      fx.orgId,
      empId,
      date,
      fx.sickId,
      options.expectedVersion ?? null,
      options.reason === undefined ? "Called off" : options.reason,
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

async function couldWork(date: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT public.employee_could_work_on($1, $2::date) AS ok`,
    [empId, date],
  );
  return rows[0].ok;
}

/** Marks the person Away from `wentAway` days from today until `until`. */
async function markAway(wentAway: number, until: number | null) {
  await db.query(
    `UPDATE public.employees
        SET status = 'inactive', away_until = $2,
            status_changed_at = ($3::date + time '12:00') AT TIME ZONE $4
      WHERE id = $1`,
    [empId, until === null ? null : day(until), day(wentAway), fx.timeZone],
  );
}

describe.skipIf(!reachable)("110 past-day corrections", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    fx = await loadFixture();
    lockTables = await policyGrantTables(db);
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    // 110 and 112 replace the same functions and 110 recreates a policy, so
    // each case holds the corrections table and the policy-grant tables first.
    await beginWithLocks(db, ["public.schedule_cell_corrections", ...lockTables]);
    for (const migration of MIGRATIONS) await db.query(migration);
    // Only the ranges a case publishes count, so "never published" is ours to decide.
    await db.query(`DELETE FROM public.publish_history WHERE org_id = $1`, [fx.orgId]);
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  describe("who could have worked a day", () => {
    it("takes the first day, and refuses the days before it", async () => {
      await db.query(`UPDATE public.employees SET first_day = $2 WHERE id = $1`, [empId, day(-5)]);
      expect(await couldWork(day(-6))).toBe(false);
      expect(await couldWork(day(-5))).toBe(true);
    });

    it("takes an Away person's days before they went away and from their return", async () => {
      await markAway(-3, 5);
      expect(await couldWork(day(-4))).toBe(true);
      expect(await couldWork(day(-3))).toBe(false);
      expect(await couldWork(day(4))).toBe(false);
      expect(await couldWork(day(5))).toBe(true);
    });

    it("never blocks a day for a suspension, and blocks every day once offboarded", async () => {
      await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empId]);
      expect(await couldWork(day(-2))).toBe(true);
      await db.query(`UPDATE public.employees SET archived_at = now() WHERE id = $1`, [empId]);
      expect(await couldWork(day(-2))).toBe(false);
    });
  });

  describe("a correction", () => {
    beforeEach(async () => {
      await publishedRange(-30, 6);
    });

    it("writes the published day, clears its draft and records Before and After", async () => {
      await writeWorked(day(-1), "published");
      await writeWorked(day(-1), "draft");
      const { rows: before } = await db.query(
        `SELECT (SELECT count(*) FROM public.publish_history WHERE org_id = $1) AS publishes,
                (SELECT count(*) FROM public.schedule_publish_changes WHERE org_id = $1) AS changes`,
        [fx.orgId],
      );

      expect(await correct(fx.admin, day(-1), { reason: "  Called out sick at 6 AM " })).toBeNull();

      expect(await cellState(day(-1))).toEqual({ draft: null, published: "absence" });
      const { rows } = await db.query(
        `SELECT reason, before->>'state_kind' AS before_state,
                after->>'state_kind' AS after_state, corrected_by
           FROM public.schedule_cell_corrections WHERE emp_id = $1`,
        [empId],
      );
      expect(rows).toEqual([
        {
          reason: "Called out sick at 6 AM",
          before_state: "worked",
          after_state: "absence",
          corrected_by: fx.admin.userId,
        },
      ]);
      const { rows: after } = await db.query(
        `SELECT (SELECT count(*) FROM public.publish_history WHERE org_id = $1) AS publishes,
                (SELECT count(*) FROM public.schedule_publish_changes WHERE org_id = $1) AS changes`,
        [fx.orgId],
      );
      expect(after).toEqual(before);
    });

    it("lets an Admin correct the last 14 days and a Super Admin any earlier day", async () => {
      expect(await correct(fx.admin, day(-14))).toBeNull();
      expect(await correct(fx.admin, day(-15))).toMatchObject({
        message: expect.stringMatching(/more than 14 days ago needs a Super Admin/),
      });
      expect(await correct(fx.superAdmin, day(-15))).toBeNull();
    });

    it("refuses today and later", async () => {
      for (const offset of [0, 1]) {
        expect(await correct(fx.superAdmin, day(offset))).toMatchObject({
          message: expect.stringMatching(/only a day before today/),
        });
      }
    });

    it("needs Publish schedule as well as Edit shifts", async () => {
      await db.query(
        `UPDATE public.organization_memberships
            SET admin_permissions = admin_permissions || '{"canPublishSchedule": false}'
          WHERE user_id = $1 AND org_id = $2`,
        [fx.admin.userId, fx.orgId],
      );
      expect(await correct(fx.admin, day(-1))).toMatchObject({
        message: expect.stringMatching(/needs Edit shifts and Publish schedule/),
      });
    });

    it("takes a typed reason or none, up to 500 characters", async () => {
      expect(await correct(fx.admin, day(-1), { reason: null })).toBeNull();
      expect(await correct(fx.admin, day(-2), { reason: "   " })).toBeNull();
      expect(await correct(fx.admin, day(-3), { reason: "x".repeat(501) })).toMatchObject({
        message: expect.stringMatching(/longer than 500 characters/),
      });
      const { rows } = await db.query(
        `SELECT reason FROM public.schedule_cell_corrections WHERE emp_id = $1 ORDER BY date`,
        [empId],
      );
      expect(rows).toEqual([{ reason: null }, { reason: null }]);
    });

    it("refuses a stale version", async () => {
      await writeWorked(day(-1), "published");
      expect(await correct(fx.admin, day(-1), { expectedVersion: 7 })).toMatchObject({
        message: expect.stringMatching(/Optimistic lock failed/),
      });
    });

    it("refuses a day that was never published", async () => {
      await db.query(`DELETE FROM public.publish_history WHERE org_id = $1`, [fx.orgId]);
      expect(await correct(fx.admin, day(-1))).toMatchObject({
        message: expect.stringMatching(/never published/),
      });
    });

    it("takes an Away person's day before they went away and refuses one after", async () => {
      await writeWorked(day(-4), "published");
      await markAway(-3, 5);
      expect(await correct(fx.admin, day(-4))).toBeNull();
      expect(await cellState(day(-4))).toMatchObject({ published: "absence" });
      expect(await correct(fx.admin, day(-2))).toMatchObject({
        message: expect.stringMatching(/couldn't have worked that day/),
      });
    });

    it("refuses a day before their first day", async () => {
      await db.query(`UPDATE public.employees SET first_day = $2 WHERE id = $1`, [empId, day(-2)]);
      expect(await correct(fx.admin, day(-3))).toMatchObject({
        message: expect.stringMatching(/couldn't have worked that day/),
      });
    });
  });

  describe("the schedulable-employee trigger", () => {
    it("takes a published past day they could have worked, and nothing else new", async () => {
      await markAway(-3, 5);
      const publishedBefore = await attempt(
        `SELECT public.sync_schedule_cell_snapshot($1, $2, 'published', 'worked', NULL, NULL,
           NULL, $3::bigint[], $4::bigint[])`,
        [await cellOn(day(-4)), fx.orgId, [fx.shiftId], [fx.jobId]],
      );
      expect(publishedBefore).toBeNull();

      const draftBefore = await attempt(
        `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL,
           NULL, $3::bigint[], $4::bigint[])`,
        [await cellOn(day(-4)), fx.orgId, [fx.shiftId], [fx.jobId]],
      );
      expect(draftBefore).toMatchObject({ message: expect.stringMatching(REFUSED) });

      const publishedAway = await attempt(
        `SELECT public.sync_schedule_cell_snapshot($1, $2, 'published', 'worked', NULL, NULL,
           NULL, $3::bigint[], $4::bigint[])`,
        [await cellOn(day(-2)), fx.orgId, [fx.shiftId], [fx.jobId]],
      );
      expect(publishedAway).toMatchObject({ message: expect.stringMatching(REFUSED) });
    });
  });

  describe("the cell-save function", () => {
    it("refuses a published write and still saves a draft", async () => {
      await asMember(fx.admin);
      const published = await attempt(
        `SELECT public.write_schedule_cell_snapshot(
           $1, $2, $3::date, 'published', 'worked', $4::bigint[], $5::bigint[])`,
        [fx.orgId, empId, day(2), [fx.shiftId], [fx.jobId]],
      );
      expect(published).toMatchObject({
        message: expect.stringMatching(/written by publishing, approvals and corrections/),
      });
      const draft = await attempt(
        `SELECT public.write_schedule_cell_snapshot(
           $1, $2, $3::date, 'draft', 'worked', $4::bigint[], $5::bigint[])`,
        [fx.orgId, empId, day(2), [fx.shiftId], [fx.jobId]],
      );
      await asSuperuser();
      expect(draft).toBeNull();
      expect(await cellState(day(2))).toEqual({ draft: "worked", published: null });
    });

    it("keeps the any-kind body away from signed-in callers", async () => {
      await asMember(fx.admin);
      const direct = await attempt(
        `SELECT public.write_schedule_cell_snapshot_any_kind(
           $1, $2, $3::date, 'published', 'worked', $4::bigint[], $5::bigint[])`,
        [fx.orgId, empId, day(2), [fx.shiftId], [fx.jobId]],
      );
      await asSuperuser();
      expect(direct).toMatchObject({ message: expect.stringMatching(/permission denied/) });
    });
  });
});
