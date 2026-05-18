import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const {
    name,
    code,
    status,
    message,
  } = error as {
    name?: string;
    code?: string;
    status?: number;
    message?: string;
  };

  return (
    name === "AuthSessionMissingError" ||
    code === "session_not_found" ||
    (status === 400 && message?.toLowerCase().includes("auth session missing") === true)
  );
}

function isStaleRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const {
    name,
    message,
    status,
  } = error as {
    name?: string;
    message?: string;
    status?: number;
  };

  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    name === "AuthApiError" &&
    status === 400 &&
    (
      normalizedMessage.includes("invalid refresh token") ||
      normalizedMessage.includes("refresh token not found")
    )
  );
}

function isAuthLockContentionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { message } = error as { message?: string };
  const normalized = message?.toLowerCase() ?? "";
  // Supabase auth client uses the Web Locks API to serialize token
  // refreshes. When two callers race (common right after a forced
  // refreshSession + navigation), the loser is told its lock was stolen.
  // That's a transient, recoverable condition — another concurrent caller
  // is already providing the authoritative answer.
  return (
    normalized.includes("lock") && normalized.includes("stolen")
  );
}

export function isRecoverableBrowserAuthError(error: unknown): boolean {
  return isMissingSessionError(error) || isStaleRefreshTokenError(error);
}

function clearMatchingStorage(storage: Storage): void {
  const keysToDelete: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (key.startsWith("sb-") && (key.includes("-auth-token") || key.includes("-code-verifier"))) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    storage.removeItem(key);
  }
}

export function clearSupabaseBrowserAuthState(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    clearMatchingStorage(window.localStorage);
  } catch {
    // Ignore storage access failures in privacy-restricted browsers.
  }

  try {
    clearMatchingStorage(window.sessionStorage);
  } catch {
    // Ignore storage access failures in privacy-restricted browsers.
  }

  const cookieNames = document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0] ?? "")
    .filter((name) => name.startsWith("sb-") && (name.includes("-auth-token") || name.includes("-code-verifier")));

  const hostname = window.location.hostname;
  const domainParts = hostname.split(".").filter(Boolean);
  const candidateDomains = new Set<string>([""]);
  for (let index = 0; index < domainParts.length; index += 1) {
    const domain = domainParts.slice(index).join(".");
    candidateDomains.add(domain);
    candidateDomains.add(`.${domain}`);
  }

  for (const cookieName of cookieNames) {
    document.cookie = `${cookieName}=; Max-Age=0; path=/`;
    for (const domain of candidateDomains) {
      if (!domain) continue;
      document.cookie = `${cookieName}=; Max-Age=0; path=/; domain=${domain}`;
    }
  }
}

export async function getBrowserSession(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    if (isAuthLockContentionError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retry = await supabase.auth.getSession();
      if (retry.error) {
        if (isRecoverableBrowserAuthError(retry.error)) return null;
        throw retry.error;
      }
      return retry.data.session;
    }
    if (isRecoverableBrowserAuthError(error)) return null;
    throw error;
  }
  return session;
}

export async function getVerifiedBrowserUser(): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (isAuthLockContentionError(error)) {
      // A concurrent caller stole the auth lock; wait a tick and re-read
      // (the winner's getUser() will have populated session state).
      await new Promise((resolve) => setTimeout(resolve, 50));
      const retry = await supabase.auth.getUser();
      if (retry.error) {
        if (isRecoverableBrowserAuthError(retry.error)) return null;
        throw retry.error;
      }
      return retry.data.user;
    }
    if (isRecoverableBrowserAuthError(error)) return null;
    throw error;
  }
  return user;
}

export async function getVerifiedBrowserAuth(): Promise<{
  session: Session | null;
  user: User | null;
}> {
  const [session, user] = await Promise.all([
    getBrowserSession(),
    getVerifiedBrowserUser(),
  ]);

  if (!session?.access_token || !user) {
    return { session: null, user: null };
  }

  return { session, user };
}
