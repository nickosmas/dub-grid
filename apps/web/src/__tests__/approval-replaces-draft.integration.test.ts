// @vitest-environment node

/**
 * Migration 086 against the seeded local database: an approval replaces the
 * draft of every cell it publishes, a rejection keeps every draft, and
 * shift_request_draft_cells lists the cells an approver would be warned
 * about. Each case runs inside BEGIN/ROLLBACK with the caller simulated the
 * way PostgREST does. A database that does not have 086 yet gets it inside
 * that transaction, so the shared local stack is never left ahead of dev.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
import { migrationPath } from "./helpers/sql-inventory";

const MIGRATION = readFileSync(migrationPath("086_approval_replaces_draft.sql"), "utf8");

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
  thirdDate: string;
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

  // The seed hands out focus areas at random; give the peer the approver's one
  // (rolled back with the test) so swaps and targeted pickups qualify.
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
    date: "2031-05-12",
    otherDate: "2031-05-14",
    thirdDate: "2031-05-16",
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

async function writeWorked(
  fx: Fixture,
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

async function writeAbsence(
  fx: Fixture,
  kind: "draft" | "published",
  empId: string,
  date: string,
): Promise<void> {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1, $2, $3::date, $4, 'absence', '{}', '{}', $5::bigint,
       NULL, NULL, NULL, FALSE, $6::bigint, NULL, $7, '{}')`,
    [fx.orgId, empId, date, kind, fx.absenceTypeId, fx.focusAreaId, fx.superAdmin.userId],
  );
}

type RequestSpec =
  | { type: "calloff" }
  | { type: "pickup"; targetEmpId: string }
  | { type: "swap"; targetEmpId: string };

async function createRequest(fx: Fixture, actor: Member, spec: RequestSpec): Promise<string> {
  const targeted = spec.type !== "calloff";
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
      spec.type === "swap" ? null : fx.absenceTypeId,
    ],
  );
  await asSuperuser();
  return rows[0].id;
}

async function respond(fx: Fixture, actor: Member, requestId: string): Promise<void> {
  await asUser(actor, fx.orgId);
  await db.query(`SELECT public.respond_to_shift_request($1, $2, TRUE)`, [requestId, actor.empId]);
  await asSuperuser();
}

/** A volunteer pickup needs a published shortfall; the requirement is rolled back. */
async function volunteer(fx: Fixture, actor: Member): Promise<string> {
  await db.query(
    `INSERT INTO public.coverage_requirements
       (org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff)
     VALUES ($1, $2, $3, $4, NULL, 50)`,
    [fx.orgId, fx.focusAreaId, fx.jobId, fx.shiftId],
  );
  await asUser(actor, fx.orgId);
  const { rows } = await db.query<{ id: string }>(
    `SELECT public.volunteer_for_open_shift($1, $2, $3::date, ARRAY[$4::bigint], ARRAY[$5::bigint], $6::bigint) AS id`,
    [fx.orgId, actor.empId, fx.date, fx.shiftId, fx.jobId, fx.focusAreaId],
  );
  await asSuperuser();
  return rows[0].id;
}

async function resolve(fx: Fixture, requestId: string, approved: boolean): Promise<void> {
  await asUser(fx.superAdmin, fx.orgId);
  await db.query(`SELECT public.resolve_shift_request($1, $2, NULL)`, [requestId, approved]);
  await asSuperuser();
}

async function draftCellsAs(fx: Fixture, member: Member, requestId: string) {
  await asUser(member, fx.orgId);
  try {
    const { rows } = await db.query<{ emp_id: string; shift_date: string }>(
      `SELECT emp_id, shift_date::text FROM public.shift_request_draft_cells($1)`,
      [requestId],
    );
    return rows.map((row) => `${row.emp_id}@${row.shift_date}`);
  } finally {
    await asSuperuser();
  }
}

async function hasDraft(fx: Fixture, empId: string, date: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = 'draft'
      WHERE c.org_id = $1 AND c.emp_id = $2 AND c.date = $3::date`,
    [fx.orgId, empId, date],
  );
  return rows.length > 0;
}

async function publishedKind(fx: Fixture, empId: string, date: string): Promise<string | null> {
  const { rows } = await db.query<{ state_kind: string | null }>(
    `SELECT state_kind FROM public.get_schedule_cell_snapshot_payload($1, $2, $3::date, 'published')`,
    [fx.orgId, empId, date],
  );
  return rows[0]?.state_kind ?? null;
}

async function status(requestId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM public.shift_requests WHERE id = $1`,
    [requestId],
  );
  return rows[0].status;
}

async function expectRaise(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await db.query("SAVEPOINT expected_failure");
  try {
    await expect(run()).rejects.toThrow(pattern);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT expected_failure");
    await asSuperuser();
  }
}

async function inTransaction(run: (fx: Fixture) => Promise<void>): Promise<void> {
  await db.query("BEGIN");
  try {
    // Replacing the resolver locks it; a parallel suite then waits its turn.
    await db.query("SET LOCAL lock_timeout = '10s'");
    const { rows } = await db.query<{ applied: boolean }>(
      `SELECT to_regprocedure('public.shift_request_draft_cells(uuid)') IS NOT NULL AS applied`,
    );
    if (!rows[0]?.applied) await db.query(MIGRATION);
    await run(await loadFixture());
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

describe.runIf(reachable)(
  "an approval replaces the draft of every cell it publishes (live DB)",
  () => {
    it("a volunteer pickup replaces the volunteer's earlier draft of that day", () =>
      inTransaction(async (fx) => {
        await writeAbsence(fx, "draft", fx.peer.empId, fx.date);
        await writeAbsence(fx, "draft", fx.peer.empId, fx.thirdDate);
        const requestId = await volunteer(fx, fx.peer);
        expect(await draftCellsAs(fx, fx.superAdmin, requestId)).toEqual([
          `${fx.peer.empId}@${fx.date}`,
        ]);

        await resolve(fx, requestId, true);

        expect(await status(requestId)).toBe("approved");
        expect(await publishedKind(fx, fx.peer.empId, fx.date)).toBe("worked");
        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(false);
        // A day the approval did not publish keeps its draft.
        expect(await hasDraft(fx, fx.peer.empId, fx.thirdDate)).toBe(true);
      }));

    it("a claimed pickup replaces the drafts of both the requester's and the claimer's day", () =>
      inTransaction(async (fx) => {
        // The claimer must be off that day; their draft puts them to work instead.
        await writeWorked(fx, "published", fx.approver.empId, fx.date);
        await writeAbsence(fx, "draft", fx.approver.empId, fx.date);
        await writeAbsence(fx, "published", fx.peer.empId, fx.date);
        await writeWorked(fx, "draft", fx.peer.empId, fx.date);
        const requestId = await createRequest(fx, fx.approver, {
          type: "pickup",
          targetEmpId: fx.peer.empId,
        });
        await respond(fx, fx.peer, requestId);
        // The approver is a party who can approve, so automatic approval may
        // already have run; either way the drafts must be gone once approved.
        if ((await status(requestId)) === "pending_approval") await resolve(fx, requestId, true);

        expect(await status(requestId)).toBe("approved");
        expect(await publishedKind(fx, fx.peer.empId, fx.date)).toBe("worked");
        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(false);
        expect(await hasDraft(fx, fx.approver.empId, fx.date)).toBe(false);
      }));

    it("an automatic approval replaces the drafts the same way", () =>
      inTransaction(async (fx) => {
        await writeWorked(fx, "published", fx.approver.empId, fx.date);
        await writeAbsence(fx, "published", fx.peer.empId, fx.date);
        await writeWorked(fx, "draft", fx.peer.empId, fx.date);
        const requestId = await createRequest(fx, fx.approver, {
          type: "pickup",
          targetEmpId: fx.peer.empId,
        });
        await respond(fx, fx.peer, requestId);
        await asUser(fx.peer, fx.orgId);
        const { rows } = await db.query<{ result: { approverUserId: string } | null }>(
          `SELECT public.auto_approve_shift_request($1) AS result`,
          [requestId],
        );
        await asSuperuser();

        expect(rows[0].result?.approverUserId).toBe(fx.approver.userId);
        expect(await status(requestId)).toBe("approved");
        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(false);
      }));

    it("a swap replaces the drafts of both people on both days", () =>
      inTransaction(async (fx) => {
        await writeWorked(fx, "published", fx.peer.empId, fx.date);
        await writeWorked(fx, "published", fx.outsider.empId, fx.otherDate);
        await db.query(
          `UPDATE public.employees
            SET focus_area_ids = array_append(array_remove(focus_area_ids, $2::bigint), $2::bigint)
          WHERE id = $1`,
          [fx.outsider.empId, fx.focusAreaId],
        );
        for (const [empId, date] of [
          [fx.peer.empId, fx.date],
          [fx.peer.empId, fx.otherDate],
          [fx.outsider.empId, fx.date],
          [fx.outsider.empId, fx.otherDate],
        ] as const) {
          await writeAbsence(fx, "draft", empId, date);
        }
        const requestId = await createRequest(fx, fx.peer, {
          type: "swap",
          targetEmpId: fx.outsider.empId,
        });
        await respond(fx, fx.outsider, requestId);
        expect(await draftCellsAs(fx, fx.superAdmin, requestId)).toHaveLength(4);

        await resolve(fx, requestId, true);

        expect(await status(requestId)).toBe("approved");
        expect(await publishedKind(fx, fx.outsider.empId, fx.date)).toBe("worked");
        expect(await publishedKind(fx, fx.peer.empId, fx.otherDate)).toBe("worked");
        for (const [empId, date] of [
          [fx.peer.empId, fx.date],
          [fx.peer.empId, fx.otherDate],
          [fx.outsider.empId, fx.date],
          [fx.outsider.empId, fx.otherDate],
        ] as const) {
          expect(await hasDraft(fx, empId, date), `${empId}@${date}`).toBe(false);
        }
      }));

    it("a rejection keeps every draft", () =>
      inTransaction(async (fx) => {
        await writeAbsence(fx, "draft", fx.peer.empId, fx.date);
        const requestId = await volunteer(fx, fx.peer);

        await resolve(fx, requestId, false);

        expect(await status(requestId)).toBe("rejected");
        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(true);
      }));

    it("a refused approval keeps every draft", () =>
      inTransaction(async (fx) => {
        await writeAbsence(fx, "draft", fx.peer.empId, fx.date);
        const requestId = await volunteer(fx, fx.peer);
        // The volunteer now has a published shift that day, so the approval is refused.
        await writeWorked(fx, "published", fx.peer.empId, fx.date);

        await expectRaise(
          () => resolve(fx, requestId, true),
          /overlapping shift|no longer available/,
        );

        expect(await status(requestId)).toBe("pending_approval");
        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(true);
      }));

    it("lists only drafts that differ from what is published, and only to approvers", () =>
      inTransaction(async (fx) => {
        await writeWorked(fx, "published", fx.peer.empId, fx.date);
        await writeWorked(fx, "published", fx.outsider.empId, fx.otherDate);
        await db.query(
          `UPDATE public.employees
            SET focus_area_ids = array_append(array_remove(focus_area_ids, $2::bigint), $2::bigint)
          WHERE id = $1`,
          [fx.outsider.empId, fx.focusAreaId],
        );
        // A draft identical to its published snapshot changes nothing.
        await writeWorked(fx, "draft", fx.peer.empId, fx.date);
        await writeAbsence(fx, "draft", fx.outsider.empId, fx.date);
        const requestId = await createRequest(fx, fx.peer, {
          type: "swap",
          targetEmpId: fx.outsider.empId,
        });

        expect(await draftCellsAs(fx, fx.superAdmin, requestId)).toEqual([
          `${fx.outsider.empId}@${fx.date}`,
        ]);
        await expectRaise(() => draftCellsAs(fx, fx.outsider, requestId), /Unauthorized/);
      }));

    it("the discard drops draft notes and restores notes deleted only in the draft", () =>
      inTransaction(async (fx) => {
        const { rows: types } = await db.query<{ id: number }>(
          `INSERT INTO public.indicator_types (org_id, name)
         VALUES ($1, 'Approval test A'), ($1, 'Approval test B') RETURNING id`,
          [fx.orgId],
        );
        await writeWorked(fx, "published", fx.peer.empId, fx.date);
        const { rows: notes } = await db.query<{ id: number; status: string }>(
          `INSERT INTO public.schedule_notes
           (org_id, emp_id, date, indicator_type_id, status, focus_area_id, shift_id, job_id,
            created_by, updated_by)
         VALUES ($1, $2, $3::date, $4, 'draft', $6, $7, $8, $9, $9),
                ($1, $2, $3::date, $5, 'draft_deleted', $6, $7, $8, $9, $9)
         RETURNING id, status`,
          [
            fx.orgId,
            fx.peer.empId,
            fx.date,
            types[0].id,
            types[1].id,
            fx.focusAreaId,
            fx.shiftId,
            fx.jobId,
            fx.superAdmin.userId,
          ],
        );
        // A note can only join a worked shift, so the draft comes after the notes.
        await writeAbsence(fx, "draft", fx.peer.empId, fx.date);
        const { rows: before } = await db.query<{ version: string }>(
          `SELECT version FROM public.schedule_cells WHERE org_id = $1 AND emp_id = $2 AND date = $3::date`,
          [fx.orgId, fx.peer.empId, fx.date],
        );

        await db.query(`SELECT public.discard_schedule_cell_draft_internal($1, $2, $3::date, $4)`, [
          fx.orgId,
          fx.peer.empId,
          fx.date,
          fx.superAdmin.userId,
        ]);
        await db.query("SET CONSTRAINTS ALL IMMEDIATE");

        expect(await hasDraft(fx, fx.peer.empId, fx.date)).toBe(false);
        const { rows: after } = await db.query<{ version: string }>(
          `SELECT version FROM public.schedule_cells WHERE org_id = $1 AND emp_id = $2 AND date = $3::date`,
          [fx.orgId, fx.peer.empId, fx.date],
        );
        expect(Number(after[0].version)).toBe(Number(before[0].version) + 1);
        const { rows: left } = await db.query<{ id: number; status: string }>(
          `SELECT id, status FROM public.schedule_notes WHERE id = ANY($1::bigint[]) ORDER BY id`,
          [notes.map((note) => note.id)],
        );
        expect(left).toEqual([
          { id: notes.find((note) => note.status === "draft_deleted")!.id, status: "published" },
        ]);
      }));

    it("keeps the new helpers out of reach of clients", () =>
      inTransaction(async (fx) => {
        for (const call of [
          `SELECT * FROM public.shift_request_published_cells(gen_random_uuid())`,
          `SELECT public.discard_schedule_cell_draft_internal($1, $1, '2031-05-12', $1)`,
        ]) {
          await expectRaise(async () => {
            await asUser(fx.superAdmin, fx.orgId);
            await db.query(call, call.includes("$1") ? [fx.orgId] : []);
          }, /permission denied/);
        }
      }));
  },
);
