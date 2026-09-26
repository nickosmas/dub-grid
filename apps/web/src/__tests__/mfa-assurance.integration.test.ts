/**
 * Local Supabase integration coverage for the sensitive-action assurance
 * contract. The test owns a disposable Auth user and removes it directly from
 * the local database in `finally`, so it never changes a seeded account.
 *
 * Skipped when the local Auth service or database is unavailable.
 */

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import {
  SENSITIVE_ACTION_FRESHNESS_SECONDS,
  evaluateSensitiveActionAssurance,
} from "@dubgrid/authz";
import { describe, expect, it } from "vitest";
import {
  ANON_KEY,
  DB_URL,
  SUPABASE_URL,
  decodeJwtClaims,
  generateTotp,
  matchingTimestamp,
  probeLocalSupabase,
  removeDisposableUser,
  requireSession,
} from "./helpers/local-supabase-auth";

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
