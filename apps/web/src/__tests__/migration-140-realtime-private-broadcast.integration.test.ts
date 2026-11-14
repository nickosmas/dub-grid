// @vitest-environment node

/**
 * Migrations 140 and 141: changes reach the apps on private Broadcast topics
 * whose policies decide who may listen, and nothing is published to Postgres
 * Changes, which could not hide another organization's deleted ids (F-199).
 * Runs both migrations inside a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const migration = (file: string) =>
  readFileSync(path.resolve(__dirname, `../../../../supabase/migrations/${file}`), "utf8");

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
let db: Client;
let calmHaven: string;
let otherOrg: string;
let editor: string;
let viewer: string;
let gridmaster: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (rows.length === 0) throw new Error(`No row for ${sql}; run npm run db:reset`);
  return rows[0] as T;
}

const userId = async (email: string) =>
  (await one<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [email])).id;

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  calmHaven = (
    await one<{ id: string }>(`SELECT id FROM public.organizations WHERE slug = 'calmhaven'`)
  ).id;
  otherOrg = (
    await one<{ id: string }>(`SELECT id FROM public.organizations WHERE slug = 'evergreen-care'`)
  ).id;
  editor = await userId("qa-super-admin@dubgrid.test");
  viewer = await userId("qa-regular@dubgrid.test");
  gridmaster = await userId("qa-gridmaster@dubgrid.test");
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("private Broadcast topics (140 and 141, live DB)", () => {
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(migration("140_realtime_private_broadcast.sql"));
    await db.query(migration("141_postgres_changes_publication_empty.sql"));
    await db.query(`CREATE TEMP TABLE seen ON COMMIT DROP AS SELECT id FROM realtime.messages`);
  });
  afterEach(async () => {
    await db.query("RESET ROLE").catch(() => undefined);
    await db.query("ROLLBACK");
  });

  async function sent() {
    const { rows } = await db.query<{ topic: string; payload: Record<string, unknown> }>(
      `SELECT topic, payload FROM realtime.messages
        WHERE id NOT IN (SELECT id FROM seen) ORDER BY topic`,
    );
    await db.query(`INSERT INTO seen SELECT id FROM realtime.messages ON CONFLICT DO NOTHING`);
    return rows.map(({ topic, payload }) => ({
      topic,
      table: payload.table,
      scope: payload.scope,
    }));
  }

  it("sends a draft change to the drafts topic and a published one to everyone, once per statement", async () => {
    const { id: employee } = await one<{ id: string }>(
      `SELECT id FROM public.employees WHERE org_id = $1 AND status = 'active' LIMIT 1`,
      [calmHaven],
    );
    const { id: cell } = await one<{ id: string }>(
      `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, '2031-06-03') RETURNING id`,
      [calmHaven, employee],
    );
    await sent();

    await db.query(
      `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
       VALUES ($1, $2, 'draft', 'worked'), ($1, $2, 'published', 'worked')`,
      [cell, calmHaven],
    );

    expect(await sent()).toEqual([
      { topic: `org:${calmHaven}`, table: "schedule_cell_snapshots", scope: "org" },
      { topic: `org:${calmHaven}:drafts`, table: "schedule_cell_snapshots", scope: "drafts" },
      { topic: "platform", table: "schedule_cell_snapshots", scope: "platform" },
    ]);
  });

  it("tells members a Schedule visit's stamp without telling the person's own topic", async () => {
    await db.query(
      `UPDATE public.organization_memberships SET schedule_last_viewed_at = now()
        WHERE user_id = $1 AND org_id = $2`,
      [viewer, calmHaven],
    );
    const { rows } = await db.query<{ payload: { view_stamps?: { user_id: string }[] } }>(
      `SELECT payload FROM realtime.messages
        WHERE id NOT IN (SELECT id FROM seen) AND topic = $1`,
      [`org:${calmHaven}`],
    );
    expect(rows[0]?.payload.view_stamps?.map((stamp) => stamp.user_id)).toEqual([viewer]);
    expect((await sent()).map((message) => message.topic)).toEqual([
      `org:${calmHaven}`,
      "platform",
    ]);

    await db.query(
      `UPDATE public.organization_memberships SET org_role = org_role, phone = '555-0100'
        WHERE user_id = $1 AND org_id = $2`,
      [viewer, calmHaven],
    );
    expect((await sent()).map((message) => message.topic)).toEqual([
      `org:${calmHaven}`,
      "platform",
      `user:${viewer}`,
    ]);
  });

  async function receives(
    member: string,
    claims: { org_id: string; org_role: string; platform_role?: string },
    topic: string,
  ) {
    await db.query(
      `INSERT INTO realtime.messages (topic, extension, event, payload, private)
       VALUES ($1, 'broadcast', 'change', '{}'::jsonb, true)`,
      [topic],
    );
    await actAsAuthenticated(db, {
      sub: member,
      role: "authenticated",
      platform_role: "none",
      ...claims,
    });
    await db.query(`SELECT set_config('realtime.topic', $1, true)`, [topic]);
    const { rowCount } = await db.query(`SELECT 1 FROM realtime.messages WHERE topic = $1`, [
      topic,
    ]);
    await db.query("RESET ROLE");
    await db.query("RESET request.jwt.claims");
    return (rowCount ?? 0) > 0;
  }

  it("lets a member hear their organization and their own topic, and nothing else", async () => {
    const member = { org_id: calmHaven, org_role: "user" };
    expect(await receives(viewer, member, `org:${calmHaven}`)).toBe(true);
    expect(await receives(viewer, member, `user:${viewer}`)).toBe(true);
    expect(await receives(viewer, member, `org:${otherOrg}`)).toBe(false);
    expect(await receives(viewer, member, `org:${calmHaven}:drafts`)).toBe(false);
    expect(await receives(viewer, member, `user:${editor}`)).toBe(false);
    expect(await receives(viewer, member, "platform")).toBe(false);
  });

  it("lets a schedule editor hear drafts, and only a Gridmaster the platform", async () => {
    expect(
      await receives(
        editor,
        { org_id: calmHaven, org_role: "super_admin" },
        `org:${calmHaven}:drafts`,
      ),
    ).toBe(true);
    expect(
      await receives(
        gridmaster,
        { org_id: calmHaven, org_role: "super_admin", platform_role: "gridmaster" },
        "platform",
      ),
    ).toBe(true);
  });

  it("refuses any client sending on these topics", async () => {
    await actAsAuthenticated(db, {
      sub: editor,
      role: "authenticated",
      org_id: calmHaven,
      org_role: "super_admin",
      platform_role: "none",
    });
    await db.query(`SELECT set_config('realtime.topic', $1, true)`, [`org:${calmHaven}`]);
    await db.query("SAVEPOINT send");
    await expect(
      db.query(
        `INSERT INTO realtime.messages (topic, extension, event, payload, private)
         VALUES ($1, 'broadcast', 'change', '{}'::jsonb, true)`,
        [`org:${calmHaven}`],
      ),
    ).rejects.toThrow(/row-level security/);
    await db.query("ROLLBACK TO SAVEPOINT send");
  });

  it("publishes nothing to Postgres Changes and keeps no full replica identity", async () => {
    const { rows: published } = await db.query(
      `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`,
    );
    const { rows: full } = await db.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relreplident = 'f'`,
    );
    expect(published).toEqual([]);
    expect(full).toEqual([]);
  });
});
