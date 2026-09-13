"use client";

import { decodeJwt } from "jose";
import type { Factor } from "@supabase/supabase-js";
import type { SensitiveActionStepUpRequired } from "@dubgrid/authz";
import {
  getBrowserAuthSession,
  listBrowserMfaFactors,
  reauthenticateBrowserMfa,
  verifyBrowserTotpEnrollment,
} from "./auth";

export type StepUpMethod = SensitiveActionStepUpRequired["method"];

export function getStepUpMethod(error: unknown): StepUpMethod | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  return candidate.status === 403 &&
    candidate.code === "STEP_UP_REQUIRED" &&
    (candidate.method === "password" || candidate.method === "totp")
    ? candidate.method
    : null;
}

export async function readStepUpContext() {
  const session = await getBrowserAuthSession();
  if (!session?.access_token || !session.user?.id) throw new Error("Sign in again to continue.");
  const claims = decodeJwt(session.access_token);
  if (claims.org_id != null && typeof claims.org_id !== "string") {
    throw new Error("Refresh your session before trying again.");
  }
  // This snapshot only cancels stale UI work. Server guards still authorize every action.
  return {
    key: JSON.stringify([session.user.id, claims.org_id ?? null]),
    accessToken: session.access_token,
  };
}

export async function confirmBrowserStepUp(method: StepUpMethod, credential: string) {
  if (method === "password") {
    const session = await reauthenticateBrowserMfa(credential);
    return session.access_token;
  }
  const factors = await listBrowserMfaFactors();
  if (factors.error) throw new Error("We couldn't check your authenticator. Try again.");
  const factor = factors.data.totp.find((entry: Factor) => entry.status === "verified");
  if (!factor)
    throw new Error("Your two-factor settings changed. Cancel and try the action again.");
  const verified = await verifyBrowserTotpEnrollment({ factorId: factor.id, code: credential });
  if (verified.error || !verified.data?.access_token) {
    throw new Error("We couldn't confirm that code. Enter a new code and try again.");
  }
  return verified.data.access_token;
}
