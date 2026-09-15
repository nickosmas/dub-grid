/**
 * Local Supabase integration coverage for the sensitive-action assurance
 * contract. The test owns a disposable Auth user and removes it directly from
 * the local database in `finally`, so it never changes a seeded account.
 *
 * Skipped when the local Auth service or database is unavailable.
 */

import { createHmac, randomBytes } from "node:crypto";

import { createClient, type Session } from "@supabase/supabase-js";
import {
  SENSITIVE_ACTION_FRESHNESS_SECONDS,
  evaluateSensitiveActionAssurance,
  type AuthenticationAssuranceClaims,
} from "@dubgrid/authz";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlLWRlbW8iLCJyb2xlIjoiYW5vbiIsImV4cCI6MTk4MzgxMjk5Nn0.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

function decodeJwtClaims(token: string): AuthenticationAssuranceClaims {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Malformed JWT");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(
    Buffer.from(padded, "base64url").toString("utf8"),
  ) as AuthenticationAssuranceClaims;
}

function matchingTimestamp(claims: AuthenticationAssuranceClaims, method: "password" | "totp") {
  if (!Array.isArray(claims.amr)) throw new Error("JWT has no AMR records");
  const timestamps = claims.amr
    .filter((entry) => entry?.method === method && typeof entry.timestamp === "number")
    .map((entry) => entry.timestamp as number);
  if (timestamps.length === 0) throw new Error(`JWT has no ${method} AMR record`);
  return Math.max(...timestamps);
}

function decodeBase32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/u, "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid base32 TOTP secret");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, epochSeconds = Math.floor(Date.now() / 1000)): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochSeconds / 30)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

async function probeLocalSupabase(): Promise<boolean> {
  const database = new Client({ connectionString: DB_URL });
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    if (!response.ok) return false;
    await database.connect();
    await database.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await database.end().catch(() => undefined);
  }
}

async function removeDisposableUser(userId: string): Promise<void> {
  const database = new Client({ connectionString: DB_URL });
  await database.connect();
  try {
    await database.query("DELETE FROM auth.users WHERE id = $1", [userId]);
  } finally {
    await database.end();
  }
}

function requireSession(session: Session | null, context: string): Session {
  if (!session) throw new Error(`${context} did not return a session`);
  return session;
}

describe.runIf(await probeLocalSupabase())("local Supabase MFA assurance", () => {
  it("preserves human-proof timestamps across refresh and enforces the live factor method", async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: `mfa-assurance-primary-${Date.now()}`,
      },
    });
    const email = `mfa-assurance-${Date.now()}-${randomBytes(6).toString("hex")}@dubgrid.test`;
    const password = `Local-${randomBytes(18).toString("base64url")}9`;
    let userId: string | null = null;

    try {
      const signup = await client.auth.signUp({ email, password });
      expect(signup.error).toBeNull();
      userId = signup.data.user?.id ?? null;
      expect(userId).toEqual(expect.any(String));

      const passwordSession = requireSession(signup.data.session, "Signup");
      const passwordClaims = decodeJwtClaims(passwordSession.access_token);
      const passwordAt = matchingTimestamp(passwordClaims, "password");
      expect(
        evaluateSensitiveActionAssurance({
          claims: passwordClaims,
          hasVerifiedTotpFactor: false,
          nowEpochSeconds: passwordAt + 60,
        }),
      ).toMatchObject({ allowed: true, requiredMethod: "password" });

      const passwordRefresh = await client.auth.refreshSession(passwordSession);
      expect(passwordRefresh.error).toBeNull();
      const refreshedPasswordClaims = decodeJwtClaims(
        requireSession(passwordRefresh.data.session, "Password refresh").access_token,
      );
      expect(matchingTimestamp(refreshedPasswordClaims, "password")).toBe(passwordAt);
      expect(
        evaluateSensitiveActionAssurance({
          claims: refreshedPasswordClaims,
          hasVerifiedTotpFactor: false,
          nowEpochSeconds: passwordAt + SENSITIVE_ACTION_FRESHNESS_SECONDS + 1,
        }),
      ).toMatchObject({ allowed: false, requiredMethod: "password", reason: "stale-proof" });

      const enrollment = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Disposable assurance test",
      });
      expect(enrollment.error).toBeNull();
      const enrollmentData = enrollment.data;
      if (!enrollmentData) throw new Error("TOTP enrollment returned no factor");
      const factorId = enrollmentData.id;
      const challenge = await client.auth.mfa.challengeAndVerify({
        factorId,
        code: generateTotp(enrollmentData.totp.secret),
      });
      expect(challenge.error).toBeNull();

      const aal2Session = requireSession(challenge.data, "TOTP verification");
      const aal2Claims = decodeJwtClaims(aal2Session.access_token);
      const totpAt = matchingTimestamp(aal2Claims, "totp");
      expect(aal2Claims.aal).toBe("aal2");
      expect(
        evaluateSensitiveActionAssurance({
          claims: aal2Claims,
          hasVerifiedTotpFactor: true,
          nowEpochSeconds: totpAt + 60,
        }),
      ).toMatchObject({ allowed: true, requiredMethod: "totp" });

      const aal2Refresh = await client.auth.refreshSession(aal2Session);
      expect(aal2Refresh.error).toBeNull();
      const refreshedAal2 = requireSession(aal2Refresh.data.session, "AAL2 refresh");
      const refreshedAal2Claims = decodeJwtClaims(refreshedAal2.access_token);
      expect(refreshedAal2Claims.aal).toBe("aal2");
      expect(matchingTimestamp(refreshedAal2Claims, "totp")).toBe(totpAt);
      expect(
        evaluateSensitiveActionAssurance({
          claims: refreshedAal2Claims,
          hasVerifiedTotpFactor: true,
          nowEpochSeconds: totpAt + SENSITIVE_ACTION_FRESHNESS_SECONDS + 1,
        }),
      ).toMatchObject({ allowed: false, requiredMethod: "totp", reason: "stale-proof" });

      const downgradedClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
          storageKey: `mfa-assurance-downgraded-${Date.now()}`,
        },
      });
      const downgraded = await downgradedClient.auth.signInWithPassword({ email, password });
      expect(downgraded.error).toBeNull();
      const downgradedClaims = decodeJwtClaims(
        requireSession(downgraded.data.session, "Password sign-in after TOTP enrollment")
          .access_token,
      );
      expect(downgradedClaims.aal).toBe("aal1");
      expect(
        evaluateSensitiveActionAssurance({
          claims: downgradedClaims,
          hasVerifiedTotpFactor: true,
          nowEpochSeconds: matchingTimestamp(downgradedClaims, "password") + 60,
        }),
      ).toMatchObject({ allowed: false, requiredMethod: "totp", reason: "insufficient-aal" });

      const restored = await client.auth.setSession({
        access_token: refreshedAal2.access_token,
        refresh_token: refreshedAal2.refresh_token,
      });
      expect(restored.error).toBeNull();
      const unenrollment = await client.auth.mfa.unenroll({ factorId });
      expect(unenrollment.error).toBeNull();
      const factors = await client.auth.mfa.listFactors();
      expect(factors.error).toBeNull();
      expect(factors.data?.totp.some((factor) => factor.status === "verified")).toBe(false);
    } finally {
      if (userId) await removeDisposableUser(userId);
    }
  }, 30_000);
});
