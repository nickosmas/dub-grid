// @vitest-environment node

/**
 * Migration 075: a Gridmaster changes an organization's schedule and requests
 * only through an active impersonation of it, started by the same auth session
 * (F-75). Runs the migration inside a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { simulatedTokenClaims } from "./helpers/simulated-jwt";
import { migrationPath } from "./helpers/sql-inventory";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const MIGRATION = readFileSync(
  migrationPath("075_gridmaster_writes_need_impersonation.sql"),
  "utf8",
);
const GUARD = "Start an impersonation of this organization to change its data";

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
let superAdmin: string;
let calmHaven: string;
let requestId: string;

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  return rows[0]!.id;
}

async function setClaims(claims: Record<string, unknown>): Promise<void> {
  await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
    JSON.stringify(simulatedTokenClaims({ role: "authenticated", ...claims })),
  ]);
}

/** Evaluates a helper as the given caller (helpers are not callable by authenticated). */
async function helperAs<T>(claims: Record<string, unknown>, sql: string, params: unknown[]) {
  await setClaims(claims);
  const { rows } = await db.query<{ value: T }>(sql, params);
  return rows[0]!.value;
}

/** Calls a granted function as the signed-in caller: its error message, or null. */
async function callAs(
  claims: Record<string, unknown>,
  sql: string,
  params: unknown[],
): Promise<string | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await setClaims(claims);
    await db.query("SET LOCAL ROLE authenticated");
    await db.query(sql, params);
    return null;
  } catch (error) {
    return (error as Error).message;
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
  superAdmin = await userId("qa-super-admin@dubgrid.test");
  const org = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  calmHaven = org.rows[0]!.id;
  const request = await db.query<{ id: string }>(
    `SELECT id FROM public.shift_requests WHERE org_id = $1 ORDER BY created_at LIMIT 1`,
    [calmHaven],
  );
  if (!request.rows[0]) throw new Error("No seeded Calm Haven request; run npm run db:reset");
  requestId = request.rows[0].id;
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("Gridmaster writes need an impersonation (075, live DB)", () => {
  let sessionId: string;
  let gm: Record<string, unknown>;

  beforeEach(async () => {
    await db.query("BEGIN");
    // Building the wrappers locks the functions; a parallel suite then waits.
    await db.query("SET LOCAL lock_timeout = '10s'");
    // 075 renames each guarded function, so it runs only once: skip it on a
    // database that already has it, which every local stack does once it lands.
    const { rows: applied } = await db.query<{ applied: boolean }>(
      `SELECT to_regprocedure('public.claim_shift_request_unguarded(uuid, uuid)') IS NOT NULL AS applied`,
    );
    if (!applied[0]!.applied) await db.query(MIGRATION);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.user_sessions (user_id, supabase_session_id)
       VALUES ($1, gen_random_uuid()) RETURNING supabase_session_id AS id`,
      [gridmaster],
    );
    sessionId = rows[0]!.id;
    gm = { sub: gridmaster, session_id: sessionId };
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  /** An impersonation of Calm Haven, bound to `authSession`, with the given end state. */
  async function impersonate(authSession: string, end: "active" | "ended" | "expired") {
    await setClaims({ sub: gridmaster, session_id: authSession });
    await db.query(
      `INSERT INTO public.impersonation_sessions
         (gridmaster_id, target_user_id, target_org_id, expires_at, ended_at)
       VALUES ($1, $2, $3,
               CASE WHEN $4 = 'expired' THEN now() - interval '1 minute'
                    ELSE now() + interval '30 minutes' END,
               CASE WHEN $4 = 'ended' THEN now() ELSE NULL END)`,
      [gridmaster, regular, calmHaven, end],
    );
  }

  const authorized = `SELECT public.is_authorized_org($1) AS value`;
  const mayEdit = `SELECT public.check_admin_permission_for_org('canEditShifts', $1) AS value`;
  const outside = `SELECT public.gridmaster_outside_org($1) AS value`;

  it("gives a Gridmaster no authority in an organization they are not impersonating", async () => {
    expect(await helperAs(gm, authorized, [calmHaven])).toBe(false);
    expect(await helperAs(gm, mayEdit, [calmHaven])).toBe(false);
    expect(await helperAs(gm, outside, [calmHaven])).toBe(true);
  });

  it("gives it back for an active impersonation started by the same session", async () => {
    await impersonate(sessionId, "active");
    expect(await helperAs(gm, authorized, [calmHaven])).toBe(true);
    expect(await helperAs(gm, mayEdit, [calmHaven])).toBe(true);
    expect(await helperAs(gm, outside, [calmHaven])).toBe(false);
  });

  it.each(["ended", "expired"] as const)("refuses an impersonation that has %s", async (end) => {
    await impersonate(sessionId, end);
    expect(await helperAs(gm, authorized, [calmHaven])).toBe(false);
    expect(await helperAs(gm, outside, [calmHaven])).toBe(true);
  });

  it("refuses an impersonation another session started", async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.user_sessions (user_id, supabase_session_id)
       VALUES ($1, gen_random_uuid()) RETURNING supabase_session_id AS id`,
      [gridmaster],
    );
    await impersonate(rows[0]!.id, "active");
    expect(await helperAs(gm, authorized, [calmHaven])).toBe(false);
    expect(await helperAs(gm, outside, [calmHaven])).toBe(true);
  });

  it("never stops someone who is not a Gridmaster", async () => {
    expect(await helperAs({ sub: superAdmin }, outside, [calmHaven])).toBe(false);
  });

  // The eight schedule functions test `IF NOT check_admin_permission_for_org(...)`;
  // a NULL there would let the caller through, so this runs one for real.
  const deleteDraft = `SELECT public.delete_schedule_cell_draft($1, gen_random_uuid(), '2031-12-02')`;

  it("refuses a Gridmaster's schedule change outside an impersonation", async () => {
    expect(await callAs(gm, deleteDraft, [calmHaven])).toBe(
      "Unauthorized: missing canEditShifts permission",
    );
  });

  it("lets a Gridmaster's schedule change past the permission check inside one", async () => {
    await impersonate(sessionId, "active");
    const outcome = await callAs(gm, deleteDraft, [calmHaven]);
    expect(outcome ?? "").not.toMatch(/^Unauthorized/);
  });

  it("refuses a Gridmaster's request settlement and publish outside an impersonation", async () => {
    expect(
      await callAs(gm, `SELECT public.resolve_shift_request($1, false, NULL)`, [requestId]),
    ).toBe(GUARD);
    expect(
      await callAs(gm, `SELECT public.publish_schedule($1, '2031-12-01', '2031-12-07')`, [
        calmHaven,
      ]),
    ).toBe(GUARD);
  });

  it("lets them past the guard inside an impersonation", async () => {
    await impersonate(sessionId, "active");
    const settle = await callAs(gm, `SELECT public.resolve_shift_request($1, false, NULL)`, [
      requestId,
    ]);
    // Whatever the request's own rules say, it is no longer the guard refusing.
    expect(settle).not.toBe(GUARD);
  });

  it("keeps every unguarded body out of a signed-in caller's reach", async () => {
    const { rows } = await db.query<{ name: string; callable: boolean }>(
      `SELECT p.oid::regprocedure::text AS name,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS callable
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE '%\\_unguarded'`,
    );
    expect(rows).toHaveLength(8);
    expect(rows.filter((row) => row.callable)).toEqual([]);
  });
});
