// @vitest-environment node

/**
 * Migration 117: a shift, job or absence type archived while it is still
 * scheduled no longer breaks publishing or approving the days that hold it,
 * and a new choice of one is still refused. Each case runs 117 from its file
 * inside BEGIN/ROLLBACK against the seeded local database.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";
import {
  createRequest,
  loadRequestFixture,
  publishedKind,
  requestStatus,
  resolveRequest,
  respond,
  writeWorked,
  type RequestFixture,
} from "./helpers/request-fixture";

const MIGRATION = readFileSync(migrationPath("117_archived_items_stay_scheduled.sql"), "utf8");

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

let db: Client;

async function inTransaction(run: (fx: RequestFixture) => Promise<void>): Promise<void> {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL lock_timeout = '10s'");
    await db.query(MIGRATION);
    await run(await loadRequestFixture(db));
  } finally {
    await db.query("ROLLBACK");
  }
}

const archiveShift = (fx: RequestFixture) =>
  db.query(`UPDATE public.shift_categories SET archived_at = now() WHERE id = $1`, [fx.shiftId]);
const archiveJob = (fx: RequestFixture) =>
  db.query(`UPDATE public.jobs SET archived_at = now() WHERE id = $1`, [fx.jobId]);

async function publish(fx: RequestFixture, date: string): Promise<void> {
  await db.query(`SELECT public.publish_schedule_unguarded($1, $2::date, $2::date, $3)`, [
    fx.orgId,
    date,
    fx.superAdmin.userId,
  ]);
}

function workedState(fx: RequestFixture) {
  return db.query(
    `SELECT public.build_schedule_cell_state_json('worked', ARRAY[$1]::bigint[], ARRAY[$2]::bigint[]) AS state`,
    [fx.shiftId, fx.jobId],
  );
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("117 archived items stay scheduled (live DB)", () => {
  it("publishes a day that still holds an archived shift", () =>
    inTransaction(async (fx) => {
      await writeWorked(db, fx, "draft", fx.peer.empId, fx.date);
      await archiveShift(fx);

      await publish(fx, fx.date);

      expect(await publishedKind(db, fx, fx.peer.empId, fx.date)).toBe("worked");
    }));

  it("staffs a waiting call-off through a publish after its shift was archived", () =>
    inTransaction(async (fx) => {
      await writeWorked(db, fx, "published", fx.approver.empId, fx.date);
      const calloffId = await createRequest(db, fx, fx.approver, { type: "calloff" });
      if ((await requestStatus(db, calloffId)) === "pending_approval") {
        await resolveRequest(db, fx, calloffId, true);
      }
      const { rows: pickups } = await db.query<{ id: string }>(
        `SELECT id FROM public.shift_requests
          WHERE parent_request_id = $1 AND type = 'pickup' AND status = 'open'`,
        [calloffId],
      );
      expect(pickups).toHaveLength(1);

      await writeWorked(db, fx, "draft", fx.peer.empId, fx.date);
      await archiveShift(fx);
      await publish(fx, fx.date);

      expect(await publishedKind(db, fx, fx.peer.empId, fx.date)).toBe("worked");
      const { rows } = await db.query<{ status: string; target_emp_id: string }>(
        `SELECT status, target_emp_id FROM public.shift_requests WHERE id = $1`,
        [pickups[0].id],
      );
      expect(rows[0]).toEqual({ status: "approved", target_emp_id: fx.peer.empId });
    }));

  it("approves a call-off whose job was archived after it was asked", () =>
    inTransaction(async (fx) => {
      await writeWorked(db, fx, "published", fx.peer.empId, fx.date);
      const requestId = await createRequest(db, fx, fx.peer, { type: "calloff" });
      await archiveJob(fx);

      await resolveRequest(db, fx, requestId, true);

      expect(await requestStatus(db, requestId)).toBe("approved");
      expect(await publishedKind(db, fx, fx.peer.empId, fx.date)).toBe("absence");
    }));

  it("approves a swap whose shift was archived after it was accepted", () =>
    inTransaction(async (fx) => {
      await writeWorked(db, fx, "published", fx.peer.empId, fx.date);
      await writeWorked(db, fx, "published", fx.outsider.empId, fx.otherDate);
      const requestId = await createRequest(db, fx, fx.peer, {
        type: "swap",
        targetEmpId: fx.outsider.empId,
      });
      await respond(db, fx, fx.outsider, requestId);
      await archiveShift(fx);

      await resolveRequest(db, fx, requestId, true);

      expect(await requestStatus(db, requestId)).toBe("approved");
      expect(await publishedKind(db, fx, fx.outsider.empId, fx.date)).toBe("worked");
      expect(await publishedKind(db, fx, fx.peer.empId, fx.otherDate)).toBe("worked");
    }));

  it("still refuses an archived shift or job as a new choice", () =>
    inTransaction(async (fx) => {
      const {
        rows: [{ state }],
      } = await workedState(fx);
      await archiveShift(fx);

      await db.query("SAVEPOINT strict");
      await expect(
        db.query(`SELECT * FROM public.resolve_schedule_state_storage($1, $2::jsonb)`, [
          fx.orgId,
          state,
        ]),
      ).rejects.toThrow(/shifts were not found/);
      await db.query("ROLLBACK TO SAVEPOINT strict");

      const { rows } = await db.query<{ shift_ids: number[] }>(
        `SELECT shift_ids FROM public.resolve_existing_schedule_state_storage($1, $2::jsonb)`,
        [fx.orgId, state],
      );
      expect(rows[0].shift_ids.map(Number)).toEqual([fx.shiftId]);
    }));

  it("reads existing state only within its own organization", () =>
    inTransaction(async (fx) => {
      const {
        rows: [{ state }],
      } = await workedState(fx);
      const { rows: others } = await db.query<{ id: string }>(
        `SELECT id FROM public.organizations WHERE id <> $1 ORDER BY id LIMIT 1`,
        [fx.orgId],
      );

      await expect(
        db.query(`SELECT * FROM public.resolve_existing_schedule_state_storage($1, $2::jsonb)`, [
          others[0].id,
          state,
        ]),
      ).rejects.toThrow(/not found in this organization/);
    }));
});
