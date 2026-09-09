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

export type BrowserRealtimeChannel = ReturnType<typeof supabase.channel>;

export async function signOutFromBrowser(scope: "local" | "others" | "global"): Promise<void> {
  // Tell the server first, while the session's tokens are still readable.
  // API routes verify tokens locally, so clearing them in the browser alone
  // would leave this access token usable until it expires — the server has to
  // record the revocation. Non-fatal: a failure here must never trap the user
  // in a signed-in state.
  try {
    await fetchWithTimeout("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: scope === "local" ? "local" : "global" }),
      keepalive: true,
    });
  } catch {
    // Ignore — proceed with the local sign-out regardless.
  }

  const { error } = await settleWithRequestTimeout<
    Awaited<ReturnType<typeof supabase.auth.signOut>>
  >(supabase.auth.signOut({ scope }));
  if (error) {
    throw error;
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
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
  return supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: BROWSER_TOTP_FRIENDLY_NAME,
    // Without this, GoTrue names the factor after the site URL host, which
    // makes an otpauth label of `host:email` -- and on a host carrying a port
    // (`127.0.0.1:3000`) that is two colons deep, so an authenticator splitting
    // on the first one files the entry under "127.0.0.1" with an account of
    // "3000:email". The secret still scans, but every enrollment lands under
    // the same opaque name, so a user who has tried before cannot tell the live
    // entry from a dead one and reads their code off the wrong entry.
    issuer: "DubGrid",
  });
}

export async function verifyBrowserTotpEnrollment(input: { factorId: string; code: string }) {
  return supabase.auth.mfa.challengeAndVerify(input);
}

export async function listBrowserMfaFactors() {
  return supabase.auth.mfa.listFactors();
}

export async function disableBrowserMfaFactor(factorId: string) {
  return supabase.auth.mfa.unenroll({ factorId });
}
