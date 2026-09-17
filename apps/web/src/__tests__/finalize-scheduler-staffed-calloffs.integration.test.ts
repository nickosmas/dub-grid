// @vitest-environment node

/**
 * Smoke test for the finalize_scheduler_staffed_calloffs trigger
 * (supabase/migrations/019_finalize_scheduler_staffed_calloffs.sql).
 *
 * The trigger runs AFTER INSERT on schedule_publish_changes, inside
 * publish_schedule's transaction: when a scheduler's published change adds
 * the exact (shift, job) segments an open calloff-backed pickup asks for, on
 * the same date and focus area, the pickup is approved for the staffed
 * employee. It shipped with feature 22 and had never run against real data
 * (build plan item 33); these cases drive it against the seeded local
 * database through the same table writes publish_schedule makes.
 *
 * Every case runs inside BEGIN/ROLLBACK, so the seed is untouched.
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

interface Fixture {
  orgId: string;
  publisherId: string;
  focusAreaId: number;
  requesterEmpId: string;
  targetEmpId: string;
  shiftId: number;
  jobId: number;
  absenceTypeId: number;
  date: string;
}

let db: Client;

/**
 * Real ids from the seed, looked up rather than hard-coded: a focus area with
 * at least two active employees, a (shift, job) pair that org actually
 * schedules, and one of its absence types. The publisher is the QA super
 * admin, never a personal account.
 */
async function loadFixture(): Promise<Fixture> {
  const { rows: orgs } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  if (orgs.length === 0) throw new Error("Calm Haven is not seeded — run npm run db:reset");
  const orgId = orgs[0].id;

  const { rows: publishers } = await db.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
  );
  if (publishers.length === 0) throw new Error("qa-super-admin is not seeded");

  const { rows: pairs } = await db.query<{
    focus_area_id: number;
    requester: string;
    target: string;
  }>(
    `SELECT fa.id AS focus_area_id,
            (array_agg(e.id ORDER BY e.seniority))[1] AS requester,
            (array_agg(e.id ORDER BY e.seniority))[2] AS target
       FROM public.focus_areas fa
       JOIN public.employees e
         ON e.org_id = fa.org_id
        AND e.status = 'active'
        AND e.archived_at IS NULL
        AND fa.id = ANY(e.focus_area_ids)
      WHERE fa.org_id = $1 AND fa.archived_at IS NULL
      GROUP BY fa.id
     HAVING count(*) >= 2
      ORDER BY fa.id
      LIMIT 1`,
    [orgId],
  );
  if (pairs.length === 0) throw new Error("No focus area with two active employees");

  const { rows: segments } = await db.query<{ shift_id: number; job_id: number }>(
    `SELECT sc.id AS shift_id, j.id AS job_id
       FROM public.shift_categories sc
       JOIN public.jobs j ON j.org_id = sc.org_id AND j.archived_at IS NULL
      WHERE sc.org_id = $1 AND sc.archived_at IS NULL AND sc.focus_area_id = $2
      ORDER BY sc.id, j.id
      LIMIT 1`,
    [orgId, pairs[0].focus_area_id],
  );
  if (segments.length === 0) throw new Error("No shift/job pair for that focus area");

  const { rows: absences } = await db.query<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  if (absences.length === 0) throw new Error("No absence type seeded");

  return {
    orgId,
    publisherId: publishers[0].id,
    focusAreaId: Number(pairs[0].focus_area_id),
    requesterEmpId: pairs[0].requester,
    targetEmpId: pairs[0].target,
    shiftId: Number(segments[0].shift_id),
    jobId: Number(segments[0].job_id),
    absenceTypeId: Number(absences[0].id),
    // Far enough out that no seeded publish or request can collide.
    date: "2031-03-10",
  };
}

function workedState(fx: Fixture, jobId = fx.jobId) {
  return JSON.stringify({
    kind: "worked",
    focusAreaId: fx.focusAreaId,
    segments: [{ shiftId: fx.shiftId, jobId, position: 0, isMentored: false }],
  });
}

/** An approved calloff with an open pickup child, the shape the app creates. */
async function seedCalloffPickup(fx: Fixture): Promise<string> {
  const { rows: parents } = await db.query<{ id: string }>(
    `INSERT INTO public.shift_requests
       (org_id, type, status, requester_emp_id, requester_shift_date, requester_state, absence_type_id)
     VALUES ($1, 'calloff', 'approved', $2, $3, $4::jsonb, $5)
     RETURNING id`,
    [fx.orgId, fx.requesterEmpId, fx.date, workedState(fx), fx.absenceTypeId],
  );
  const { rows: pickups } = await db.query<{ id: string }>(
    `INSERT INTO public.shift_requests
       (org_id, type, status, requester_emp_id, requester_shift_date, requester_state, parent_request_id)
     VALUES ($1, 'pickup', 'open', $2, $3, $4::jsonb, $5)
     RETURNING id`,
    [fx.orgId, fx.requesterEmpId, fx.date, workedState(fx), parents[0].id],
  );
  return pickups[0].id;
}

/** What publish_schedule writes for one changed cell. */
async function publishChange(fx: Fixture, toState: string | null, fromState: string | null) {
  const { rows: history } = await db.query<{ id: string }>(
    `INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
     VALUES ($1, $2, $3, $3, 1) RETURNING id`,
    [fx.orgId, fx.publisherId, fx.date],
  );
  await db.query(
    `INSERT INTO public.schedule_publish_changes
       (publish_history_id, org_id, emp_id, date, kind, from_state, to_state)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      history[0].id,
      fx.orgId,
      fx.targetEmpId,
      fx.date,
      fromState ? "modified" : "new",
      fromState,
      toState,
    ],
  );
}

async function readPickup(id: string) {
  const { rows } = await db.query<{
    status: string;
    target_emp_id: string | null;
    target_shift_date: string | null;
    absence_type_id: number | null;
    admin_user_id: string | null;
    admin_note: string | null;
    resolved_at: string | null;
  }>(
    `SELECT status, target_emp_id, to_char(target_shift_date, 'YYYY-MM-DD') AS target_shift_date,
            absence_type_id, admin_user_id, admin_note, resolved_at
       FROM public.shift_requests WHERE id = $1`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("finalize_scheduler_staffed_calloffs (live DB)", () => {
  it("approves the open pickup for the employee whose published change covers it", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const pickupId = await seedCalloffPickup(fx);

      await publishChange(fx, workedState(fx), null);

      const pickup = await readPickup(pickupId);
      expect(pickup.status).toBe("approved");
      expect(pickup.target_emp_id).toBe(fx.targetEmpId);
      expect(pickup.target_shift_date).toBe(fx.date);
      expect(Number(pickup.absence_type_id)).toBe(fx.absenceTypeId);
      expect(pickup.admin_user_id).toBe(fx.publisherId);
      expect(pickup.admin_note).toBe("Assigned through the published schedule");
      expect(pickup.resolved_at).not.toBeNull();
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("only counts segments the publish actually added", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const pickupId = await seedCalloffPickup(fx);

      // Same segment before and after: nothing was added, so nothing is staffed.
      await publishChange(fx, workedState(fx), workedState(fx));

      expect((await readPickup(pickupId)).status).toBe("open");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("leaves the pickup open when the published job does not match", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const { rows: otherJobs } = await db.query<{ id: number }>(
        `SELECT id FROM public.jobs WHERE org_id = $1 AND archived_at IS NULL AND id <> $2 ORDER BY id LIMIT 1`,
        [fx.orgId, fx.jobId],
      );
      if (otherJobs.length === 0) return; // seed has a single job; nothing to contrast

      const pickupId = await seedCalloffPickup(fx);
      await publishChange(fx, workedState(fx, Number(otherJobs[0].id)), null);

      const pickup = await readPickup(pickupId);
      expect(pickup.status).toBe("open");
      expect(pickup.target_emp_id).toBeNull();
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("ignores a published deletion", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const pickupId = await seedCalloffPickup(fx);

      await db.query(
        `INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
         VALUES ($1, $2, $3, $3, 1)`,
        [fx.orgId, fx.publisherId, fx.date],
      );
      const { rows: history } = await db.query<{ id: string }>(
        `SELECT id FROM public.publish_history WHERE org_id = $1 AND start_date = $2 ORDER BY published_at DESC LIMIT 1`,
        [fx.orgId, fx.date],
      );
      await db.query(
        `INSERT INTO public.schedule_publish_changes
           (publish_history_id, org_id, emp_id, date, kind, from_state, to_state)
         VALUES ($1, $2, $3, $4, 'deleted', $5::jsonb, NULL)`,
        [history[0].id, fx.orgId, fx.targetEmpId, fx.date, workedState(fx)],
      );

      expect((await readPickup(pickupId)).status).toBe("open");
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
