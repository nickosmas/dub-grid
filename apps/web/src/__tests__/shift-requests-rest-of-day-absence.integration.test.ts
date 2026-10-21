// @vitest-environment node

/**
 * Shift requests on a worked cell that carries an absence for the rest of the
 * day (supabase/migrations/085) against the seeded local database. Each case
 * runs inside BEGIN/ROLLBACK and acts as a real member the way PostgREST does.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

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
  approver: Member; // qa-admin, who claims and swaps
  superAdmin: Member; // approves
  peer: Member; // qa-management, the requester
  focusAreaId: number;
  dayShiftId: number;
  eveningShiftId: number;
  jobId: number;
  sickId: number;
  callOffTypeId: number;
  date: string;
  otherDate: string;
}

interface Cell {
  stateKind: string;
  shiftIds: number[];
  absenceTypeId: number | null;
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

  // A double shift needs two shifts of one focus area whose times never meet.
  const { rows: pairs } = await db.query<{
    focus_area_id: number;
    day_id: number;
    evening_id: number;
    job_id: number;
  }>(
    `SELECT a.focus_area_id, a.id AS day_id, b.id AS evening_id, j.id AS job_id
       FROM public.employees e
       JOIN public.shift_categories a
         ON a.org_id = e.org_id AND a.archived_at IS NULL AND a.focus_area_id = ANY(e.focus_area_ids)
       JOIN public.shift_categories b
         ON b.org_id = e.org_id AND b.archived_at IS NULL AND b.focus_area_id = a.focus_area_id
        AND b.id > a.id
       JOIN public.jobs j ON j.org_id = e.org_id AND j.archived_at IS NULL
      WHERE e.id = $1
        AND NOT public.work_assignment_times_overlap(
          ARRAY[a.id], ARRAY[j.id], NULL, NULL, ARRAY[b.id], ARRAY[j.id], NULL, NULL)
      ORDER BY a.focus_area_id, a.id, b.id, j.id
      LIMIT 1`,
    [approver.empId],
  );
  if (pairs.length === 0) throw new Error("No two separate shifts in the approver's focus area");

  await db.query(
    `UPDATE public.employees
        SET focus_area_ids = array_append(array_remove(focus_area_ids, $2::bigint), $2::bigint)
      WHERE id = $1`,
    [peer.empId, pairs[0].focus_area_id],
  );

  const { rows: absences } = await db.query<{ id: number }>(
    `SELECT id FROM public.absence_types WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 2`,
    [orgId],
  );
  if (absences.length < 2) throw new Error("Two absence types must be seeded");

  return {
    orgId,
    approver,
    superAdmin,
    peer,
    focusAreaId: Number(pairs[0].focus_area_id),
    dayShiftId: Number(pairs[0].day_id),
    eveningShiftId: Number(pairs[0].evening_id),
    jobId: Number(pairs[0].job_id),
    sickId: Number(absences[0].id),
    callOffTypeId: Number(absences[1].id),
    // Far enough out that no seeded publish or request can collide.
    date: "2031-05-12",
    otherDate: "2031-05-14",
  };
}

async function asUser(member: Member, orgId: string): Promise<void> {
  await actAsAuthenticated(db, {
    sub: member.userId,
    role: "authenticated",
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
}

async function asSuperuser(): Promise<void> {
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

async function publishCell(
  fx: Fixture,
  empId: string,
  date: string,
  shiftIds: number[],
  absenceTypeId: number | null,
): Promise<void> {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, 'published', $4, $5::bigint[], $6::bigint[], $7::bigint,
       NULL, NULL, NULL, FALSE, $8::bigint, NULL, $9, $10::boolean[])`,
    [
      fx.orgId,
      empId,
      date,
      shiftIds.length > 0 ? "worked" : "absence",
      shiftIds,
      shiftIds.map(() => fx.jobId),
      absenceTypeId,
      fx.focusAreaId,
      fx.superAdmin.userId,
      shiftIds.map(() => false),
    ],
  );
}

async function readCell(fx: Fixture, empId: string, date: string): Promise<Cell | null> {
  const { rows } = await db.query<{
    state_kind: string | null;
    shift_ids: string[] | null;
    absence_type_id: string | null;
  }>(
    `SELECT state_kind, shift_ids, absence_type_id
       FROM public.get_schedule_cell_snapshot_payload($1, $2, $3::date, 'published')`,
    [fx.orgId, empId, date],
  );
  const row = rows[0];
  if (!row?.state_kind) return null;
  return {
    stateKind: row.state_kind,
    shiftIds: (row.shift_ids ?? []).map(Number),
    absenceTypeId: row.absence_type_id == null ? null : Number(row.absence_type_id),
  };
}

type RequestSpec =
  | { type: "calloff"; shiftId: number }
  | { type: "pickup"; shiftId: number; targetEmpId?: string }
  | { type: "swap"; shiftId: number; targetEmpId: string; targetShiftId: number };

/** The request names a shift by its 0-based place in the published cell. */
async function segmentIndex(fx: Fixture, empId: string, date: string, shiftId: number) {
  const index = (await readCell(fx, empId, date))?.shiftIds.indexOf(shiftId) ?? -1;
  return index < 0 ? null : index;
}

async function createRequest(fx: Fixture, actor: Member, spec: RequestSpec): Promise<string> {
  const requesterIndex = await segmentIndex(fx, actor.empId, fx.date, spec.shiftId);
  const targetIndex =
    spec.type === "swap"
      ? await segmentIndex(fx, spec.targetEmpId, fx.otherDate, spec.targetShiftId)
      : null;
  await asUser(actor, fx.orgId);
  try {
    const { rows } = await db.query<{ id: string }>(
      `SELECT public.create_shift_request($1, $2::public.shift_request_type, $3, $4::date,
         $5, $6::date, gen_random_uuid(), $7, $8, $9) AS id`,
      [
        fx.orgId,
        spec.type,
        actor.empId,
        fx.date,
        spec.type === "calloff" ? null : (spec.targetEmpId ?? null),
        spec.type === "swap"
          ? fx.otherDate
          : spec.type === "pickup" && spec.targetEmpId
            ? fx.date
            : null,
        spec.type === "swap" || (spec.type === "pickup" && !spec.targetEmpId)
          ? null
          : fx.callOffTypeId,
        requesterIndex,
        targetIndex,
      ],
    );
    return rows[0].id;
  } finally {
    await asSuperuser();
  }
}

async function claim(fx: Fixture, claimer: Member, requestId: string): Promise<void> {
  await asUser(claimer, fx.orgId);
  try {
    await db.query(`SELECT public.claim_shift_request($1, $2)`, [requestId, claimer.empId]);
  } finally {
    await asSuperuser();
  }
}

async function respond(fx: Fixture, actor: Member, requestId: string): Promise<void> {
  await asUser(actor, fx.orgId);
  try {
    await db.query(`SELECT public.respond_to_shift_request($1, $2, true)`, [
      requestId,
      actor.empId,
    ]);
  } finally {
    await asSuperuser();
  }
}

async function approve(fx: Fixture, requestId: string): Promise<void> {
  await asUser(fx.superAdmin, fx.orgId);
  try {
    await db.query(`SELECT public.resolve_shift_request($1, true, NULL)`, [requestId]);
  } finally {
    await asSuperuser();
  }
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

async function inTransaction(body: (fx: Fixture) => Promise<void>): Promise<void> {
  await db.query("BEGIN");
  try {
    await body(await loadFixture());
  } finally {
    await db.query("ROLLBACK");
  }
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("shift requests on a cell with a rest-of-day absence (live DB)", () => {
  it("calls off one half of D/E/Sick and keeps the other half with the absence", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId, fx.eveningShiftId], fx.sickId);
      const requestId = await createRequest(fx, fx.peer, {
        type: "calloff",
        shiftId: fx.dayShiftId,
      });
      await approve(fx, requestId);

      expect(await readCell(fx, fx.peer.empId, fx.date)).toEqual({
        stateKind: "worked",
        shiftIds: [fx.eveningShiftId],
        absenceTypeId: fx.sickId,
      });
    }));

  it("hands over the only shift of D/Sick, and the owner takes the request's absence for the day", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId], fx.sickId);
      await publishCell(fx, fx.approver.empId, fx.date, [], fx.sickId);
      const requestId = await createRequest(fx, fx.peer, {
        type: "pickup",
        shiftId: fx.dayShiftId,
        targetEmpId: fx.approver.empId,
      });
      await respond(fx, fx.approver, requestId);
      await approve(fx, requestId);

      expect(await readCell(fx, fx.peer.empId, fx.date)).toEqual({
        stateKind: "absence",
        shiftIds: [],
        absenceTypeId: fx.callOffTypeId,
      });
      expect(await readCell(fx, fx.approver.empId, fx.date)).toEqual({
        stateKind: "worked",
        shiftIds: [fx.dayShiftId],
        absenceTypeId: null,
      });
    }));

  it("hands over one half of D/E/Sick and keeps the absence after the other", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId, fx.eveningShiftId], fx.sickId);
      await publishCell(fx, fx.approver.empId, fx.date, [], fx.sickId);
      const requestId = await createRequest(fx, fx.peer, {
        type: "pickup",
        shiftId: fx.dayShiftId,
        targetEmpId: fx.approver.empId,
      });
      await respond(fx, fx.approver, requestId);
      await approve(fx, requestId);

      expect(await readCell(fx, fx.peer.empId, fx.date)).toEqual({
        stateKind: "worked",
        shiftIds: [fx.eveningShiftId],
        absenceTypeId: fx.sickId,
      });
    }));

  it("lets nobody absent for the rest of the day be the target of a pickup", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.eveningShiftId], null);
      await publishCell(fx, fx.approver.empId, fx.date, [fx.dayShiftId], fx.sickId);
      await expectRaise(
        () =>
          createRequest(fx, fx.peer, {
            type: "pickup",
            shiftId: fx.eveningShiftId,
            targetEmpId: fx.approver.empId,
          }),
        /Target employee has no published absence/,
      );
    }));

  it("swaps a shift away from D/Sick on another day, and each side keeps its own absence", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId], fx.sickId);
      await publishCell(fx, fx.approver.empId, fx.otherDate, [fx.eveningShiftId], fx.sickId);
      const requestId = await createRequest(fx, fx.peer, {
        type: "swap",
        shiftId: fx.dayShiftId,
        targetEmpId: fx.approver.empId,
        targetShiftId: fx.eveningShiftId,
      });
      await respond(fx, fx.approver, requestId);
      await approve(fx, requestId);

      expect(await readCell(fx, fx.peer.empId, fx.date)).toEqual({
        stateKind: "absence",
        shiftIds: [],
        absenceTypeId: fx.sickId,
      });
      expect(await readCell(fx, fx.peer.empId, fx.otherDate)).toMatchObject({
        shiftIds: [fx.eveningShiftId],
        absenceTypeId: null,
      });
      expect(await readCell(fx, fx.approver.empId, fx.otherDate)).toEqual({
        stateKind: "absence",
        shiftIds: [],
        absenceTypeId: fx.sickId,
      });
      expect(await readCell(fx, fx.approver.empId, fx.date)).toMatchObject({
        shiftIds: [fx.dayShiftId],
        absenceTypeId: null,
      });
    }));

  it("still refuses a request on a whole-day absence", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [], fx.sickId);
      await expectRaise(
        () => createRequest(fx, fx.peer, { type: "pickup", shiftId: fx.dayShiftId }),
        /No published shift found/,
      );
    }));

  it("refuses a claim from someone absent for the rest of that day", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.eveningShiftId], null);
      await publishCell(fx, fx.approver.empId, fx.date, [fx.dayShiftId], fx.sickId);
      const requestId = await createRequest(fx, fx.peer, {
        type: "pickup",
        shiftId: fx.eveningShiftId,
      });
      await expectRaise(
        () => claim(fx, fx.approver, requestId),
        /You are absent for the rest of this day/,
      );
    }));

  it("refuses a swap that hands a shift to someone absent for the rest of that day", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId], null);
      await publishCell(fx, fx.approver.empId, fx.otherDate, [fx.eveningShiftId], null);
      await publishCell(fx, fx.approver.empId, fx.date, [fx.eveningShiftId], fx.sickId);
      await expectRaise(
        () =>
          createRequest(fx, fx.peer, {
            type: "swap",
            shiftId: fx.dayShiftId,
            targetEmpId: fx.approver.empId,
            targetShiftId: fx.eveningShiftId,
          }),
        /Cannot swap: they are absent for the rest of that day/,
      );
    }));

  it("refuses at approval a swap whose requester became absent for the rest of the other day", () =>
    inTransaction(async (fx) => {
      await publishCell(fx, fx.peer.empId, fx.date, [fx.dayShiftId], null);
      await publishCell(fx, fx.approver.empId, fx.otherDate, [fx.eveningShiftId], null);
      const requestId = await createRequest(fx, fx.peer, {
        type: "swap",
        shiftId: fx.dayShiftId,
        targetEmpId: fx.approver.empId,
        targetShiftId: fx.eveningShiftId,
      });
      await respond(fx, fx.approver, requestId);
      await publishCell(fx, fx.peer.empId, fx.otherDate, [fx.dayShiftId], fx.sickId);

      await expectRaise(
        () => approve(fx, requestId),
        /requester is absent for the rest of the target's date/,
      );
    }));
});
