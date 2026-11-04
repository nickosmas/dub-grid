// @vitest-environment node

/**
 * Migration 119: shift_request_draft_cells lists a day an approval would
 * publish when it holds a draft note change as well as when its shift has a
 * draft, and says which. Each case runs 119 from its file inside
 * BEGIN/ROLLBACK against the seeded local database, with the caller
 * simulated the way PostgREST does.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";
import {
  asSuperuser,
  asUser,
  createRequest,
  loadRequestFixture,
  writeWorked,
  type RequestFixture,
} from "./helpers/request-fixture";

const MIGRATION = readFileSync(migrationPath("119_approval_warns_about_draft_notes.sql"), "utf8");

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

/** A call-off of the peer's published shift on the fixture's date. */
async function calloff(fx: RequestFixture): Promise<string> {
  await writeWorked(db, fx, "published", fx.peer.empId, fx.date);
  return createRequest(db, fx, fx.peer, { type: "calloff" });
}

async function note(fx: RequestFixture, status: "draft" | "draft_deleted" | "published") {
  const {
    rows: [type],
  } = await db.query<{ id: number }>(
    `INSERT INTO public.indicator_types (org_id, name) VALUES ($1, '119 ' || $2) RETURNING id`,
    [fx.orgId, status],
  );
  await db.query(
    `INSERT INTO public.schedule_notes
       (org_id, emp_id, date, indicator_type_id, status, focus_area_id, shift_id, job_id,
        created_by, updated_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $9)`,
    [
      fx.orgId,
      fx.peer.empId,
      fx.date,
      type.id,
      status,
      fx.focusAreaId,
      fx.shiftId,
      fx.jobId,
      fx.superAdmin.userId,
    ],
  );
}

async function draftCells(fx: RequestFixture, requestId: string) {
  await asUser(db, fx.superAdmin, fx.orgId);
  try {
    const { rows } = await db.query(
      `SELECT emp_id, shift_date::text, has_shift_changes, has_note_changes
         FROM public.shift_request_draft_cells($1)`,
      [requestId],
    );
    return rows;
  } finally {
    await asSuperuser(db);
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

describe.runIf(reachable)("119 the approval warning names draft notes (live DB)", () => {
  it("lists a day with only a draft note", () =>
    inTransaction(async (fx) => {
      const requestId = await calloff(fx);
      await note(fx, "published");
      expect(await draftCells(fx, requestId)).toEqual([]);

      await note(fx, "draft");

      expect(await draftCells(fx, requestId)).toEqual([
        {
          emp_id: fx.peer.empId,
          shift_date: fx.date,
          has_shift_changes: false,
          has_note_changes: true,
        },
      ]);
    }));

  it("lists a day with a note removed only in the draft", () =>
    inTransaction(async (fx) => {
      const requestId = await calloff(fx);
      await note(fx, "draft_deleted");

      expect(await draftCells(fx, requestId)).toEqual([
        {
          emp_id: fx.peer.empId,
          shift_date: fx.date,
          has_shift_changes: false,
          has_note_changes: true,
        },
      ]);
    }));

  it("says when a day has both", () =>
    inTransaction(async (fx) => {
      const requestId = await calloff(fx);
      await note(fx, "draft");
      await db.query(
        `SELECT public.write_schedule_cell_snapshot_internal(
           $1, $2, $3::date, 'draft', 'absence', '{}', '{}', $4::bigint,
           NULL, NULL, NULL, FALSE, $5::bigint, NULL, $6, '{}')`,
        [fx.orgId, fx.peer.empId, fx.date, fx.absenceTypeId, fx.focusAreaId, fx.superAdmin.userId],
      );

      expect(await draftCells(fx, requestId)).toEqual([
        {
          emp_id: fx.peer.empId,
          shift_date: fx.date,
          has_shift_changes: true,
          has_note_changes: true,
        },
      ]);
    }));

  it("counts a change to an absence's time alone as a shift change", () =>
    inTransaction(async (fx) => {
      const requestId = await calloff(fx);
      const {
        rows: [{ id: cellId }],
      } = await db.query<{ id: string }>(
        `SELECT id FROM public.schedule_cells WHERE emp_id = $1 AND date = $2::date`,
        [fx.peer.empId, fx.date],
      );
      for (const [kind, end] of [
        ["published", "23:30"],
        ["draft", "23:45"],
      ]) {
        await db.query(
          `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', $4, NULL, NULL,
             ARRAY[$5]::bigint[], ARRAY[$6]::bigint[], '{false}'::boolean[], '23:00', $7)`,
          [cellId, fx.orgId, kind, fx.absenceTypeId, fx.shiftId, fx.jobId, end],
        );
      }

      expect(await draftCells(fx, requestId)).toEqual([
        {
          emp_id: fx.peer.empId,
          shift_date: fx.date,
          has_shift_changes: true,
          has_note_changes: false,
        },
      ]);
    }));
});
