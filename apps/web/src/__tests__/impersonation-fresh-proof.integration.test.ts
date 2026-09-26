// @vitest-environment node

/**
 * Migration 055: a Gridmaster token without a recent sign-in cannot start an
 * impersonation or force a sign-out through the data API (F-75), and ending
 * an impersonation never needs it. Runs the migration inside a transaction
 * that is rolled back.
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
    "../../../../supabase/migrations/055_impersonation_and_force_logout_need_fresh_proof.sql",
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

describe.runIf(reachable)("impersonation and force logout (055, live DB)", () => {
  // An impersonation is bound to the caller's auth session (017), and
  // is_gridmaster() accepts a session only while user_sessions holds it.
  let sessionId: string;
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.user_sessions (user_id, supabase_session_id)
       VALUES ($1, gen_random_uuid()) RETURNING supabase_session_id AS id`,
      [gridmaster],
    );
    sessionId = rows[0]!.id;
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  const start = `SELECT public.start_impersonation($1, 'Support investigation for F-75', NULL, 'vitest', $2)`;
  const forceLogout = `SELECT public.force_logout_user($1)`;

  it("refuses both to a stale Gridmaster token", async () => {
    const stale = { sub: gridmaster, session_id: sessionId, ...password(3600) };
    expect(await asCaller(stale, start, [regular, calmHaven])).toEqual({
      error: "STEP_UP_REQUIRED",
    });
    expect(await asCaller(stale, forceLogout, [regular])).toEqual({ error: "STEP_UP_REQUIRED" });
  });

  it("lets a Gridmaster with fresh proof do both", async () => {
    const fresh = { sub: gridmaster, session_id: sessionId, ...password(10) };
    expect(await asCaller(fresh, start, [regular, calmHaven])).toEqual({ rows: 1 });
    expect(await asCaller(fresh, forceLogout, [regular])).toEqual({ rows: 1 });
  });

  it("always lets a Gridmaster end a session", async () => {
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(
        simulatedTokenClaims({
          role: "authenticated",
          sub: gridmaster,
          session_id: sessionId,
          ...password(10),
        }),
      ),
    ]);
    const { rows } = await db.query<{ result: { session_id: string } }>(
      `SELECT public.start_impersonation($1, 'Support investigation for F-75', NULL, 'vitest', $2) AS result`,
      [regular, calmHaven],
    );
    const impersonationId = rows[0]!.result.session_id;
    // Run as the stale caller without the helper's savepoint, which would
    // roll the end back before it can be read.
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(
        simulatedTokenClaims({
          role: "authenticated",
          sub: gridmaster,
          session_id: sessionId,
          ...password(3600),
        }),
      ),
    ]);
    await db.query("SET LOCAL ROLE authenticated");
    await db.query(`SELECT public.end_impersonation($1, 'manual')`, [impersonationId]);
    await db.query("RESET ROLE");
    const { rows: ended } = await db.query<{ ended: boolean }>(
      `SELECT ended_at IS NOT NULL AS ended FROM public.impersonation_sessions WHERE session_id = $1`,
      [impersonationId],
    );
    expect(ended[0]!.ended).toBe(true);
  });
});
