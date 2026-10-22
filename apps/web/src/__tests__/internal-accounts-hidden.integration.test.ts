// @vitest-environment node

/**
 * Migration 081: internal (QA) accounts are hidden from client organizations.
 * A client member cannot read an internal person's staff row, membership or
 * profile, directly or through the directory functions; a Gridmaster and an
 * internal account still can, and only a Gridmaster can change the flag.
 * Runs the migration inside a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { beginWithLocks, policyGrantTables } from "./helpers/migration-locks";
import { simulatedTokenClaims } from "./helpers/simulated-jwt";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../../supabase/migrations/081_internal_accounts.sql"),
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
let calmHaven: string;
let viewer: string;
let internalPerson: string;
let clientMember: string;
let gridmaster: string;
let migrationLocks: string[];

const now = () => Math.floor(Date.now() / 1000);
const freshPassword = { aal: "aal1", amr: [{ method: "password", timestamp: now() - 10 }] };

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  return rows[0]!.id;
}

/** Runs a statement as the signed-in caller: its rows, or the error. */
async function asCaller<Row extends Record<string, unknown>>(
  claims: Record<string, unknown>,
  sql: string,
  params: unknown[],
): Promise<{ rows: Row[] } | { error: string }> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(simulatedTokenClaims({ role: "authenticated", ...claims })),
    ]);
    await db.query("SET LOCAL ROLE authenticated");
    const result = await db.query<Row>(sql, params);
    return { rows: result.rows };
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    await db.query("RESET ROLE");
  }
}

async function setInternal(id: string, value: boolean): Promise<void> {
  await db.query(`UPDATE public.profiles SET is_internal = $2 WHERE id = $1`, [id, value]);
}

const superAdmin = () => ({
  sub: viewer,
  org_id: calmHaven,
  org_role: "super_admin",
  ...freshPassword,
});
const gridmasterClaims = () => ({ sub: gridmaster, ...freshPassword });

const personReads = {
  employees: `SELECT id FROM public.employees WHERE org_id = $1 AND user_id = $2`,
  memberships: `SELECT user_id FROM public.organization_memberships WHERE org_id = $1 AND user_id = $2`,
  profiles: `SELECT id FROM public.profiles WHERE org_id = $1 AND id = $2`,
};

async function visibleReads(claims: Record<string, unknown>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, sql] of Object.entries(personReads)) {
    const result = await asCaller(claims, sql, [calmHaven, internalPerson]);
    if ("error" in result) throw new Error(`${table}: ${result.error}`);
    counts[table] = result.rows.length;
  }
  return counts;
}

async function directoryUserIds(claims: Record<string, unknown>): Promise<string[]> {
  const result = await asCaller<{ user_id: string | null }>(
    claims,
    `SELECT user_id FROM public.get_org_directory($1, 10000, 0)`,
    [calmHaven],
  );
  if ("error" in result) throw new Error(result.error);
  return result.rows.map((row) => row.user_id).filter((id): id is string => id !== null);
}

async function orgUserIds(claims: Record<string, unknown>): Promise<string[]> {
  const result = await asCaller<{ id: string }>(claims, `SELECT id FROM public.get_org_users($1)`, [
    calmHaven,
  ]);
  if ("error" in result) throw new Error(result.error);
  return result.rows.map((row) => row.id);
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  viewer = await userId("qa-super-admin@dubgrid.test");
  internalPerson = await userId("qa-admin@dubgrid.test");
  clientMember = await userId("qa-regular@dubgrid.test");
  gridmaster = await userId("qa-gridmaster@dubgrid.test");
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  calmHaven = rows[0]!.id;
  migrationLocks = [
    "public.profiles",
    "public.employees",
    "public.organization_memberships",
    ...(await policyGrantTables(db)),
  ];
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("internal accounts hidden from clients (081, live DB)", () => {
  beforeEach(async () => {
    await beginWithLocks(db, migrationLocks);
    await db.query(MIGRATION);
    // The backfill flags every @dubgrid.test account; make two of them clients.
    await setInternal(viewer, false);
    await setInternal(clientMember, false);
  }, 60_000);
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("flags the existing @dubgrid.test accounts", async () => {
    const { rows } = await db.query<{ is_internal: boolean }>(
      `SELECT is_internal FROM public.profiles WHERE id = $1`,
      [internalPerson],
    );
    expect(rows[0]?.is_internal).toBe(true);
  });

  it("hides an internal person's rows from a client super admin", async () => {
    expect(await visibleReads(superAdmin())).toEqual({ employees: 0, memberships: 0, profiles: 0 });
    // The client still reads everyone else.
    const others = await asCaller(
      superAdmin(),
      `SELECT id FROM public.employees WHERE org_id = $1 AND user_id = $2`,
      [calmHaven, clientMember],
    );
    expect(others).toEqual({ rows: [expect.objectContaining({ id: expect.any(String) })] });
  });

  it("leaves internal people out of both directory functions for a client", async () => {
    const directory = await directoryUserIds(superAdmin());
    expect(directory).toContain(clientMember);
    expect(directory).not.toContain(internalPerson);
    const users = await orgUserIds(superAdmin());
    expect(users).toContain(clientMember);
    expect(users).not.toContain(internalPerson);
  });

  it("shows internal people to an internal account", async () => {
    await setInternal(viewer, true);
    expect(await visibleReads(superAdmin())).toEqual({ employees: 1, memberships: 1, profiles: 1 });
    expect(await directoryUserIds(superAdmin())).toContain(internalPerson);
    expect(await orgUserIds(superAdmin())).toContain(internalPerson);
  });

  it("shows internal people to a Gridmaster", async () => {
    const reads = await visibleReads(gridmasterClaims());
    expect(reads.employees).toBe(1);
    expect(reads.memberships).toBe(1);
    expect(await directoryUserIds(gridmasterClaims())).toContain(internalPerson);
    expect(await orgUserIds(gridmasterClaims())).toContain(internalPerson);
  });

  const flagMember = `UPDATE public.profiles SET is_internal = TRUE WHERE id = $1 RETURNING id`;

  it("gives no token a direct write to the flag", async () => {
    for (const claims of [superAdmin(), gridmasterClaims()]) {
      expect(await asCaller(claims, flagMember, [clientMember])).toEqual({
        error: expect.stringMatching(/permission denied/),
      });
    }
  });

  /** As a SECURITY DEFINER function runs: the owner's privileges, the caller's claims. */
  async function asDefinerFor(claims: Record<string, unknown>) {
    await db.query("SAVEPOINT attempt");
    try {
      await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
        JSON.stringify(simulatedTokenClaims({ role: "authenticated", ...claims })),
      ]);
      return { rows: (await db.query(flagMember, [clientMember])).rows };
    } catch (error) {
      return { error: (error as Error).message };
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT attempt");
    }
  }

  it("refuses the change in code running for anyone but a Gridmaster", async () => {
    expect(await asDefinerFor(superAdmin())).toEqual({
      error: expect.stringMatching(/Only a Gridmaster/),
    });
    expect(await asDefinerFor(gridmasterClaims())).toEqual({ rows: [{ id: clientMember }] });
    expect(await asDefinerFor({ role: "service_role" })).toEqual({ rows: [{ id: clientMember }] });
  });
});
