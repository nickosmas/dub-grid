// @vitest-environment node

/**
 * Migration 142: an organization deleted more than 90 days ago is purged with
 * its staff data and activity log; DubGrid support's records of it stay
 * (F-203). Runs the migration inside a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../../supabase/migrations/142_purge_archived_organizations.sql"),
  "utf8",
);

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
let orgId: string;

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'mountain-view'`,
  );
  if (rows.length === 0) throw new Error("Need the seeded Mountain View organization");
  orgId = rows[0]!.id;
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

describe.runIf(reachable)("purging an organization deleted 90 days ago (142, live DB)", () => {
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    await db.query(
      `INSERT INTO public.audit_log (org_id, action, resource_type, details) VALUES
         ($1, 'shift.updated', 'schedule_cell', '{}'::jsonb),
         ($1, 'org.archived', 'organization', '{"initiated_by": "gridmaster"}'::jsonb)`,
      [orgId],
    );
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  const purge = () =>
    db.query<{ ids: string[] }>(`SELECT public.purge_archived_organization($1) AS ids`, [orgId]);

  it("deletes the organization, its staff and its own activity, and keeps support's records", async () => {
    await db.query(
      `UPDATE public.organizations SET archived_at = now() - interval '91 days' WHERE id = $1`,
      [orgId],
    );
    const members = await count(
      `SELECT count(DISTINCT user_id) AS n FROM (
         SELECT user_id FROM public.organization_memberships WHERE org_id = $1
         UNION SELECT user_id FROM public.employees WHERE org_id = $1 AND user_id IS NOT NULL
       ) m`,
      [orgId],
    );

    const { rows } = await purge();

    expect(rows[0]!.ids).toHaveLength(members);
    expect(
      await count(`SELECT count(*) AS n FROM public.organizations WHERE id = $1`, [orgId]),
    ).toBe(0);
    expect(
      await count(`SELECT count(*) AS n FROM public.employees WHERE org_id = $1`, [orgId]),
    ).toBe(0);
    expect(
      await count(`SELECT count(*) AS n FROM public.schedule_cells WHERE org_id = $1`, [orgId]),
    ).toBe(0);
    const { rows: audit } = await db.query<{ action: string }>(
      `SELECT action FROM public.audit_log WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    expect(audit.map((row) => row.action).filter((action) => action !== "org.archived")).toEqual([
      "org.purged",
    ]);
    expect(audit.some((row) => row.action === "org.archived")).toBe(true);
  });

  it("refuses an organization deleted less than 90 days ago, or not deleted", async () => {
    await db.query(
      `UPDATE public.organizations SET archived_at = now() - interval '89 days' WHERE id = $1`,
      [orgId],
    );
    await db.query("SAVEPOINT recent");
    await expect(purge()).rejects.toThrow(/ORGANIZATION_NOT_DUE/);
    await db.query("ROLLBACK TO SAVEPOINT recent");

    await db.query(`UPDATE public.organizations SET archived_at = NULL WHERE id = $1`, [orgId]);
    await db.query("SAVEPOINT live");
    await expect(purge()).rejects.toThrow(/ORGANIZATION_NOT_DUE/);
    await db.query("ROLLBACK TO SAVEPOINT live");
    expect(
      await count(`SELECT count(*) AS n FROM public.organizations WHERE id = $1`, [orgId]),
    ).toBe(1);
  });

  it("can be called by the service role only", async () => {
    const { rows } = await db.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = 'purge_archived_organization'
          AND privilege_type = 'EXECUTE' ORDER BY grantee`,
    );
    expect(rows.map((row) => row.grantee).filter((grantee) => grantee !== "postgres")).toEqual([
      "service_role",
    ]);
  });
});
