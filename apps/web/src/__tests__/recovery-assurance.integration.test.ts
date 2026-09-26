// @vitest-environment node

/**
 * The provider facts password recovery is built on (41b2), proven on the local
 * Supabase Auth with disposable users removed in `finally`. A recovery session
 * is aal1 with an `otp` proof; with a verified factor the password update is
 * refused until a TOTP verify promotes that same session to aal2, and the
 * `otp` proof the recovery sign-out checks survives the promotion.
 *
 * Skipped when the local Auth service or database is unavailable.
 */

import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { hasFreshRecoveryProof } from "@/lib/auth/session-sign-out";
import {
  ANON_KEY,
  DB_URL,
  SUPABASE_URL,
  decodeJwtClaims,
  generateTotp,
  probeLocalSupabase,
  removeDisposableUser,
  requireSession,
} from "./helpers/local-supabase-auth";

type RecoveryClaims = { aal?: string; session_id?: string; amr?: unknown };

function claimsOf(accessToken: string): RecoveryClaims {
  return decodeJwtClaims(accessToken) as RecoveryClaims;
}

function methodsOf(claims: RecoveryClaims): string[] {
  if (!Array.isArray(claims.amr)) return [];
  return claims.amr.map((entry: { method?: unknown }) => String(entry.method)).sort();
}

function newClient(label: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `recovery-assurance-${label}-${Date.now()}`,
    },
  });
}

async function signUpDisposable(client: SupabaseClient) {
  const email = `recovery-assurance-${Date.now()}-${randomBytes(6).toString("hex")}@dubgrid.test`;
  const password = `Local-${randomBytes(18).toString("base64url")}9`;
  const signup = await client.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const userId = signup.data.user?.id;
  if (!userId) throw new Error("Signup returned no user");
  return { email, userId };
}

/** Requests recovery the real way, then opens it with the stored token hash. */
async function openRecoverySession(email: string, userId: string): Promise<SupabaseClient> {
  const requester = newClient("request");
  const request = await requester.auth.resetPasswordForEmail(email);
  expect(request.error).toBeNull();

  const database = new Client({ connectionString: DB_URL });
  await database.connect();
  let tokenHash: string | undefined;
  try {
    const { rows } = await database.query<{ token_hash: string }>(
      `SELECT token_hash FROM auth.one_time_tokens
        WHERE user_id = $1 AND token_type = 'recovery_token'
        ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    tokenHash = rows[0]?.token_hash;
  } finally {
    await database.end();
  }
  if (!tokenHash) throw new Error("No recovery token was stored");

  const recovery = newClient("recovery");
  const verified = await recovery.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  expect(verified.error).toBeNull();
  return recovery;
}

async function nextTotpWindow(): Promise<void> {
  const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
  await new Promise((resolve) => setTimeout(resolve, (secondsLeft + 1) * 1000));
}

describe.runIf(await probeLocalSupabase())("local Supabase recovery assurance", () => {
  it("lets a plain account set a new password on its otp-proved recovery session", async () => {
    const { email, userId } = await signUpDisposable(newClient("plain"));
    try {
      const recovery = await openRecoverySession(email, userId);
      const session = requireSession((await recovery.auth.getSession()).data.session, "Recovery");
      const claims = claimsOf(session.access_token);

      expect(claims.aal).toBe("aal1");
      expect(methodsOf(claims)).toEqual(["otp"]);
      expect(hasFreshRecoveryProof(claims as Record<string, unknown>)).toBe(true);

      const update = await recovery.auth.updateUser({
        password: `New-${randomBytes(12).toString("base64url")}7`,
      });
      expect(update.error).toBeNull();
    } finally {
      await removeDisposableUser(userId);
    }
  });

  it("requires the authenticator code before a two-factor account's new password", async () => {
    const owner = newClient("enrolled");
    const { email, userId } = await signUpDisposable(owner);
    try {
      const enrollment = await owner.auth.mfa.enroll({ factorType: "totp" });
      if (!enrollment.data) throw new Error("TOTP enrollment returned no factor");
      const secret = enrollment.data.totp.secret;
      const enrolled = await owner.auth.mfa.challengeAndVerify({
        factorId: enrollment.data.id,
        code: generateTotp(secret),
      });
      expect(enrolled.error).toBeNull();

      const recovery = await openRecoverySession(email, userId);
      const level = await recovery.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(level.data).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });

      const refused = await recovery.auth.updateUser({
        password: `New-${randomBytes(12).toString("base64url")}7`,
      });
      expect(refused.error).toMatchObject({ status: 401, code: "insufficient_aal" });

      const before = requireSession((await recovery.auth.getSession()).data.session, "Recovery");
      const factors = await recovery.auth.mfa.listFactors();
      const factorId = factors.data?.totp[0]?.id;
      if (!factorId) throw new Error("The recovery session sees no factor");
      // The enrolment above used this window's code; a code is single-use.
      await nextTotpWindow();
      const promoted = await recovery.auth.mfa.challengeAndVerify({
        factorId,
        code: generateTotp(secret),
      });
      expect(promoted.error).toBeNull();

      const after = requireSession((await recovery.auth.getSession()).data.session, "Promoted");
      const beforeClaims = claimsOf(before.access_token);
      const afterClaims = claimsOf(after.access_token);
      expect(afterClaims.aal).toBe("aal2");
      expect(afterClaims.session_id).toBe(beforeClaims.session_id);
      expect(methodsOf(afterClaims)).toEqual(["otp", "totp"]);
      // The recovery sign-out still accepts the promoted session.
      expect(hasFreshRecoveryProof(afterClaims as Record<string, unknown>)).toBe(true);

      const update = await recovery.auth.updateUser({
        password: `New-${randomBytes(12).toString("base64url")}8`,
      });
      expect(update.error).toBeNull();
    } finally {
      await removeDisposableUser(userId);
    }
  }, 90_000);
});
