// @vitest-environment node

/**
 * auto_approve_shift_request (supabase/migrations/030) against the seeded
 * local database. Each case runs inside BEGIN/ROLLBACK and simulates the
 * caller the way PostgREST does (SET LOCAL ROLE + request.jwt.claims), so
 * the session-bound helpers behind the RPCs see a real member.
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

type Member = { userId: string; empId: string; orgRole: "admin" | "super_admin" | "user" };

interface Fixture {
  orgId: string;
  approver: Member; // qa-admin: admin with canApproveShiftRequests
  superAdmin: Member;
  peer: Member; // qa-management: regular user sharing the approver's focus areas
  outsider: Member; // qa-regular: regular user in another focus area
  focusAreaId: number;
  shiftId: number;
  jobId: number;
  absenceTypeId: number;
  date: string;
  otherDate: string;
}

let db: Client;

async function loadMember(orgId: string, email: string): Promise<Member> {
  const { rows } = await db.query<{ user_id: string; emp_id: string; org_role: Member["orgRole"] }>(
    `SELECT u.id AS user_id, e.id AS emp_id, m.org_role
       FROM auth.users u
       JOIN public.organization_memberships m ON m.user_id = u.id AND m.org_id = $1
       JOIN public.employees e ON e.user_id = u.id AND e.org_id = $1
      WHERE u.email = $2`,
    [orgId, email],
  );
  if (rows.length === 0) throw new Error(`${email} is not seeded on Calm Haven`);
  return { userId: rows[0].user_id, empId: rows[0].emp_id, orgRole: rows[0].org_role };
}

async function loadFixture(): Promise<Fixture> {
  const { rows: orgs } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  if (orgs.length === 0) throw new Error("Calm Haven is not seeded, run npm run db:reset");
  const orgId = orgs[0].id;

  const approver = await loadMember(orgId, "qa-admin@dubgrid.test");
  const superAdmin = await loadMember(orgId, "qa-super-admin@dubgrid.test");
  const peer = await loadMember(orgId, "qa-management@dubgrid.test");
  const outsider = await loadMember(orgId, "qa-regular@dubgrid.test");

  const { rows: segments } = await db.query<{
    focus_area_id: number;
    shift_id: number;
    job_id: number;
  }>(
    `SELECT sc.focus_area_id, sc.id AS shift_id, j.id AS job_id
       FROM public.employees e
       JOIN public.shift_categories sc
         ON sc.org_id = e.org_id AND sc.archived_at IS NULL
        AND sc.focus_area_id = ANY(e.focus_area_ids)
       JOIN public.jobs j ON j.org_id = e.org_id AND j.archived_at IS NULL
      WHERE e.id = $1
      ORDER BY sc.focus_area_id, sc.id, j.id
      LIMIT 1`,
    [approver.empId],
  );
  if (segments.length === 0) throw new Error("No shift/job pair in the approver's focus area");

  // The seed hands the QA accounts their focus areas at random, so give the
  // peer the approver's one here (rolled back with the test) rather than
  // hoping they overlap. Swaps and targeted pickups check both sides.
  await db.query(
    `UPDATE public.employees
        SET focus_area_ids = array_append(array_remove(focus_area_ids, $2::bigint), $2::bigint)
      WHERE id = $1`,
    [peer.empId, segments[0].focus_area_id],
  );

  const { rows: absences } = await db.query<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  if (absences.length === 0) throw new Error("No absence type seeded");

  return {
    orgId,
    approver,
    superAdmin,
    peer,
    outsider,
    focusAreaId: Number(segments[0].focus_area_id),
    shiftId: Number(segments[0].shift_id),
    jobId: Number(segments[0].job_id),
    absenceTypeId: Number(absences[0].id),
    // Far enough out that no seeded publish or request can collide.
    date: "2031-04-14",
    otherDate: "2031-04-16",
  };
}

async function asUser(member: Member, orgId: string): Promise<void> {
  const claims = JSON.stringify({
    sub: member.userId,
    role: "authenticated",
    mfa_enrolled: false,
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
}

async function asSuperuser(): Promise<void> {
  // Inside an aborted transaction even RESET fails; the savepoint rollback
  // in expectRaise restores the session role for us.
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

async function publishAbsenceCell(fx: Fixture, empId: string): Promise<void> {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, 'published', 'absence', '{}', '{}', $4::bigint,
       NULL, NULL, NULL, FALSE, $5::bigint, NULL, $6, '{}')`,
    [fx.orgId, empId, fx.date, fx.absenceTypeId, fx.focusAreaId, fx.superAdmin.userId],
  );
}

async function publishWorkedCell(fx: Fixture, empId: string, date = fx.date): Promise<void> {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, 'published', 'worked', ARRAY[$4::bigint], ARRAY[$5::bigint],
       NULL, NULL, NULL, NULL, FALSE, $6::bigint, NULL, $7, ARRAY[false])`,
    [fx.orgId, empId, date, fx.shiftId, fx.jobId, fx.focusAreaId, fx.superAdmin.userId],
  );
}

type RequestSpec =
  | { type: "calloff" }
  | { type: "pickup"; targetEmpId?: string }
  | { type: "swap"; targetEmpId: string };

async function createRequest(fx: Fixture, actor: Member, spec: RequestSpec): Promise<string> {
  const targeted = spec.type !== "calloff" && spec.targetEmpId != null;
  await asUser(actor, fx.orgId);
  const { rows } = await db.query<{ id: string }>(
    `SELECT public.create_shift_request($1, $2::public.shift_request_type, $3, $4::date,
       $5, $6::date, gen_random_uuid(), $7, NULL, NULL) AS id`,
    [
      fx.orgId,
      spec.type,
      actor.empId,
      fx.date,
      targeted ? spec.targetEmpId : null,
      targeted ? (spec.type === "swap" ? fx.otherDate : fx.date) : null,
      spec.type === "calloff" || (spec.type === "pickup" && targeted) ? fx.absenceTypeId : null,
    ],
  );
  await asSuperuser();
  return rows[0].id;
}

async function respond(fx: Fixture, actor: Member, requestId: string, accept: boolean) {
  await asUser(actor, fx.orgId);
  await db.query(`SELECT public.respond_to_shift_request($1, $2, $3)`, [
    requestId,
    actor.empId,
    accept,
  ]);
  await asSuperuser();
}

/** Runs a call expected to raise without aborting the enclosing transaction. */
async function expectRaise(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await db.query("SAVEPOINT expected_failure");
  try {
    await expect(run()).rejects.toThrow(pattern);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT expected_failure");
    await asSuperuser();
  }
}

async function autoApprove(
  fx: Fixture,
  actor: Member,
  requestId: string,
): Promise<{ approverUserId: string; adminNote: string } | null> {
  await asUser(actor, fx.orgId);
  try {
    const { rows } = await db.query<{
      result: { approverUserId: string; adminNote: string } | null;
    }>(`SELECT public.auto_approve_shift_request($1) AS result`, [requestId]);
    return rows[0].result;
  } finally {
    await asSuperuser();
  }
}

async function readRequest(id: string) {
  const { rows } = await db.query<{
    status: string;
    admin_user_id: string | null;
    admin_note: string | null;
    target_emp_id: string | null;
  }>(
    `SELECT status, admin_user_id, admin_note, target_emp_id FROM public.shift_requests WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function readPublishedStateKind(fx: Fixture, empId: string): Promise<string | null> {
  const { rows } = await db.query<{ state_kind: string | null }>(
    `SELECT state_kind FROM public.get_schedule_cell_snapshot_payload($1, $2, $3::date, 'published')`,
    [fx.orgId, empId, fx.date],
  );
  return rows[0]?.state_kind ?? null;
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("auto_approve_shift_request (live DB)", () => {
  it("approves an approver's own call-off on the spot, attributed to them", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.approver.empId);
      const requestId = await createRequest(fx, fx.approver, { type: "calloff" });
      expect((await readRequest(requestId)).status).toBe("pending_approval");

      const result = await autoApprove(fx, fx.approver, requestId);
      expect(result?.approverUserId).toBe(fx.approver.userId);
      expect(result?.adminNote).toMatch(/^Auto-approved: .+ can approve shift requests$/);

      const request = await readRequest(requestId);
      expect(request.status).toBe("approved");
      expect(request.admin_user_id).toBe(fx.approver.userId);
      expect(request.admin_note).toBe(result?.adminNote);
      expect(await readPublishedStateKind(fx, fx.approver.empId)).toBe("absence");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("leaves a regular member's call-off in the queue", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.peer.empId);
      const requestId = await createRequest(fx, fx.peer, { type: "calloff" });

      expect(await autoApprove(fx, fx.peer, requestId)).toBeNull();
      const request = await readRequest(requestId);
      expect(request.status).toBe("pending_approval");
      expect(request.admin_user_id).toBeNull();
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("approves a targeted pickup the moment its recipient accepts, attributed to the approver", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.approver.empId);
      await publishAbsenceCell(fx, fx.peer.empId);
      const requestId = await createRequest(fx, fx.approver, {
        type: "pickup",
        targetEmpId: fx.peer.empId,
      });
      expect((await readRequest(requestId)).status).toBe("open");

      await respond(fx, fx.peer, requestId, true);
      expect((await readRequest(requestId)).status).toBe("pending_approval");

      const result = await autoApprove(fx, fx.peer, requestId);
      expect(result?.approverUserId).toBe(fx.approver.userId);

      const request = await readRequest(requestId);
      expect(request.status).toBe("approved");
      expect(request.admin_user_id).toBe(fx.approver.userId);
      expect(request.target_emp_id).toBe(fx.peer.empId);
      expect(await readPublishedStateKind(fx, fx.peer.empId)).toBe("worked");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("approves a swap once the regular member accepts the approver's offer", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.approver.empId);
      await publishWorkedCell(fx, fx.peer.empId, fx.otherDate);
      const requestId = await createRequest(fx, fx.approver, {
        type: "swap",
        targetEmpId: fx.peer.empId,
      });

      await respond(fx, fx.peer, requestId, true);
      const result = await autoApprove(fx, fx.peer, requestId);
      expect(result?.approverUserId).toBe(fx.approver.userId);
      expect((await readRequest(requestId)).status).toBe("approved");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("approves a swap the approver accepts from a regular member, attributed to the approver", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.peer.empId);
      await publishWorkedCell(fx, fx.approver.empId, fx.otherDate);
      const requestId = await createRequest(fx, fx.peer, {
        type: "swap",
        targetEmpId: fx.approver.empId,
      });

      await respond(fx, fx.approver, requestId, true);
      const result = await autoApprove(fx, fx.approver, requestId);
      expect(result?.approverUserId).toBe(fx.approver.userId);
      expect((await readRequest(requestId)).admin_user_id).toBe(fx.approver.userId);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("does not let a call-off's open pickup inherit the absent approver's rights", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.approver.empId);
      const calloffId = await createRequest(fx, fx.approver, { type: "calloff" });
      await autoApprove(fx, fx.approver, calloffId);

      // The row the publish path produces for a claimed vacated shift.
      const { rows: children } = await db.query<{ id: string }>(
        `UPDATE public.shift_requests
            SET status = 'pending_approval', target_emp_id = $2, target_shift_date = requester_shift_date,
                absence_type_id = $3, resolved_at = NULL, admin_note = NULL
          WHERE parent_request_id = $1
          RETURNING id`,
        [calloffId, fx.peer.empId, fx.absenceTypeId],
      );
      expect(children).toHaveLength(1);

      expect(await autoApprove(fx, fx.peer, children[0].id)).toBeNull();
      expect((await readRequest(children[0].id)).status).toBe("pending_approval");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("refuses a caller who is neither a party nor a manager", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.peer.empId);
      const requestId = await createRequest(fx, fx.peer, { type: "calloff" });

      await expectRaise(() => autoApprove(fx, fx.outsider, requestId), /Unauthorized/);
      expect((await readRequest(requestId)).status).toBe("pending_approval");
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps manual approval working for managers and closed to members", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await publishWorkedCell(fx, fx.peer.empId);
      const requestId = await createRequest(fx, fx.peer, { type: "calloff" });

      await expectRaise(async () => {
        await asUser(fx.outsider, fx.orgId);
        await db.query(`SELECT public.resolve_shift_request($1, TRUE, NULL)`, [requestId]);
      }, /Unauthorized/);
      expect((await readRequest(requestId)).status).toBe("pending_approval");

      await asUser(fx.superAdmin, fx.orgId);
      await db.query(`SELECT public.resolve_shift_request($1, TRUE, 'ok')`, [requestId]);
      await asSuperuser();
      const request = await readRequest(requestId);
      expect(request.status).toBe("approved");
      expect(request.admin_user_id).toBe(fx.superAdmin.userId);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps the parameterised resolver out of reach of clients", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      for (const call of [
        `SELECT public.resolve_shift_request_unchecked(gen_random_uuid(), TRUE, NULL, $1)`,
        `SELECT public.resolve_shift_request_checked(gen_random_uuid(), TRUE, NULL, $1)`,
        `SELECT public.user_can_approve_shift_requests($1, $1)`,
      ]) {
        await expectRaise(async () => {
          await asUser(fx.superAdmin, fx.orgId);
          await db.query(call, [fx.superAdmin.userId]);
        }, /permission denied/);
      }
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
