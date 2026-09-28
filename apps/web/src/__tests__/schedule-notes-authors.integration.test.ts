// @vitest-environment node

/**
 * Migration 068: every note names its author and its shift. Each case
 * runs 068 from its file inside BEGIN/ROLLBACK against the seeded local
 * database (063 and 064 applied) and fires deferred triggers with SET
 * CONSTRAINTS ALL IMMEDIATE.
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
    const { rows } = await probe.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_schedule_notes_follow_snapshots'`,
    );
    return rows.length > 0;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

// A date no other integration test seeds, so no two suites contend for one cell.
const DATE = "2032-01-13";

interface Fixture {
  orgId: string;
  authorId: string;
  otherEditorId: string;
  empId: string;
  focusAreaId: number;
  dayShiftId: number;
  eveningShiftId: number;
  jobId: number;
}

let db: Client;
let fx: Fixture;
let cellId: string;
let noteTypeIds: number[];

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function userId(email: string): Promise<string> {
  return (await one<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [email])).id;
}

async function loadFixture(): Promise<Fixture> {
  const { id: orgId } = await one<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const pair = await one<{ fa: number; day: number; evening: number }>(
    `SELECT a.focus_area_id AS fa, a.id AS day, b.id AS evening
       FROM public.shift_categories a
       JOIN public.shift_categories b
         ON b.org_id = a.org_id AND b.focus_area_id = a.focus_area_id AND b.start_time = a.end_time
      WHERE a.org_id = $1 AND a.archived_at IS NULL AND b.archived_at IS NULL
      ORDER BY a.id LIMIT 1`,
    [orgId],
  );
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND $2 = ANY(applicable_shift_ids) AND $3 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [orgId, pair.day, pair.evening],
  );
  const emp = await one<{ id: string }>(
    `SELECT id FROM public.employees
      WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL AND $2 = ANY(focus_area_ids)
      ORDER BY seniority LIMIT 1`,
    [orgId, pair.fa],
  );
  return {
    orgId,
    authorId: await userId("qa-super-admin@dubgrid.test"),
    otherEditorId: await userId("qa-admin@dubgrid.test"),
    empId: emp.id,
    focusAreaId: Number(pair.fa),
    dayShiftId: Number(pair.day),
    eveningShiftId: Number(pair.evening),
    jobId: Number(job.id),
  };
}

async function writeDraft(shiftIds: number[]): Promise<void> {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
       $3::bigint[], $4::bigint[])`,
    [cellId, fx.orgId, shiftIds, shiftIds.map(() => fx.jobId)],
  );
}

async function addNote(input: {
  noteType: number;
  shiftId: number;
  status: "draft" | "published" | "draft_deleted";
  author?: string | null;
}): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO public.schedule_notes
       (org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id, status,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
    [
      fx.orgId,
      fx.empId,
      DATE,
      input.noteType,
      fx.focusAreaId,
      input.shiftId,
      fx.jobId,
      input.status,
      input.author ?? null,
    ],
  );
  return Number(rows[0].id);
}

async function note(id: number) {
  const { rows } = await db.query<{
    status: string;
    created_by: string | null;
    updated_by: string | null;
  }>(`SELECT status, created_by, updated_by FROM public.schedule_notes WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function actAs(userIdValue: string | null): Promise<void> {
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    userIdValue ? JSON.stringify({ sub: userIdValue, role: "authenticated" }) : "",
  ]);
}

async function apply068(): Promise<void> {
  await db.query(
    readFileSync(migrationPath("068_schedule_notes_authors_and_shift_required.sql"), "utf8"),
  );
}

async function settle(): Promise<void> {
  await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  await db.query("SET CONSTRAINTS ALL DEFERRED");
}

describe.skipIf(!reachable)("068 schedule note authors", () => {
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
    await db.query(
      `LOCK TABLE public.schedule_cells, public.schedule_cell_snapshots,
         public.schedule_cell_segments, public.schedule_notes IN ACCESS EXCLUSIVE MODE`,
    );
    await db.query(`DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2`, [
      fx.empId,
      DATE,
    ]);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.schedule_cells (emp_id, date, org_id, focus_area_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [fx.empId, DATE, fx.orgId, fx.focusAreaId],
    );
    cellId = rows[0].id;
    const { rows: types } = await db.query<{ id: number }>(
      `INSERT INTO public.indicator_types (org_id, name, color)
       VALUES ($1, '068 note A', '#E24B4A'), ($1, '068 note B', '#378ADD') RETURNING id`,
      [fx.orgId],
    );
    noteTypeIds = types.map((row) => Number(row.id)).sort((a, b) => a - b);
    await writeDraft([fx.dayShiftId, fx.eveningShiftId]);
    await settle();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("recovers a note's author from its save in the audit log", async () => {
    const [typeA, typeB] = noteTypeIds;
    const withSave = await addNote({ noteType: typeA, shiftId: fx.dayShiftId, status: "draft" });
    const withoutSave = await addNote({ noteType: typeB, shiftId: fx.dayShiftId, status: "draft" });
    await db.query(
      `INSERT INTO public.audit_log (org_id, actor_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'schedule_note.upserted', 'schedule_note', $3, $4)`,
      [
        fx.orgId,
        fx.authorId,
        `${fx.empId}_${DATE}`,
        JSON.stringify({ indicatorTypeId: typeA, focusAreaId: fx.focusAreaId }),
      ],
    );

    await apply068();

    expect(await note(withSave)).toMatchObject({
      created_by: fx.authorId,
      updated_by: fx.authorId,
    });
    expect(await note(withoutSave)).toMatchObject({ created_by: null, updated_by: null });
  });

  it("keeps a note's creator when another editor updates it", async () => {
    await apply068();
    const id = await addNote({
      noteType: noteTypeIds[0],
      shiftId: fx.dayShiftId,
      status: "draft",
      author: fx.authorId,
    });

    await db.query(
      `UPDATE public.schedule_notes SET status = 'published', created_by = $2, updated_by = $2
        WHERE id = $1`,
      [id, fx.otherEditorId],
    );

    expect(await note(id)).toMatchObject({
      created_by: fx.authorId,
      updated_by: fx.otherEditorId,
    });
  });

  it("names the editor when a removed shift's published note is marked for removal", async () => {
    await apply068();
    const id = await addNote({
      noteType: noteTypeIds[0],
      shiftId: fx.eveningShiftId,
      status: "published",
      author: fx.otherEditorId,
    });
    await settle();

    await actAs(fx.authorId);
    await writeDraft([fx.dayShiftId]);
    await settle();
    await actAs(null);

    expect(await note(id)).toMatchObject({
      status: "draft_deleted",
      created_by: fx.otherEditorId,
      updated_by: fx.authorId,
    });
  });

  it("refuses a note that names no shift", async () => {
    await apply068();

    await expect(
      db.query(
        `INSERT INTO public.schedule_notes
           (org_id, emp_id, date, indicator_type_id, focus_area_id, status)
         VALUES ($1, $2, $3, $4, $5, 'draft')`,
        [fx.orgId, fx.empId, DATE, noteTypeIds[0], fx.focusAreaId],
      ),
    ).rejects.toMatchObject({ code: "23502", column: "job_id" });
  });

  it("discards only the caller's note drafts", async () => {
    await apply068();
    const [typeA, typeB] = noteTypeIds;
    const myDraft = await addNote({
      noteType: typeA,
      shiftId: fx.dayShiftId,
      status: "draft",
      author: fx.authorId,
    });
    const myRemoval = await addNote({
      noteType: typeB,
      shiftId: fx.dayShiftId,
      status: "draft_deleted",
      author: fx.authorId,
    });
    const theirDraft = await addNote({
      noteType: typeA,
      shiftId: fx.eveningShiftId,
      status: "draft",
      author: fx.otherEditorId,
    });

    await db.query(`SELECT public.discard_schedule_drafts($1, $2, $3::date, $3::date)`, [
      fx.orgId,
      fx.authorId,
      DATE,
    ]);
    await settle();

    expect(await note(myDraft)).toBeNull();
    expect(await note(myRemoval)).toMatchObject({ status: "published" });
    expect(await note(theirDraft)).toMatchObject({ status: "draft" });
  });
});
