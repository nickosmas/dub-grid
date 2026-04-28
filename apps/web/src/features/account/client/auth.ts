"use client";

import type { EmailOtpType, RealtimeChannel } from "@supabase/supabase-js";
import {
  clearSupabaseBrowserAuthState,
  getBrowserSession,
  getVerifiedBrowserUser,
  isRecoverableBrowserAuthError,
} from "@/lib/browser-auth";
import { supabase } from "@/lib/supabase";

export type BrowserRealtimeChannel = ReturnType<typeof supabase.channel>;

export async function signOutFromBrowser(
  scope: "local" | "others" | "global",
): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope });
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

export async function signUpBrowserUser(input: {
  email: string;
  password: string;
}) {
  return supabase.auth.signUp(input);
}

export async function signInBrowserWithPassword(input: {
  email: string;
  password: string;
}) {
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
  const [session, user] = await Promise.all([
    getBrowserAuthSession(),
    getVerifiedBrowserAuthUser(),
  ]);

  if (!session?.access_token || !user) {
    return { session: null, user: null };
  }

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

export async function refreshBrowserSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }
}

export async function resetBrowserPasswordForEmail(
  email: string,
  redirectTo: string,
) {
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

export async function verifyBrowserOtp(input: {
  type: EmailOtpType;
  token_hash: string;
}) {
  return supabase.auth.verifyOtp(input);
}

export function getBrowserRealtimeChannels(): BrowserRealtimeChannel[] {
  return typeof supabase.getChannels === "function"
    ? (supabase.getChannels() as BrowserRealtimeChannel[])
    : [];
}

export function createBrowserRealtimeChannel(name: string): BrowserRealtimeChannel {
  return supabase.channel(name);
}

export async function untrackBrowserRealtimeChannel(
  channel: RealtimeChannel,
): Promise<void> {
  await channel.untrack();
}

export async function removeBrowserRealtimeChannel(
  channel: BrowserRealtimeChannel,
): Promise<void> {
  await supabase.removeChannel(channel);
}

export async function startBrowserTotpEnrollment() {
  return supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "DubGrid Authenticator",
  });
}

export async function verifyBrowserTotpEnrollment(input: {
  factorId: string;
  code: string;
}) {
  return supabase.auth.mfa.challengeAndVerify(input);
}

export async function listBrowserMfaFactors() {
  return supabase.auth.mfa.listFactors();
}

export async function disableBrowserMfaFactor(factorId: string) {
  return supabase.auth.mfa.unenroll({ factorId });
}
