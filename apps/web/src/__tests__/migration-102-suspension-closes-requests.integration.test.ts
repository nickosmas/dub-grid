// @vitest-environment node

/**
 * Migration 102: suspending someone closes the requests they made or are the
 * other person on, puts a pickup they claimed back up for others, and leaves
 * everyone else's requests alone. Each case runs 102 from its file inside
 * BEGIN/ROLLBACK against the seeded local database.
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

const MIGRATION = readFileSync(migrationPath("102_suspension_closes_requests.sql"), "utf8");

// A day no seeded request or cell uses, so nothing else conflicts.
const DAY = "2099-03-02";

interface Fixture {
  orgId: string;
  suspendedId: string;
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
  const [suspendedId, colleagueId, bystanderId] = row.ids;
  return {
    orgId: row.orgId,
    suspendedId,
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

async function suspend(empId = fx.suspendedId) {
  await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empId]);
}

describe.skipIf(!reachable)("102 a suspension closes their open requests", () => {
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

  it("expires what they asked for and what they're the other person on, without a note", async () => {
    const theirCalloff = await insertRequest({
      type: "calloff",
      status: "open",
      requester: fx.suspendedId,
      absenceTypeId: fx.absenceTypeId,
    });
    const theirPickup = await insertRequest({
      type: "pickup",
      status: "open",
      requester: fx.suspendedId,
    });
    const offeredToThem = await insertRequest({
      type: "pickup",
      status: "open",
      requester: fx.colleagueId,
      target: fx.suspendedId,
      absenceTypeId: fx.absenceTypeId,
    });
    const swapWithThem = await insertRequest({
      type: "swap",
      status: "pending_approval",
      requester: fx.colleagueId,
      target: fx.suspendedId,
    });

    await suspend();

    for (const id of [theirCalloff, theirPickup, offeredToThem, swapWithThem]) {
      const row = await readRequest(id);
      expect(row.status).toBe("expired");
      expect(row.resolvedAt).not.toBeNull();
      expect(row.adminNote).toBeNull();
    }
  });

  it("puts a pickup they claimed back up for others", async () => {
    const claimed = await insertRequest({
      type: "pickup",
      status: "pending_approval",
      requester: fx.colleagueId,
      target: fx.suspendedId,
    });

    await suspend();

    expect(await readRequest(claimed)).toEqual({
      status: "open",
      targetEmpId: null,
      targetShiftDate: null,
      resolvedAt: null,
      adminNote: null,
    });
  });

  it("leaves other people's requests and settled ones alone", async () => {
    const bystanders = await insertRequest({
      type: "calloff",
      status: "open",
      requester: fx.bystanderId,
      absenceTypeId: fx.absenceTypeId,
    });
    const approved = await insertRequest({
      type: "calloff",
      status: "approved",
      requester: fx.suspendedId,
      absenceTypeId: fx.absenceTypeId,
    });

    await suspend();

    expect((await readRequest(bystanders)).status).toBe("open");
    expect((await readRequest(approved)).status).toBe("approved");
  });

  it("does nothing on a reinstatement or a second save while suspended", async () => {
    await suspend();
    const later = await insertRequest({
      type: "calloff",
      status: "open",
      requester: fx.suspendedId,
      absenceTypeId: fx.absenceTypeId,
    });

    await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [
      fx.suspendedId,
    ]);
    await db.query(`UPDATE public.employees SET suspended_at = NULL WHERE id = $1`, [
      fx.suspendedId,
    ]);

    expect((await readRequest(later)).status).toBe("open");
  });
});
