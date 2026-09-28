// @vitest-environment node

/**
 * Migration 073: a completed sign-in is recorded once per Auth session, even
 * when two completion calls race (F-25).
 *
 * The concurrent case needs the function committed, so it runs against the
 * migrated local database (`npm run db:reset` applies 073) with a throwaway
 * actor id, whose rows it removes. The other cases run 073 from its file
 * inside BEGIN/ROLLBACK.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
const MIGRATION = readFileSync(migrationPath("073_record_sign_in_once.sql"), "utf8");

let db: Client;
let other: Client;

async function record(client: Client, actorId: string, sessionHash: string): Promise<boolean> {
  const { rows } = await client.query<{ recorded: boolean }>(
    `SELECT public.record_sign_in_once($1, NULL, $2::jsonb) AS recorded`,
    [actorId, JSON.stringify({ surface: "web", method: "totp", sessionHash })],
  );
  return rows[0]!.recorded;
}

async function successRows(actorId: string): Promise<Array<{ details: Record<string, string> }>> {
  const { rows } = await db.query<{ details: Record<string, string> }>(
    `SELECT details FROM public.audit_log
      WHERE action = 'security.auth.login' AND actor_id = $1
      ORDER BY id`,
    [actorId],
  );
  return rows;
}

describe.runIf(reachable)("a completed sign-in is recorded once (073, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    other = new Client(DB_CONFIG);
    await Promise.all([db.connect(), other.connect()]);
  });

  afterAll(async () => {
    await Promise.all([db?.end(), other?.end()]);
  });

  it("records the first call for a session only, as the app's writer would", async () => {
    const actorId = randomUUID();
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      expect(await record(db, actorId, "hash-a")).toBe(true);
      expect(await record(db, actorId, "hash-a")).toBe(false);
      expect(await record(db, actorId, "hash-b")).toBe(true);

      const rows = await successRows(actorId);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.details).toEqual({
        outcome: "succeeded",
        reason: "accepted",
        surface: "web",
        method: "totp",
        sessionHash: "hash-a",
      });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("counts a reauthentication's session as already recorded", async () => {
    const actorId = randomUUID();
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      await db.query(
        `INSERT INTO public.audit_log (actor_id, action, resource_type, details)
         VALUES ($1, 'security.auth.mfa', 'user',
                 '{"outcome": "succeeded", "reason": "reauthenticated", "sessionHash": "hash-r"}')`,
        [actorId],
      );
      expect(await record(db, actorId, "hash-r")).toBe(false);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("refuses a call with no session to key on, and only the service role may call", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      await db.query("SAVEPOINT no_session");
      await expect(
        db.query(`SELECT public.record_sign_in_once($1, NULL, '{}'::jsonb)`, [randomUUID()]),
      ).rejects.toThrow(/known person and session/);
      await db.query("ROLLBACK TO SAVEPOINT no_session");

      const { rows } = await db.query<{ role: string; allowed: boolean }>(
        `SELECT role, has_function_privilege(role, 'public.record_sign_in_once(uuid, uuid, jsonb)', 'EXECUTE') AS allowed
           FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`,
      );
      expect(Object.fromEntries(rows.map((row) => [row.role, row.allowed]))).toEqual({
        anon: false,
        authenticated: false,
        service_role: true,
      });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("records one row when two calls for the same session race", async () => {
    const actorId = randomUUID();
    try {
      await db.query("BEGIN");
      expect(await record(db, actorId, "hash-race")).toBe(true);
      // The second call waits on the first's lock, then finds its row.
      const second = record(other, actorId, "hash-race");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await db.query("COMMIT");

      expect(await second).toBe(false);
      expect(await successRows(actorId)).toHaveLength(1);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.query(`DELETE FROM public.audit_log WHERE actor_id = $1`, [actorId]);
    }
  });
});
