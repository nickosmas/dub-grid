// @vitest-environment node

/**
 * Finding F-01, runtime half: `caller_mfa_challenge_pending` (migration 041)
 * against the local database.
 *
 * Supabase will not mint a token without the `mfa_enrolled` claim any more, so
 * the absent-claim case cannot be reached through a real sign-in. It is driven
 * here by setting `request.jwt.claims` inside a rolled-back transaction, the
 * same way the other policy-helper guards are exercised. Read-only: no row is
 * written and every case rolls back.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  if (db) await db.end().catch(() => undefined);
});

/** Evaluates the helper under a synthesized token, then rolls back. */
async function pendingFor(claims: Record<string, unknown>): Promise<boolean> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000001",
        role: "authenticated",
        ...claims,
      }),
    ]);
    const { rows } = await db.query<{ pending: boolean }>(
      "SELECT public.caller_mfa_challenge_pending() AS pending",
    );
    return rows[0].pending;
  } finally {
    await db.query("ROLLBACK");
  }
}

describe.runIf(reachable)("caller_mfa_challenge_pending (live DB, migration 041)", () => {
  it("lets the ordinary case through, which is what keeps this from being an outage", async () => {
    // Every account in production is this case: the hook looked and found no
    // verified factor.
    expect(await pendingFor({ aal: "aal1", mfa_enrolled: false })).toBe(false);
  });

  it("holds an enrolled account below aal2 and releases it once answered", async () => {
    expect(await pendingFor({ aal: "aal1", mfa_enrolled: true })).toBe(true);
    expect(await pendingFor({ aal: "aal2", mfa_enrolled: true })).toBe(false);
  });

  it("fails closed when the claim is absent", async () => {
    // The bypass: before 041 this was false, so a hook that stopped minting
    // the claim would have disabled enforcement with nothing to notice.
    expect(await pendingFor({ aal: "aal1" })).toBe(true);
  });

  it("still admits an absent claim at aal2, so answering a challenge is never wasted", async () => {
    expect(await pendingFor({ aal: "aal2" })).toBe(false);
  });

  it("rejects a value of the wrong JSON type instead of reading it as a boolean", async () => {
    // `->>` renders the string "false" and the boolean false alike; the helper
    // compares jsonb, so only the boolean the hook mints counts.
    expect(await pendingFor({ aal: "aal1", mfa_enrolled: "false" })).toBe(true);
    expect(await pendingFor({ aal: "aal1", mfa_enrolled: "true" })).toBe(true);
  });

  it("denies a malformed claim rather than raising inside a policy", async () => {
    await expect(pendingFor({ aal: "aal1", mfa_enrolled: "garbage" })).resolves.toBe(true);
    await expect(pendingFor({ aal: "aal1", mfa_enrolled: 7 })).resolves.toBe(true);
  });

  it("treats a missing aal as unanswered", async () => {
    expect(await pendingFor({ mfa_enrolled: true })).toBe(true);
  });
});
