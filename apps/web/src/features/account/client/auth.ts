"use client";

import type {
  EmailOtpType,
  RealtimeChannel,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import {
  clearSupabaseBrowserAuthState,
  getBrowserSession,
  getVerifiedBrowserUser,
  isRecoverableBrowserAuthError,
} from "@/lib/browser-auth";
import { supabase } from "@/lib/supabase";
import { fetchWithTimeout, settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { mfaEnrollmentResponseSchema, mfaReauthenticationResponseSchema } from "@dubgrid/contracts";
import { broadcastBrowserSignOut } from "@/lib/auth-boundary-broadcast";
import { requestMfaLifecycle, signOutAccountSessions } from "./api";

export type BrowserRealtimeChannel = ReturnType<typeof supabase.channel>;

export async function signOutFromBrowser(
  scope: "local" | "others" | "global",
  reason?: "password_change" | { organizationAccessDenied: string },
): Promise<void> {
  if (scope !== "local") {
    try {
      const session = await settleWithRequestTimeout(getBrowserSession());
      if (!session) throw new Error("Sign in again to manage your devices.");
      await signOutAccountSessions(
        scope,
        session.access_token,
        reason === "password_change" ? reason : undefined,
      );
    } finally {
      // Legacy global callers still exit locally if fresh proof is unavailable,
      // but the rejection remains visible: do not claim every device signed out.
      if (scope === "global") await signOutFromBrowser("local");
    }
    return;
  }
  // API routes verify tokens locally, so clearing them in the browser alone
  // would leave this access token usable until it expires: the server has to
  // record the revocation. The request is sent first, carrying this session's
  // cookies before the auth client clears them, and the Auth logout runs
  // alongside it. The route verifies the token itself rather than asking Auth,
  // so the session ending there first cannot stop the marker being written.
  // Non-fatal: a failure here must never trap the user in a signed-in state.
  const revocation = fetchWithTimeout("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // A refusal the server records only after checking it (F-28).
    body: JSON.stringify(
      typeof reason === "object"
        ? {
            scope: "local",
            reason: "organization_access_denied",
            orgSlug: reason.organizationAccessDenied,
          }
        : { scope: "local" },
    ),
    keepalive: true,
  }).catch(() => {
    // Ignore: proceed with the local sign-out regardless.
  });

  try {
    const { error } = await settleWithRequestTimeout<
      Awaited<ReturnType<typeof supabase.auth.signOut>>
    >(supabase.auth.signOut({ scope: "local" }));
    if (error) throw error;
  } finally {
    clearSupabaseBrowserAuthState();
    broadcastBrowserSignOut();
    await revocation;
  }
}

export async function completeBrowserPasswordRecovery(): Promise<void> {
  let revoked = false;
  try {
    const response = await fetchWithTimeout("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global", reason: "password_recovery" }),
    });
    if (!response.ok) throw new Error("Recovery session revocation failed");
    revoked = true;
  } finally {
    // Once every session is revoked the local sign-out only tidies the auth
    // client, so leaving never waits on it, as mobile's leaveRecovery does. A
    // failed revocation still needs it to end this session on the auth server.
    const localSignOut = supabase.auth.signOut({ scope: "local" });
    try {
      if (revoked) void localSignOut.catch(() => {});
      else await localSignOut;
    } finally {
      clearSupabaseBrowserAuthState();
      broadcastBrowserSignOut();
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

type ServerVouchedSessionListener = (session: Session) => void;
const serverVouchedSessionListeners = new Set<ServerVouchedSessionListener>();

/** Hears each session the login route has just verified, ahead of the auth client. */
export function subscribeToServerVouchedSessions(
  listener: ServerVouchedSessionListener,
): () => void {
  serverVouchedSessionListeners.add(listener);
  return () => {
    serverVouchedSessionListeners.delete(listener);
  };
}

/**
 * Brings the browser's auth client up to date with a session the login route
 * has already written to the auth cookies. Not awaited before navigating: the
 * cookies authenticate the next request. Given the user the route signed in,
 * the session is announced at once, so the app paints without waiting for
 * setSession's own round trip to the auth server. If the auth client refuses
 * the session, the browser signs out rather than keep cookies it will not use,
 * which also clears the announced session.
 */
export function syncBrowserSessionInBackground(
  input: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
  },
  user?: User,
): Promise<void> {
  if (user && input.expires_in) {
    const session: Session = {
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      expires_in: input.expires_in,
      expires_at: Math.floor(Date.now() / 1000) + input.expires_in,
      token_type: "bearer",
      user,
    };
    for (const listener of serverVouchedSessionListeners) listener(session);
  }
  const tokens = { access_token: input.access_token, refresh_token: input.refresh_token };
  return settleWithRequestTimeout(setBrowserSession(tokens)).catch(() =>
    // A sign-out that stalls has still cleared the browser's state.
    signOutFromBrowser("local").catch(() => {}),
  );
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
      message: payload?.error ?? "We couldn't complete that. Try again.",
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

export async function reauthenticateBrowserMfa(password: string, code?: string) {
  const session = mfaReauthenticationResponseSchema.parse(
    await requestMfaLifecycle({ action: "reauthenticate", password, ...(code ? { code } : {}) }),
  );
  await setBrowserSession(session);
  return session;
}

export async function verifyBrowserTotpEnrollment(input: { factorId: string; code: string }) {
  return settleWithRequestTimeout<Awaited<ReturnType<typeof supabase.auth.mfa.challengeAndVerify>>>(
    supabase.auth.mfa.challengeAndVerify(input),
  );
}

export async function getBrowserAssuranceLevel() {
  return settleWithRequestTimeout<
    Awaited<ReturnType<typeof supabase.auth.mfa.getAuthenticatorAssuranceLevel>>
  >(supabase.auth.mfa.getAuthenticatorAssuranceLevel());
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
