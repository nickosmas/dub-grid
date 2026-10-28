// @vitest-environment node

/**
 * Migration 108: offboarding someone puts a pickup they claimed back up for
 * others and still expires everything else they're part of, and the repair
 * archives a membership left live for someone offboarded. Each case runs 108
 * from its file inside BEGIN/ROLLBACK against the seeded local database.
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
    await probe.query("SELECT 1 FROM public.shift_requests LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const MIGRATION = readFileSync(migrationPath("108_one_offboard.sql"), "utf8");

// A day no seeded request or cell uses, so nothing else conflicts.
const DAY = "2099-03-09";

interface Fixture {
  orgId: string;
  leavingId: string;
  colleagueId: string;
  bystanderId: string;
  absenceTypeId: number;
}

let db: Client;
let fx: Fixture;

async function loadFixture(): Promise<Fixture> {
  const { rows } = await db.query<{ orgId: string; ids: string[]; absenceTypeId: number }>(
    `SELECT o.id AS "orgId",
            (SELECT array_agg(e.id ORDER BY e.seniority, e.id) FROM (
               SELECT e.id, e.seniority FROM public.employees e
                WHERE e.org_id = o.id AND e.status = 'active' AND e.archived_at IS NULL
                  AND e.suspended_at IS NULL AND cardinality(e.focus_area_ids) > 0
                ORDER BY e.seniority, e.id LIMIT 3) e) AS ids,
            (SELECT a.id FROM public.absence_types a WHERE a.org_id = o.id ORDER BY a.id LIMIT 1)
              AS "absenceTypeId"
       FROM public.organizations o WHERE o.slug = 'calmhaven'`,
  );
  const row = rows[0];
  if (!row || (row.ids ?? []).length < 3 || row.absenceTypeId == null) {
    throw new Error("Calm Haven needs three schedulable people. Run npm run db:reset");
  }
  const [leavingId, colleagueId, bystanderId] = row.ids;
  return {
    orgId: row.orgId,
    leavingId,
    colleagueId,
    bystanderId,
    absenceTypeId: row.absenceTypeId,
  };
}

interface RequestRow {
  status: string;
  targetEmpId: string | null;
  targetShiftDate: string | null;
  resolvedAt: string | null;
  adminNote: string | null;
}

async function insertRequest(fields: {
  type: "pickup" | "calloff" | "swap";
  status: string;
  requester: string;
  target?: string | null;
  absenceTypeId?: number | null;
}): Promise<string> {
  // A swap's insert trigger checks both schedule states against real cells,
  // which this test has no use for; skip triggers for that one write.
  if (fields.type === "swap") await db.query("SET LOCAL session_replication_role = replica");
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.shift_requests
       (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
        target_emp_id, target_shift_date, absence_type_id, resolved_at)
     VALUES ($1, $2::public.shift_request_type, $3::public.shift_request_status, $4, $5::date,
             '{}'::jsonb, $6::uuid, CASE WHEN $6::uuid IS NULL THEN NULL ELSE $5::date END, $7::bigint,
             CASE WHEN $3::public.shift_request_status IN ('approved', 'rejected', 'cancelled', 'expired')
               THEN now() END)
     RETURNING id`,
    [
      fx.orgId,
      fields.type,
      fields.status,
      fields.requester,
      DAY,
      fields.target ?? null,
      fields.absenceTypeId ?? null,
    ],
  );
  if (fields.type === "swap") await db.query("SET LOCAL session_replication_role = origin");
  return rows[0].id;
}

async function readRequest(id: string): Promise<RequestRow> {
  const { rows } = await db.query<RequestRow>(
    `SELECT status, target_emp_id AS "targetEmpId", target_shift_date::text AS "targetShiftDate",
            resolved_at AS "resolvedAt", admin_note AS "adminNote"
       FROM public.shift_requests WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function offboard(empId = fx.leavingId) {
  await db.query(
    `UPDATE public.employees SET status = 'removed', archived_at = now() WHERE id = $1`,
    [empId],
  );
}

describe.skipIf(!reachable)("108 one Offboard", () => {
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
    await db.query(MIGRATION);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("puts a pickup they claimed back up for others", async () => {
    const claimed = await insertRequest({
      type: "pickup",
      status: "pending_approval",
      requester: fx.colleagueId,
      target: fx.leavingId,
    });

    await offboard();

    expect(await readRequest(claimed)).toEqual({
      status: "open",
      targetEmpId: null,
      targetShiftDate: null,
      resolvedAt: null,
      adminNote: null,
    });
  });

  it("still expires what they asked for and what was offered to them by name", async () => {
    const theirCalloff = await insertRequest({
      type: "calloff",
      status: "open",
      requester: fx.leavingId,
      absenceTypeId: fx.absenceTypeId,
    });
    const offeredToThem = await insertRequest({
      type: "pickup",
      status: "open",
      requester: fx.colleagueId,
      target: fx.leavingId,
      absenceTypeId: fx.absenceTypeId,
    });
    const swapWithThem = await insertRequest({
      type: "swap",
      status: "pending_approval",
      requester: fx.colleagueId,
      target: fx.leavingId,
    });
    const bystanders = await insertRequest({
      type: "calloff",
      status: "open",
      requester: fx.bystanderId,
      absenceTypeId: fx.absenceTypeId,
    });

    await offboard();

    for (const id of [theirCalloff, offeredToThem, swapWithThem]) {
      expect((await readRequest(id)).status).toBe("expired");
    }
    expect((await readRequest(bystanders)).status).toBe("open");
  });

  it("archives a membership left live for someone offboarded, and only theirs", async () => {
    const { rows } = await db.query<{ userId: string; empId: string }>(
      `SELECT m.user_id AS "userId", e.id AS "empId"
         FROM public.organization_memberships m
         JOIN public.employees e ON e.org_id = m.org_id AND e.user_id = m.user_id
        WHERE m.org_id = $1 AND m.archived_at IS NULL AND m.org_role = 'user'
          AND e.status = 'active'
        ORDER BY e.seniority, e.id LIMIT 2`,
      [fx.orgId],
    );
    if (rows.length < 2) throw new Error("Calm Haven needs two linked Users. Run npm run db:reset");
    const [left, stays] = rows;
    // As an Admin's Offboard left them before 51k: the row offboarded, the
    // membership live. Triggers off so only the row changes.
    await db.query("SET LOCAL session_replication_role = replica");
    await db.query(
      `UPDATE public.employees
          SET status = 'removed', archived_at = '2026-10-01T12:00:00Z'
        WHERE id = $1`,
      [left.empId],
    );
    await db.query("SET LOCAL session_replication_role = origin");

    await db.query(MIGRATION);

    const { rows: after } = await db.query<{ userId: string; archivedAt: string | null }>(
      `SELECT user_id AS "userId", archived_at::text AS "archivedAt"
         FROM public.organization_memberships
        WHERE org_id = $1 AND user_id = ANY($2::uuid[])`,
      [fx.orgId, [left.userId, stays.userId]],
    );
    const byUser = new Map(after.map((row) => [row.userId, row.archivedAt]));
    expect(byUser.get(left.userId)).toBe("2026-10-01 12:00:00+00");
    expect(byUser.get(stays.userId)).toBeNull();
  });
});
