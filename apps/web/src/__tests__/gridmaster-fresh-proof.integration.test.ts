// @vitest-environment node

/**
 * Migration 051: a Gridmaster's grant needs a recent sign-in in the database,
 * by the same rule the routes apply (F-60). Runs the migration and its checks
 * on the seeded local database inside a transaction that is rolled back, so a
 * database that has not applied 051 yet is left as it was.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
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
    "../../../../supabase/migrations/051_gridmaster_grants_need_fresh_proof.sql",
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
let superAdmin: string;
let regular: string;
let calmHaven: string;

const now = () => Math.floor(Date.now() / 1000);

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

async function hasFreshProof(claims: Record<string, unknown>): Promise<boolean> {
  await setClaims(claims);
  const { rows } = await db.query<{ ok: boolean }>(`SELECT public.caller_has_fresh_proof() AS ok`);
  return rows[0]!.ok;
}

/** Runs a statement as the signed-in caller and returns its error message, if any. */
async function asCaller(claims: Record<string, unknown>, sql: string, params: unknown[]) {
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

function password(ageSeconds: number) {
  return { aal: "aal1", amr: [{ method: "password", timestamp: now() - ageSeconds }] };
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  gridmaster = await userId("qa-gridmaster@dubgrid.test");
  superAdmin = await userId("qa-super-admin@dubgrid.test");
  regular = await userId("qa-regular@dubgrid.test");
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  calmHaven = rows[0]!.id;
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("fresh proof in the database (051, live DB)", () => {
  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("applies the routes' password rule", async () => {
    expect(await hasFreshProof({ sub: gridmaster, ...password(10) })).toBe(true);
    expect(await hasFreshProof({ sub: gridmaster, ...password(299) })).toBe(true);
    expect(await hasFreshProof({ sub: gridmaster, ...password(301) })).toBe(false);
    expect(await hasFreshProof({ sub: gridmaster, ...password(-20) })).toBe(true);
    expect(await hasFreshProof({ sub: gridmaster, ...password(-120) })).toBe(false);
    expect(await hasFreshProof({ sub: gridmaster, aal: "aal1" })).toBe(false);
    expect(await hasFreshProof({ sub: gridmaster, aal: "aal1", amr: [] })).toBe(false);
    expect(await hasFreshProof({ sub: gridmaster, amr: password(10).amr })).toBe(false);
  });

  it("proves nothing from a malformed method list, as the routes' parser refuses it", async () => {
    const malformed = {
      sub: gridmaster,
      aal: "aal1",
      amr: [
        { method: "password", timestamp: now() - 10 },
        { method: "otp", timestamp: "yesterday" },
      ],
    };
    expect(await hasFreshProof(malformed)).toBe(false);
  });

  it("requires a recent authenticator code at aal2 once a TOTP factor is verified", async () => {
    await db.query(
      `INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'test', 'totp', 'verified', now(), now())`,
      [gridmaster],
    );
    expect(await hasFreshProof({ sub: gridmaster, ...password(10) })).toBe(false);
    expect(
      await hasFreshProof({
        sub: gridmaster,
        aal: "aal2",
        amr: [{ method: "password", timestamp: now() - 10 }],
      }),
    ).toBe(false);
    expect(
      await hasFreshProof({
        sub: gridmaster,
        aal: "aal2",
        amr: [
          { method: "totp", timestamp: now() - 10 },
          { method: "password", timestamp: now() - 4000 },
        ],
      }),
    ).toBe(true);
    expect(
      await hasFreshProof({
        sub: gridmaster,
        aal: "aal1",
        amr: [{ method: "totp", timestamp: now() - 10 }],
      }),
    ).toBe(false);
  });

  it("refuses every grant function to a Gridmaster without fresh proof", async () => {
    const stale = { sub: gridmaster, ...password(3600) };
    const calls: Array<[string, unknown[]]> = [
      [
        `SELECT public.assign_org_role_by_email('qa-regular@dubgrid.test', $1, 'admin')`,
        [calmHaven],
      ],
      [
        `SELECT public.change_user_role($1, 'admin', $2, gen_random_uuid()::text, $3)`,
        [regular, gridmaster, calmHaven],
      ],
      [`SELECT public.promote_gridmaster_by_email('qa-regular@dubgrid.test')`, []],
      [`SELECT public.demote_gridmaster_account($1, $2, 'user')`, [regular, calmHaven]],
      [`SELECT public.set_gridmaster_account_deactivated($1, true)`, [regular]],
    ];
    for (const [sql, params] of calls) {
      expect(await asCaller(stale, sql, params)).toMatch(/STEP_UP_REQUIRED/);
    }
  });

  it("lets a Gridmaster with fresh proof grant", async () => {
    const fresh = { sub: gridmaster, ...password(10) };
    expect(
      await asCaller(
        fresh,
        `SELECT public.assign_org_role_by_email('qa-regular@dubgrid.test', $1, 'admin')`,
        [calmHaven],
      ),
    ).toBeNull();
  });

  it("asks nothing more of an organization's Super Admin", async () => {
    const staleSuperAdmin = {
      sub: superAdmin,
      org_id: calmHaven,
      org_role: "super_admin",
      ...password(3600),
    };
    const message = await asCaller(
      staleSuperAdmin,
      `SELECT public.change_user_role($1, 'admin', $2, gen_random_uuid()::text, $3)`,
      [regular, superAdmin, calmHaven],
    );
    expect(message ?? "").not.toMatch(/STEP_UP_REQUIRED/);
  });
});
