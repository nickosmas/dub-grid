// @vitest-environment node

/**
 * Migration 139: starting an impersonation writes its own audit row, so a
 * direct call through the data API is recorded like one through the route
 * (F-201). Runs the migration inside a transaction that is rolled back.
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
  path.resolve(__dirname, "../../../../supabase/migrations/139_impersonation_start_audit_row.sql"),
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

describe.runIf(reachable)("the audit row of an impersonation start (139, live DB)", () => {
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
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  async function startedRows(sessionId: string) {
    const { rows } = await db.query<{
      actor_id: string;
      org_id: string;
      details: Record<string, string>;
      ip_address: string | null;
      user_agent: string | null;
    }>(
      `SELECT actor_id, org_id, details, host(ip_address) AS ip_address, user_agent
         FROM public.audit_log
        WHERE action = 'impersonation.started' AND resource_id = $1`,
      [sessionId],
    );
    return rows;
  }

  it("records a direct start once, as the Gridmaster, in the target organization", async () => {
    await db.query("SET LOCAL ROLE authenticated");
    const { rows } = await db.query<{ result: { session_id: string } }>(
      `SELECT public.start_impersonation($1, 'Support investigation for F-201', '203.0.113.7', 'vitest', $2) AS result`,
      [regular, calmHaven],
    );
    await db.query("RESET ROLE");

    expect(await startedRows(rows[0]!.result.session_id)).toEqual([
      {
        actor_id: gridmaster,
        org_id: calmHaven,
        details: {
          initiated_by: "gridmaster",
          targetUserId: regular,
          justification: "Support investigation for F-201",
        },
        ip_address: "203.0.113.7",
        user_agent: "vitest",
      },
    ]);
  });

  it("writes nothing when the start is refused", async () => {
    const { rows: before } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.audit_log WHERE action = 'impersonation.started'`,
    );
    await db.query("SAVEPOINT refused");
    await expect(
      db.query(`SELECT public.start_impersonation($1, 'too short', NULL, NULL, $2)`, [
        regular,
        calmHaven,
      ]),
    ).rejects.toThrow(/Justification/);
    await db.query("ROLLBACK TO SAVEPOINT refused");
    const { rows: after } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.audit_log WHERE action = 'impersonation.started'`,
    );
    expect(after[0]!.count).toBe(before[0]!.count);
  });
});
