"use client";

import type { EmailOtpType, RealtimeChannel, Session, SupabaseClient } from "@supabase/supabase-js";
import {
  clearSupabaseBrowserAuthState,
  getBrowserSession,
  getVerifiedBrowserUser,
  isRecoverableBrowserAuthError,
} from "@/lib/browser-auth";
import { supabase } from "@/lib/supabase";
import { fetchWithTimeout, settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { mfaEnrollmentResponseSchema, mfaReauthenticationResponseSchema } from "@dubgrid/contracts";
import { requestMfaLifecycle, signOutAccountSessions } from "./api";

export type BrowserRealtimeChannel = ReturnType<typeof supabase.channel>;

export async function signOutFromBrowser(scope: "local" | "others" | "global"): Promise<void> {
  if (scope !== "local") {
    try {
      const session = await settleWithRequestTimeout(getBrowserSession());
      if (!session) throw new Error("Please sign in again before managing devices.");
      await signOutAccountSessions(scope, session.access_token);
    } finally {
      // Legacy global callers still exit locally if fresh proof is unavailable,
      // but the rejection remains visible: do not claim every device signed out.
      if (scope === "global") await signOutFromBrowser("local");
    }
    return;
  }
  // Tell the server first, while the session's tokens are still readable.
  // API routes verify tokens locally, so clearing them in the browser alone
  // would leave this access token usable until it expires — the server has to
  // record the revocation. Non-fatal: a failure here must never trap the user
  // in a signed-in state.
  try {
    await fetchWithTimeout("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "local" }),
      keepalive: true,
    });
  } catch {
    // Ignore — proceed with the local sign-out regardless.
  }

  try {
    const { error } = await settleWithRequestTimeout<
      Awaited<ReturnType<typeof supabase.auth.signOut>>
    >(supabase.auth.signOut({ scope: "local" }));
    if (error) throw error;
  } finally {
    clearSupabaseBrowserAuthState();
  }
}

export async function completeBrowserPasswordRecovery(): Promise<void> {
  try {
    const response = await fetchWithTimeout("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global", reason: "password_recovery" }),
    });
    if (!response.ok) throw new Error("Recovery session revocation failed");
  } finally {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      clearSupabaseBrowserAuthState();
    }
  }
}

export async function updateBrowserUserEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    throw error;
  }
}

export async function updateBrowserUserPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw error;
  }
}

export async function signInBrowserWithPassword(input: { email: string; password: string }) {
  return supabase.auth.signInWithPassword(input);
}

export async function getBrowserAuthSession() {
  return getBrowserSession();
}

export async function getVerifiedBrowserAuthUser() {
  return getVerifiedBrowserUser();
}

export function clearBrowserAuthState(): void {
  clearSupabaseBrowserAuthState();
}

export function isRecoverableBrowserAuthFailure(error: unknown): boolean {
  return isRecoverableBrowserAuthError(error);
}

export async function getVerifiedBrowserAuth() {
  // Sequential, not Promise.all — see lib/browser-auth.ts for why.
  // Two concurrent auth-lock acquisitions per caller is the root cause of
  // "Lock stolen" errors in production.
  const session = await getBrowserAuthSession();
  if (!session?.access_token) return { session: null, user: null };
  const user = await getVerifiedBrowserAuthUser();
  if (!user) return { session: null, user: null };
  return { session, user };
}

export async function setBrowserSession(input: {
  access_token: string;
  refresh_token: string;
}): Promise<void> {
  const { error } = await supabase.auth.setSession(input);
  if (error) {
    throw error;
  }
}

export async function refreshBrowserSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function resetBrowserPasswordForEmail(email: string, redirectTo: string) {
  void redirectTo;
  const response = await fetchWithTimeout("/api/auth/recovery-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (response.ok) return { error: null };
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return {
    error: {
      message: payload?.error ?? "Recovery request failed",
      status: response.status,
    },
  };
}

export async function exchangeBrowserCodeForSession(code: string) {
  return supabase.auth.exchangeCodeForSession(code);
}

export function subscribeToBrowserAuthChanges(
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0],
) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function resendBrowserSignupEmail(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email,
  });
}

export async function verifyBrowserOtp(input: { type: EmailOtpType; token_hash: string }) {
  return supabase.auth.verifyOtp(input);
}

/**
 * Raw browser Supabase client, for realtime primitives (e.g.
 * `@dubgrid/realtime-core`) that need to construct their own channels rather
 * than going through `createBrowserRealtimeChannel`. This file is the one
 * allowed `@/lib/supabase` import site in the UI layer — see
 * architecture-boundaries.test.ts.
 */
export function getBrowserSupabaseClient(): SupabaseClient {
  return supabase;
}

export function getBrowserRealtimeChannels(): BrowserRealtimeChannel[] {
  return typeof supabase.getChannels === "function"
    ? (supabase.getChannels() as BrowserRealtimeChannel[])
    : [];
}

export function createBrowserRealtimeChannel(
  name: string,
  options?: Parameters<typeof supabase.channel>[1],
): BrowserRealtimeChannel {
  return supabase.channel(name, options);
}

export async function untrackBrowserRealtimeChannel(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
}

export async function removeBrowserRealtimeChannel(channel: BrowserRealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

export const BROWSER_TOTP_FRIENDLY_NAME = "DubGrid Authenticator";

export async function startBrowserTotpEnrollment() {
  return {
    data: mfaEnrollmentResponseSchema.parse(await requestMfaLifecycle({ action: "enroll" })),
    error: null,
  };
}

export async function reauthenticateBrowserMfa(password: string) {
  const session = mfaReauthenticationResponseSchema.parse(
    await requestMfaLifecycle({ action: "reauthenticate", password }),
  );
  await setBrowserSession(session);
  return session;
}

export async function verifyBrowserTotpEnrollment(input: { factorId: string; code: string }) {
  return settleWithRequestTimeout<Awaited<ReturnType<typeof supabase.auth.mfa.challengeAndVerify>>>(
    supabase.auth.mfa.challengeAndVerify(input),
  );
}

export async function listBrowserMfaFactors() {
  return settleWithRequestTimeout<Awaited<ReturnType<typeof supabase.auth.mfa.listFactors>>>(
    supabase.auth.mfa.listFactors(),
  );
}

export async function disableBrowserMfaFactor(factorId: string, accessToken: string) {
  await requestMfaLifecycle({ action: "remove", factorId }, accessToken);
  return { error: null };
}

export async function cleanupBrowserMfaFactor(factorId: string) {
  await requestMfaLifecycle({ action: "cleanup", factorId });
}
