// @vitest-environment node

/**
 * Migration 035: a regular member reads only the published schedule; drafts
 * stay with editors. Cases run inside BEGIN/ROLLBACK against the seeded local
 * database and simulate authenticated members the way PostgREST does.
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

interface Member {
  userId: string;
  orgRole: "super_admin" | "admin" | "user";
}

interface Fixture {
  orgId: string;
  editor: Member;
  viewer: Member;
  cellId: string;
  publishedSnapshotId: string;
  draftSnapshotId: string;
  date: string;
}

let db: Client;

async function memberByEmail(email: string, orgRole: Member["orgRole"]): Promise<Member> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error(`Missing seeded account ${email}, run npm run db:reset`);
  return { userId: rows[0].id, orgRole };
}

/** One cell holding a published and a draft worked shift, each with a segment, plus one note of each status. */
async function loadFixture(): Promise<Fixture> {
  const { rows: orgs } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven' AND archived_at IS NULL`,
  );
  if (orgs.length === 0) throw new Error("Need the seeded Calm Haven organization");
  const orgId = orgs[0].id;
  const date = "2031-06-03";

  const { rows: employees } = await db.query<{ id: string }>(
    `SELECT id FROM public.employees WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL ORDER BY seniority LIMIT 1`,
    [orgId],
  );
  const { rows: jobs } = await db.query<{ id: number }>(
    `SELECT id FROM public.jobs WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [orgId],
  );
  const { rows: cells } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3::date) RETURNING id`,
    [orgId, employees[0].id, date],
  );
  const snapshot = async (kind: "published" | "draft") => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
       VALUES ($1, $2, $3, 'worked') RETURNING id`,
      [cells[0].id, orgId, kind],
    );
    await db.query(
      `INSERT INTO public.schedule_cell_segments (snapshot_id, org_id, position, job_id) VALUES ($1, $2, 0, $3)`,
      [rows[0].id, orgId, jobs[0].id],
    );
    return rows[0].id;
  };
  const publishedSnapshotId = await snapshot("published");
  const draftSnapshotId = await snapshot("draft");

  for (const status of ["published", "draft", "draft_deleted"]) {
    const { rows: indicators } = await db.query<{ id: number }>(
      `INSERT INTO public.indicator_types (org_id, name) VALUES ($1, $2) RETURNING id`,
      [orgId, `Live test ${status}`],
    );
    await db.query(
      `INSERT INTO public.schedule_notes (org_id, emp_id, date, indicator_type_id, status)
       VALUES ($1, $2, $3::date, $4, $5)`,
      [orgId, employees[0].id, date, indicators[0].id, status],
    );
  }

  return {
    orgId,
    editor: await memberByEmail("qa-super-admin@dubgrid.test", "super_admin"),
    viewer: await memberByEmail("qa-regular@dubgrid.test", "user"),
    cellId: cells[0].id,
    publishedSnapshotId,
    draftSnapshotId,
    date,
  };
}

async function asUser(member: Member, orgId: string): Promise<void> {
  const claims = JSON.stringify({
    sub: member.userId,
    role: "authenticated",
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
}

async function asSuperuser(): Promise<void> {
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

async function visibleState(fx: Fixture) {
  const { rows: snapshots } = await db.query<{ snapshot_kind: string }>(
    `SELECT snapshot_kind FROM public.schedule_cell_snapshots WHERE cell_id = $1 ORDER BY snapshot_kind`,
    [fx.cellId],
  );
  const { rows: segments } = await db.query<{ snapshot_id: string }>(
    `SELECT snapshot_id FROM public.schedule_cell_segments WHERE snapshot_id = ANY($1::uuid[]) ORDER BY snapshot_id`,
    [[fx.publishedSnapshotId, fx.draftSnapshotId]],
  );
  const { rows: notes } = await db.query<{ status: string }>(
    `SELECT status FROM public.schedule_notes WHERE org_id = $1 AND date = $2::date ORDER BY status`,
    [fx.orgId, fx.date],
  );
  return {
    snapshots: snapshots.map((row) => row.snapshot_kind),
    segmentSnapshots: segments.map((row) => row.snapshot_id).sort(),
    notes: notes.map((row) => row.status),
  };
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("draft schedule state is editor-only (live DB)", () => {
  it("shows a regular member only the published half of the schedule", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();

      await asUser(fx.viewer, fx.orgId);
      const seen = await visibleState(fx);
      await asSuperuser();

      expect(seen).toEqual({
        snapshots: ["published"],
        segmentSnapshots: [fx.publishedSnapshotId],
        // A draft_deleted note is a published note pending removal.
        notes: ["draft_deleted", "published"],
      });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps drafts visible to an editor and to the service role", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const everything = {
        snapshots: ["draft", "published"],
        segmentSnapshots: [fx.publishedSnapshotId, fx.draftSnapshotId].sort(),
        notes: ["draft", "draft_deleted", "published"],
      };

      await asUser(fx.editor, fx.orgId);
      expect(await visibleState(fx)).toEqual(everything);
      await asSuperuser();

      await db.query(`SET LOCAL ROLE service_role`);
      expect(await visibleState(fx)).toEqual(everything);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("admits an editor to the draft topic and refuses a regular member", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const topic = `schedule:${fx.orgId}:drafts`;
      // Realtime authorizes a private-channel join by inserting a message and
      // selecting it back as the joining user under `realtime.topic`; the
      // same two statements here reproduce that decision.
      await db.query(
        `INSERT INTO realtime.messages (topic, extension, event, payload, private)
         VALUES ($1, 'broadcast', 'draft_changed', '{}'::jsonb, true)`,
        [topic],
      );
      const receives = async (member: Member) => {
        await asUser(member, fx.orgId);
        await db.query(`SELECT set_config('realtime.topic', $1, true)`, [topic]);
        const { rowCount } = await db.query(`SELECT 1 FROM realtime.messages WHERE topic = $1`, [
          topic,
        ]);
        await asSuperuser();
        return rowCount === 1;
      };
      const sends = async (member: Member) => {
        await db.query("SAVEPOINT send_attempt");
        try {
          await asUser(member, fx.orgId);
          await db.query(`SELECT set_config('realtime.topic', $1, true)`, [topic]);
          await db.query(
            `INSERT INTO realtime.messages (topic, extension, event, payload, private)
             VALUES ($1, 'broadcast', 'draft_changed', '{}'::jsonb, true)`,
            [topic],
          );
          return true;
        } catch (error) {
          if (!/row-level security/.test(String(error))) throw error;
          return false;
        } finally {
          await db.query("ROLLBACK TO SAVEPOINT send_attempt");
          await asSuperuser();
        }
      };

      expect(await receives(fx.editor)).toBe(true);
      expect(await sends(fx.editor)).toBe(true);
      expect(await receives(fx.viewer)).toBe(false);
      expect(await sends(fx.viewer)).toBe(false);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
