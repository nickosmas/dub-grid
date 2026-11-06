import type { Client } from "pg";
import { actAsAuthenticated } from "./simulated-jwt";

/**
 * Seeded Calm Haven people and one shift and job they can work, for live
 * tests that create, approve and publish requests inside BEGIN/ROLLBACK, as
 * approval-replaces-draft.integration.test.ts does.
 */
export type Member = { userId: string; empId: string; orgRole: "admin" | "super_admin" | "user" };

export interface RequestFixture {
  orgId: string;
  approver: Member;
  superAdmin: Member;
  peer: Member;
  outsider: Member;
  focusAreaId: number;
  shiftId: number;
  jobId: number;
  absenceTypeId: number;
  date: string;
  otherDate: string;
}

async function loadMember(db: Client, orgId: string, email: string): Promise<Member> {
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

/** Call inside the test's transaction: it moves the peer and outsider into the approver's focus area. */
export async function loadRequestFixture(db: Client): Promise<RequestFixture> {
  const { rows: orgs } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  if (orgs.length === 0) throw new Error("Calm Haven is not seeded, run npm run db:reset");
  const orgId = orgs[0].id;

  const approver = await loadMember(db, orgId, "qa-admin@dubgrid.test");
  const superAdmin = await loadMember(db, orgId, "qa-super-admin@dubgrid.test");
  const peer = await loadMember(db, orgId, "qa-management@dubgrid.test");
  const outsider = await loadMember(db, orgId, "qa-regular@dubgrid.test");

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

  for (const member of [peer, outsider]) {
    await db.query(
      `UPDATE public.employees
          SET focus_area_ids = array_append(array_remove(focus_area_ids, $2::bigint), $2::bigint)
        WHERE id = $1`,
      [member.empId, segments[0].focus_area_id],
    );
  }

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
    date: "2031-05-12",
    otherDate: "2031-05-14",
  };
}

export async function asUser(db: Client, member: Member, orgId: string): Promise<void> {
  await actAsAuthenticated(db, {
    sub: member.userId,
    role: "authenticated",
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
}

export async function asSuperuser(db: Client): Promise<void> {
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

export async function writeWorked(
  db: Client,
  fx: RequestFixture,
  kind: "draft" | "published",
  empId: string,
  date: string,
): Promise<void> {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, $4, 'worked', ARRAY[$5::bigint], ARRAY[$6::bigint],
       NULL, NULL, NULL, NULL, FALSE, $7::bigint, NULL, $8, ARRAY[false])`,
    [fx.orgId, empId, date, kind, fx.shiftId, fx.jobId, fx.focusAreaId, fx.superAdmin.userId],
  );
}

type RequestSpec =
  | { type: "calloff" }
  | { type: "pickup"; targetEmpId: string }
  | { type: "swap"; targetEmpId: string };

export async function createRequest(
  db: Client,
  fx: RequestFixture,
  actor: Member,
  spec: RequestSpec,
): Promise<string> {
  const targeted = spec.type !== "calloff";
  await asUser(db, actor, fx.orgId);
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
      spec.type === "swap" ? null : fx.absenceTypeId,
    ],
  );
  await asSuperuser(db);
  return rows[0].id;
}

export async function respond(
  db: Client,
  fx: RequestFixture,
  actor: Member,
  requestId: string,
): Promise<void> {
  await asUser(db, actor, fx.orgId);
  await db.query(`SELECT public.respond_to_shift_request($1, $2, TRUE)`, [requestId, actor.empId]);
  await asSuperuser(db);
}

export async function resolveRequest(
  db: Client,
  fx: RequestFixture,
  requestId: string,
  approved: boolean,
): Promise<void> {
  await asUser(db, fx.superAdmin, fx.orgId);
  await db.query(`SELECT public.resolve_shift_request($1, $2, NULL)`, [requestId, approved]);
  await asSuperuser(db);
}

export async function requestStatus(db: Client, requestId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM public.shift_requests WHERE id = $1`,
    [requestId],
  );
  return rows[0].status;
}

export async function publishedKind(
  db: Client,
  fx: RequestFixture,
  empId: string,
  date: string,
): Promise<string | null> {
  const { rows } = await db.query<{ state_kind: string | null }>(
    `SELECT state_kind FROM public.get_schedule_cell_snapshot_payload($1, $2, $3::date, 'published')`,
    [fx.orgId, empId, date],
  );
  return rows[0]?.state_kind ?? null;
}
