// @vitest-environment node

/**
 * Migrations 037 and 038: an account with a verified TOTP factor reads
 * nothing through the data API until it has answered a challenge. The claim
 * comes from the access token hook and the two policy helpers every policy is
 * written on read it, so the data API and Realtime are closed to that token.
 *
 * This test drives the real auth server: it enrolls a factor on a seeded QA
 * account, answers the challenge with a computed TOTP code, and unenrolls
 * again, so the account is left exactly as it was found.
 *
 * Skipped when the local Supabase stack is unreachable (CI without it).
 */

import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
// The Supabase CLI's fixed local demo anon key, the same default the DB URL
// above uses. A different local stack can override it; production keys never
// reach this file.
const LOCAL_DEMO_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  LOCAL_DEMO_ANON_KEY;
const PROBE_EMAIL = "qa-mfa-chromium@dubgrid.test";
const PROBE_PASSWORD = process.env.LOCAL_SUPABASE_SUPER_ADMIN_PASSWORD ?? "password123";

/** RFC 6238 TOTP over the base32 secret the enrollment returns. */
function totpCode(secretBase32: string, atSeconds = Date.now() / 1000): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secretBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atSeconds / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function claimsOf(accessToken: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64").toString());
}

async function readsAnyEmployee(accessToken: string): Promise<boolean> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id&limit=1`, {
    headers: { apikey: ANON_KEY as string, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return false;
  return ((await response.json()) as unknown[]).length > 0;
}

async function reachable(): Promise<boolean> {
  if (!ANON_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    return response.ok;
  } catch {
    return false;
  }
}

const live = await reachable();

let client: SupabaseClient;
let factorId: string | null = null;

beforeAll(async () => {
  if (!live) return;
  client = createClient(SUPABASE_URL, ANON_KEY as string, { auth: { persistSession: false } });
});

afterAll(async () => {
  // Leave the seeded account exactly as found, whatever the assertions did.
  if (factorId && client) await client.auth.mfa.unenroll({ factorId }).catch(() => undefined);
});

describe.runIf(live)("MFA is enforced for data access (live stack)", () => {
  it("closes the data API to an enrolled account until it answers a challenge", async () => {
    const { data: signedIn, error } = await client.auth.signInWithPassword({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
    });
    expect(error).toBeNull();

    // With no factor: not enrolled, and the roster reads normally.
    expect(claimsOf(signedIn.session!.access_token).mfa_enrolled).toBe(false);
    expect(await readsAnyEmployee(signedIn.session!.access_token)).toBe(true);

    const { data: enrolled } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `integration-${Date.now()}`,
    });
    factorId = enrolled!.id;
    const { data: verified } = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled!.id,
      code: totpCode(enrolled!.totp.secret),
    });

    // Answered: aal2, and access is unchanged.
    expect(claimsOf(verified!.access_token).aal).toBe("aal2");
    expect(claimsOf(verified!.access_token).mfa_enrolled).toBe(true);
    expect(await readsAnyEmployee(verified!.access_token)).toBe(true);

    // The same session after a refresh keeps its answer, which is what makes
    // enforcing on the claim safe.
    const { data: refreshed } = await client.auth.refreshSession({
      refresh_token: verified!.refresh_token,
    });
    expect(claimsOf(refreshed.session!.access_token).aal).toBe("aal2");
    expect(await readsAnyEmployee(refreshed.session!.access_token)).toBe(true);

    // A second, password-only sign-in for the same account is the bypass this
    // closes: enrolled, aal1, and now it reads nothing.
    const attacker = createClient(SUPABASE_URL, ANON_KEY as string, {
      auth: { persistSession: false },
    });
    const { data: passwordOnly } = await attacker.auth.signInWithPassword({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
    });
    const bypassClaims = claimsOf(passwordOnly.session!.access_token);
    expect(bypassClaims.mfa_enrolled).toBe(true);
    expect(bypassClaims.aal).toBe("aal1");
    expect(await readsAnyEmployee(passwordOnly.session!.access_token)).toBe(false);

    // Unenrolling heals on the next token rather than stranding the account.
    await client.auth.mfa.unenroll({ factorId: enrolled!.id });
    factorId = null;
    const { data: healed } = await client.auth.refreshSession({
      refresh_token: refreshed.session!.refresh_token,
    });
    expect(claimsOf(healed.session!.access_token).mfa_enrolled).toBe(false);
    expect(await readsAnyEmployee(healed.session!.access_token)).toBe(true);
  }, 60_000);
});
