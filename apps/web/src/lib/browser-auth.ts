import type { Session, User } from "@supabase/supabase-js";
import { captureMessage, setTag } from "@/lib/sentry";
import { supabase } from "@/lib/supabase";

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { name, code, status, message } = error as {
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

  const { name, message, status } = error as {
    name?: string;
    message?: string;
    status?: number;
  };

  const normalizedMessage = message?.toLowerCase() ?? "";
  return (
    name === "AuthApiError" &&
    status === 400 &&
    (normalizedMessage.includes("invalid refresh token") ||
      normalizedMessage.includes("refresh token not found"))
  );
}

// Supabase auth serializes token reads/refreshes with the Web Locks API.
// When two callers race for the same lock, the loser sees one of several
// error shapes — all of which mean the same thing: a concurrent caller
// stole the lock with the `steal: true` option, and we should re-read.
// Production strings we've observed (Next.js 16 + Supabase ssr 0.9):
//   - "Lock 'lock:sb-127-auth-token' was released because another request stole it"
//   - "Lock broken by another request with the 'steal' option" (AbortError)
function isAuthLockContentionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  const normalized = message?.toLowerCase() ?? "";
  if (name === "AbortError" && normalized.includes("lock")) return true;
  if (!normalized.includes("lock")) return false;
  return (
    normalized.includes("steal") ||
    normalized.includes("stolen") ||
    normalized.includes("released because another")
  );
}

export function isRecoverableBrowserAuthError(error: unknown): boolean {
  return isMissingSessionError(error) || isStaleRefreshTokenError(error);
}

function reportLockContention(call: "getSession" | "getUser"): void {
  setTag("auth_lock_contention", "true");
  captureMessage(`Supabase auth lock contention on ${call}`, "warning");
}

// In-flight dedupe: collapse concurrent callers onto a single underlying
// SDK call. Without this, AuthProvider + usePermissions + any third hook
// that mounts in the same render pass each race for the auth lock and
// trigger the "Lock stolen" error. With this, they all await one promise.
let inFlightSession: Promise<Session | null> | null = null;
let inFlightUser: Promise<User | null> | null = null;

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
  // Whatever auth state is currently in flight is now invalid — release the
  // dedupe slots so the next caller starts fresh. Without this, an SDK call
  // that's hung on stale cookies (the scenario AuthProvider's 5s race exists
  // to escape) would permanently occupy the in-flight slot and every future
  // caller would await the same hung promise.
  inFlightSession = null;
  inFlightUser = null;

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
    .filter(
      (name) =>
        name.startsWith("sb-") && (name.includes("-auth-token") || name.includes("-code-verifier")),
    );

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

async function readSessionOnce(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    if (isAuthLockContentionError(error)) {
      reportLockContention("getSession");
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

async function readUserOnce(): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (isAuthLockContentionError(error)) {
      reportLockContention("getUser");
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

export function getBrowserSession(): Promise<Session | null> {
  if (inFlightSession) return inFlightSession;
  // Identity-check inside .finally so that if the slot has already been
  // reassigned (e.g. cleared by clearSupabaseBrowserAuthState and replaced
  // by a fresh caller), this stale finalizer doesn't clobber the new value.
  const promise: Promise<Session | null> = readSessionOnce().finally(() => {
    if (inFlightSession === promise) inFlightSession = null;
  });
  inFlightSession = promise;
  return promise;
}

export function getVerifiedBrowserUser(): Promise<User | null> {
  if (inFlightUser) return inFlightUser;
  const promise: Promise<User | null> = readUserOnce().finally(() => {
    if (inFlightUser === promise) inFlightUser = null;
  });
  inFlightUser = promise;
  return promise;
}

// Sequential, not Promise.all. Running getSession + getUser in parallel
// doubles the number of concurrent auth-lock acquirers per call site and
// is the single largest source of "Lock stolen" errors in this codebase.
// getSession() is a cheap cache read; getUser() does the verifying network
// roundtrip. Running them one after the other is fast enough.
export async function getVerifiedBrowserAuth(): Promise<{
  session: Session | null;
  user: User | null;
}> {
  const session = await getBrowserSession();
  if (!session?.access_token) return { session: null, user: null };
  const user = await getVerifiedBrowserUser();
  if (!user) return { session: null, user: null };
  return { session, user };
}
