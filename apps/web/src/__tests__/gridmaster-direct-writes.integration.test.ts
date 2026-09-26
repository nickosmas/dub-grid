// @vitest-environment node

/**
 * Migration 054: a Gridmaster token without a recent sign-in cannot insert,
 * update or delete through the data API on the tables its policies let it
 * write (F-74), and every other caller is judged as before. Runs the
 * migration inside a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { simulatedTokenClaims } from "./helpers/simulated-jwt";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const MIGRATION = readFileSync(
  path.resolve(
    __dirname,
    "../../../../supabase/migrations/054_gridmaster_direct_writes_need_fresh_proof.sql",
  ),
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
let gridmaster: string;
let regular: string;
let calmHaven: string;

const now = () => Math.floor(Date.now() / 1000);
const password = (ageSeconds: number) => ({
  aal: "aal1",
  amr: [{ method: "password", timestamp: now() - ageSeconds }],
});

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  return rows[0]!.id;
}

/** Runs a statement as the signed-in caller: the affected row count, or the error. */
async function asCaller(
  claims: Record<string, unknown>,
  sql: string,
  params: unknown[],
): Promise<{ rows: number } | { error: string }> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(simulatedTokenClaims({ role: "authenticated", ...claims })),
    ]);
    await db.query("SET LOCAL ROLE authenticated");
    const result = await db.query(sql, params);
    return { rows: result.rowCount ?? 0 };
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    await db.query("RESET ROLE");
  }
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  gridmaster = await userId("qa-gridmaster@dubgrid.test");
  regular = await userId("qa-regular@dubgrid.test");
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  calmHaven = rows[0]!.id;
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("Gridmaster direct writes (054, live DB)", () => {
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  const renameDepartments = `UPDATE public.departments SET name = name WHERE org_id = $1`;
  const deleteDepartments = `DELETE FROM public.departments WHERE org_id = $1`;
  const insertFlag = `INSERT INTO public.platform_feature_flags (key, enabled) VALUES ('f74_probe', false)`;

  it("lets a stale Gridmaster token change nothing", async () => {
    const stale = { sub: gridmaster, ...password(3600) };
    expect(await asCaller(stale, renameDepartments, [calmHaven])).toEqual({ rows: 0 });
    expect(await asCaller(stale, deleteDepartments, [calmHaven])).toEqual({ rows: 0 });
    expect(await asCaller(stale, insertFlag, [])).toEqual({
      error: expect.stringMatching(/row-level security/),
    });
  });

  it("lets a Gridmaster with fresh proof write as before", async () => {
    const fresh = { sub: gridmaster, ...password(10) };
    const renamed = await asCaller(fresh, renameDepartments, [calmHaven]);
    expect(renamed).toEqual({ rows: expect.any(Number) });
    expect((renamed as { rows: number }).rows).toBeGreaterThan(0);
    expect(await asCaller(fresh, insertFlag, [])).toEqual({ rows: 1 });
  });

  it("judges an ordinary member's own writes exactly as before", async () => {
    await db.query(
      `INSERT INTO public.notifications (user_id, org_id, type, title, message)
       VALUES ($1, $2, 'system', 'Probe', 'Probe')`,
      [regular, calmHaven],
    );
    const member = { sub: regular, org_id: calmHaven, org_role: "user", ...password(3600) };
    const result = await asCaller(
      member,
      `UPDATE public.notifications SET read_at = now() WHERE user_id = $1 AND title = 'Probe'`,
      [regular],
    );
    expect(result).toEqual({ rows: 1 });
  });

  it("covers every table a Gridmaster policy lets it write", async () => {
    const { rows } = await db.query<{ table_name: string; fresh: string[] }>(`
      WITH gridmaster_writes AS (
        SELECT DISTINCT c.oid, c.relname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND p.polpermissive
          AND p.polcmd IN ('*', 'a', 'w', 'd')
          AND (pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_gridmaster()%'
            OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_gridmaster()%')
      )
      SELECT g.relname AS table_name,
             COALESCE(array_agg(p.polname::text ORDER BY p.polname)
               FILTER (WHERE NOT p.polpermissive), '{}'::text[]) AS fresh
      FROM gridmaster_writes g
      LEFT JOIN pg_policy p ON p.polrelid = g.oid
      GROUP BY g.relname
      ORDER BY g.relname
    `);
    const missing = rows.filter(
      (row) =>
        row.fresh.join(",") !==
        "gridmaster_fresh_delete,gridmaster_fresh_insert,gridmaster_fresh_update",
    );
    expect(missing).toEqual([]);
    expect(rows.length).toBeGreaterThan(30);

    // A policy with the right name and a permissive expression would pass the
    // name check, so every restrictive expression must be the helper.
    const { rows: loose } = await db.query<{ table_name: string; policy: string }>(`
      SELECT c.relname AS table_name, p.polname AS policy
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      WHERE NOT p.polpermissive
        AND p.polname LIKE 'gridmaster_fresh_%'
        AND NOT (
          COALESCE(pg_get_expr(p.polqual, p.polrelid), 'SELECT gridmaster_write_allowed()')
            ILIKE '%SELECT gridmaster_write_allowed()%'
          AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), 'SELECT gridmaster_write_allowed()')
            ILIKE '%SELECT gridmaster_write_allowed()%'
        )
    `);
    expect(loose).toEqual([]);
  });
});
