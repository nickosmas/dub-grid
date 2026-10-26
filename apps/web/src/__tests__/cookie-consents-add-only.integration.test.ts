// @vitest-environment node

/**
 * Migration 097: cookie consent records are add-only. Only the service role,
 * behind POST /api/consent, inserts them; nobody updates one; a Gridmaster and
 * the person themselves can read; the service role deletes them with the
 * account. Fixtures live in a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { simulatedTokenClaims } from "./helpers/simulated-jwt";

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
let db: Client;

const gridmaster = randomUUID();
const person = randomUUID();
const otherPerson = randomUUID();
const INSERT_ROW = `INSERT INTO public.cookie_consents (user_id, ip_hash, consent, consent_version)
  VALUES ($1, 'hash', '{"essential": true, "analytics": true}', '1.2')`;

type Caller = { role: "anon" } | { role: "service_role" } | { role: "authenticated"; sub: string };

/** Runs a statement as the caller: the affected row count, or the error. */
async function as(
  caller: Caller,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: number } | { error: string }> {
  await db.query("SAVEPOINT attempt");
  try {
    const claims = caller.role === "authenticated" ? { sub: caller.sub } : {};
    await db.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify(simulatedTokenClaims({ role: caller.role, ...claims })),
    ]);
    await db.query(`SET LOCAL ROLE ${caller.role}`);
    const result = await db.query(sql, params);
    return { rows: result.rowCount ?? 0 };
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    await db.query("RESET ROLE");
  }
}

async function createUser(id: string): Promise<void> {
  await db.query(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, NOW(), NOW())`,
    [id, `consent-${id}@dubgrid.test`],
  );
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("cookie consent records are add-only (097, live DB)", () => {
  beforeEach(async () => {
    await db.query("BEGIN");
    for (const id of [gridmaster, person, otherPerson]) await createUser(id);
    await db.query(`UPDATE public.profiles SET platform_role = 'gridmaster' WHERE id = $1`, [
      gridmaster,
    ]);
    await db.query(INSERT_ROW, [person]);
    await db.query(INSERT_ROW, [otherPerson]);
  });
  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("leaves anon and authenticated no write grant on the table", async () => {
    const { rows } = await db.query<{ grantee: string; privilege_type: string }>(
      `SELECT grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'cookie_consents'
          AND grantee IN ('anon', 'authenticated')
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
        ORDER BY grantee, privilege_type`,
    );
    expect(rows).toEqual([]);
  });

  it("refuses a direct insert from a signed-out visitor or a signed-in person", async () => {
    expect(await as({ role: "anon" }, INSERT_ROW, [null])).toEqual({
      error: expect.stringMatching(/permission denied/),
    });
    expect(await as({ role: "authenticated", sub: person }, INSERT_ROW, [person])).toEqual({
      error: expect.stringMatching(/permission denied/),
    });
  });

  it("shows a person only their own records, and lets them change none", async () => {
    const caller = { role: "authenticated", sub: person } as const;
    expect(await as(caller, `SELECT 1 FROM public.cookie_consents`)).toEqual({ rows: 1 });
    expect(
      await as(
        caller,
        `UPDATE public.cookie_consents SET consent_version = 'x' WHERE user_id = $1`,
        [person],
      ),
    ).toEqual({ error: expect.stringMatching(/permission denied/) });
    expect(
      await as(caller, `DELETE FROM public.cookie_consents WHERE user_id = $1`, [person]),
    ).toEqual({ error: expect.stringMatching(/permission denied/) });
  });

  it("lets a Gridmaster read every record but not change or delete one", async () => {
    const caller = { role: "authenticated", sub: gridmaster } as const;
    expect(
      await as(caller, `SELECT 1 FROM public.cookie_consents WHERE user_id IN ($1, $2)`, [
        person,
        otherPerson,
      ]),
    ).toEqual({ rows: 2 });
    expect(
      await as(
        caller,
        `UPDATE public.cookie_consents SET consent_version = 'x' WHERE user_id = $1`,
        [person],
      ),
    ).toEqual({ error: expect.stringMatching(/permission denied/) });
    expect(
      await as(caller, `DELETE FROM public.cookie_consents WHERE user_id = $1`, [person]),
    ).toEqual({ error: expect.stringMatching(/permission denied/) });
  });

  it("refuses an update from the service role too", async () => {
    expect(
      await as(
        { role: "service_role" },
        `UPDATE public.cookie_consents SET consent_version = 'x' WHERE user_id = $1`,
        [person],
      ),
    ).toEqual({ error: expect.stringMatching(/cookie consent records cannot be changed/) });
  });

  it("lets the service role add a record and delete a person's with their account", async () => {
    expect(await as({ role: "service_role" }, INSERT_ROW, [null])).toEqual({ rows: 1 });
    expect(
      await as({ role: "service_role" }, `DELETE FROM public.cookie_consents WHERE user_id = $1`, [
        person,
      ]),
    ).toEqual({ rows: 1 });
  });
});
