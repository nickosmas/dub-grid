import { ApiResponseError } from "@dubgrid/api-client";
import type { Factor } from "@supabase/supabase-js";
import { getMobileAuthIdentityKey } from "../../../shared/lib/access-token";
import { reauthenticateMobileMfa, withMfaDeadline } from "../../../shared/lib/mfa-lifecycle";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { replaceAuthSession } from "../../../shared/providers/AuthSessionProvider";

export type MobileStepUpMethod = "password" | "totp";

export function getMobileStepUpMethod(error: unknown): MobileStepUpMethod | null {
  if (!(error instanceof ApiResponseError) || error.status !== 403) return null;
  if (!error.payload || typeof error.payload !== "object") return null;
  const payload = error.payload as Record<string, unknown>;
  return payload.code === "STEP_UP_REQUIRED" &&
    (payload.method === "password" || payload.method === "totp")
    ? payload.method
    : null;
}

export function getMobileStepUpContextKey(accessToken: string): string {
  const identity = getMobileAuthIdentityKey(accessToken);
  if (identity[0] !== "authenticated") {
    throw new Error("Refresh your session before trying again.");
  }
  return JSON.stringify(identity);
}

export async function readMobileStepUpContext() {
  const { data, error } = await withMfaDeadline(getSupabaseClient().auth.getSession());
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sign in again to continue.");
  return {
    key: getMobileStepUpContextKey(accessToken),
    accessToken,
  };
}

export async function confirmMobileStepUp(
  method: MobileStepUpMethod,
  credential: string,
  accessToken: string,
): Promise<string> {
  if (method === "password") {
    const session = await reauthenticateMobileMfa(accessToken, credential);
    return session.access_token;
  }

  const client = getSupabaseClient();
  const { data: factorsData, error: factorsError } = await withMfaDeadline(
    client.auth.mfa.listFactors(),
  );
  if (factorsError) throw factorsError;
  const factor = factorsData.totp.find(
    (entry: Factor) => entry.factor_type === "totp" && entry.status === "verified",
  );
  if (!factor) {
    throw new Error("Your two-factor settings changed. Cancel and try the action again.");
  }

  const { data: verifiedSession, error } = await withMfaDeadline(
    client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: credential }),
  );
  if (error || !verifiedSession?.access_token) {
    throw error ?? new Error("We couldn't confirm that code. Enter a new code and try again.");
  }
  if (!replaceAuthSession(verifiedSession)) {
    throw new Error("We couldn't update your verified session. Try again.");
  }
  return verifiedSession.access_token;
}
