// @vitest-environment node

/**
 * Migration 060: an impersonation ended from the /gridmaster escape writes its
 * own audit row, and no other end does, since their routes write one (F-33).
 * Runs the migration inside a transaction that is rolled back.
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
    "../../../../supabase/migrations/060_impersonation_escape_is_audited.sql",
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

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  return rows[0]!.id;
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

describe.runIf(reachable)("the audit row of an impersonation escape (060, live DB)", () => {
  let impersonationId: string;

  // Starts an impersonation as a Gridmaster with fresh proof; an impersonation
  // is bound to the caller's auth session (017), which user_sessions must hold.
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    const { rows: session } = await db.query<{ id: string }>(
      `INSERT INTO public.user_sessions (user_id, supabase_session_id)
       VALUES ($1, gen_random_uuid()) RETURNING supabase_session_id AS id`,
      [gridmaster],
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(
        simulatedTokenClaims({
          role: "authenticated",
          sub: gridmaster,
          session_id: session[0]!.id,
          aal: "aal1",
          amr: [{ method: "password", timestamp: nowSeconds - 10 }],
        }),
      ),
    ]);
    const { rows } = await db.query<{ result: { session_id: string } }>(
      `SELECT public.start_impersonation($1, 'Support investigation for F-33', NULL, 'vitest', $2) AS result`,
      [regular, calmHaven],
    );
    impersonationId = rows[0]!.result.session_id;
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  async function endAs(reason: string) {
    await db.query("SET LOCAL ROLE authenticated");
    await db.query(`SELECT public.end_impersonation($1, $2)`, [impersonationId, reason]);
    await db.query("RESET ROLE");
    const { rows } = await db.query<{
      actor_id: string;
      org_id: string;
      details: Record<string, string>;
    }>(
      `SELECT actor_id, org_id, details FROM public.audit_log
        WHERE action = 'impersonation.ended' AND resource_id = $1`,
      [impersonationId],
    );
    return rows;
  }

  it("records the escape end once, as the Gridmaster, in the target organization", async () => {
    const rows = await endAs("navigation");
    expect(rows).toEqual([
      {
        actor_id: gridmaster,
        org_id: calmHaven,
        details: { initiated_by: "gridmaster", reason: "navigation", trigger: "escape" },
      },
    ]);
  });

  it("writes no row for an end its route records", async () => {
    expect(await endAs("manual")).toEqual([]);
  });

  it("writes no row when nothing was ended", async () => {
    await endAs("navigation");
    await db.query(`DELETE FROM public.audit_log WHERE resource_id = $1`, [impersonationId]);
    expect(await endAs("navigation")).toEqual([]);
  });

  it("keeps 058's end time for an expired end", async () => {
    await db.query(
      `UPDATE public.impersonation_sessions SET expires_at = now() - interval '2 days'
        WHERE session_id = $1`,
      [impersonationId],
    );
    await endAs("expired");
    const { rows } = await db.query<{ at_expiry: boolean }>(
      `SELECT ended_at = expires_at AS at_expiry FROM public.impersonation_sessions
        WHERE session_id = $1`,
      [impersonationId],
    );
    expect(rows[0]!.at_expiry).toBe(true);
  });
});
