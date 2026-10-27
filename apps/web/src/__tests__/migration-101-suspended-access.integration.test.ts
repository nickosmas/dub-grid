// @vitest-environment node

/**
 * Migration 101: a suspended employee can't get a token for their
 * organization, can again once reinstated, and keeps every other
 * organization. Leaving Active ends a suspension. Each case runs 101 from its
 * file inside BEGIN/ROLLBACK against the seeded local database.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ACCOUNT_SUSPENDED_MESSAGE } from "@dubgrid/domain";
import { migrationPath } from "./helpers/sql-inventory";

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
    await probe.query("SELECT 1 FROM public.employees LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const MIGRATION = readFileSync(migrationPath("101_suspended_access.sql"), "utf8");

interface Fixture {
  orgId: string;
  empId: string;
  userId: string;
  otherOrgId: string;
}

let db: Client;
let fx: Fixture;

async function loadFixture(): Promise<Fixture> {
  const { rows } = await db.query<Fixture>(
    `SELECT e.org_id AS "orgId", e.id AS "empId", e.user_id AS "userId",
            (SELECT o2.id FROM public.organizations o2
              WHERE o2.id <> e.org_id AND o2.archived_at IS NULL ORDER BY o2.id LIMIT 1) AS "otherOrgId"
       FROM public.employees e
       JOIN public.profiles p ON p.id = e.user_id AND p.org_id = e.org_id
       JOIN public.organizations o ON o.id = e.org_id
      WHERE o.slug = 'calmhaven' AND e.status = 'active' AND e.archived_at IS NULL
        AND p.deactivated_at IS NULL AND p.terminated_at IS NULL
      ORDER BY e.seniority LIMIT 1`,
  );
  if (!rows[0]) throw new Error("No linked Calm Haven employee. Run npm run db:reset");
  return rows[0];
}

type HookResult = { claims?: Record<string, unknown>; error?: { message: string } };

async function mint(): Promise<HookResult> {
  // No session id, so the hook writes no session row and reads profiles.org_id.
  const { rows } = await db.query<{ result: HookResult }>(
    `SELECT public.custom_access_token_hook($1::jsonb) AS result`,
    [
      JSON.stringify({
        user_id: fx.userId,
        claims: { sub: fx.userId, aal: "aal1", role: "authenticated" },
        authentication_method: "password",
      }),
    ],
  );
  return rows[0].result;
}

async function suspend() {
  await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [fx.empId]);
}

describe.skipIf(!reachable)("101 a suspended employee can't sign in to their organization", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    fx = await loadFixture();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    // Lock out any refresh lock left by another suite for this user.
    await db.query(`DELETE FROM public.jwt_refresh_locks WHERE user_id = $1`, [fx.userId]);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refuses a token while suspended, with the sentinel the login routes read", async () => {
    expect((await mint()).claims?.org_id).toBe(fx.orgId);

    await suspend();

    expect(await mint()).toEqual({
      error: { http_code: 403, message: ACCOUNT_SUSPENDED_MESSAGE },
    });
  });

  it("gives a token again once reinstated", async () => {
    await suspend();
    await db.query(`UPDATE public.employees SET suspended_at = NULL WHERE id = $1`, [fx.empId]);

    expect((await mint()).claims?.org_id).toBe(fx.orgId);
  });

  it("leaves their other organizations alone", async () => {
    await suspend();
    await db.query(`UPDATE public.profiles SET org_id = $2 WHERE id = $1`, [
      fx.userId,
      fx.otherOrgId,
    ]);

    expect((await mint()).error).toBeUndefined();
  });

  it("ends a suspension when they leave Active, and refuses one for anyone else", async () => {
    await suspend();
    await db.query(`UPDATE public.employees SET status = 'inactive' WHERE id = $1`, [fx.empId]);

    const { rows } = await db.query<{ suspendedAt: string | null }>(
      `SELECT suspended_at AS "suspendedAt" FROM public.employees WHERE id = $1`,
      [fx.empId],
    );
    expect(rows[0].suspendedAt).toBeNull();

    // The guard clears it on the way in, so an Away person never holds one.
    await suspend();
    const { rows: after } = await db.query<{ suspendedAt: string | null }>(
      `SELECT suspended_at AS "suspendedAt" FROM public.employees WHERE id = $1`,
      [fx.empId],
    );
    expect(after[0].suspendedAt).toBeNull();
  });
});
