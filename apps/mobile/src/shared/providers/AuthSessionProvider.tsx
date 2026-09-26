import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { authEntryRecorder } from "../../features/auth/lib/auth-entry-measurement";
import { getMobileAuthIdentity, isSameMobileAuthIdentity } from "../lib/access-token";
import { registerMobileSessionPresence } from "../lib/api";
import { reportSessionPresence } from "../lib/session-presence-report";
import { queryClient } from "../lib/query-client";
import { getSupabaseClient } from "../lib/supabase";

type AuthSessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  restoreError: boolean;
  retryRestore: () => Promise<void>;
  /** Drops the stored session so the user can sign in afresh. Always ends signed out. */
  clearSessionAndSignIn: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
// Matches the web AuthProvider's 12s budget. A shorter deadline turns a merely
// slow token refresh (common on cellular cold starts) into a silent logout —
// see AUTH_EDGE_CASES.md item A3, where web raised this for the same reason.
export const SESSION_RESTORE_TIMEOUT_MS = 12_000;
let activeSessionWriter: ((session: Session | null) => void) | null = null;

export function replaceAuthSession(session: Session | null): boolean {
  if (!activeSessionWriter) {
    return false;
  }

  activeSessionWriter(session);
  return true;
}

const LOCAL_SIGN_OUT_TIMEOUT_MS = 5_000;

const STALE_SESSION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "bad_jwt",
  "user_not_found",
]);

/**
 * Whether a restore failure says the stored session is dead rather than that
 * the network is. A dead session can never succeed on retry, so it is cleared
 * and the user signs in again; only a transport or provider outage keeps the
 * retry screen.
 */
export function shouldClearLocalAuthForRestoreError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid refresh token|refresh token not found|invalid jwt|malformed/i.test(message)) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const { code, status, name } = error as { code?: unknown; status?: unknown; name?: unknown };
  if (typeof code === "string" && STALE_SESSION_CODES.has(code)) return true;
  if (name === "AuthRetryableFetchError") return false;
  return (
    typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429
  );
}

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<
    Omit<AuthSessionContextValue, "retryRestore" | "clearSessionAndSignIn">
  >({
    session: null,
    isLoading: true,
    restoreError: false,
  });
  const lastTrackedAccessTokenRef = useRef<string | null>(null);
  const retryRestoreRef = useRef<() => Promise<void>>(async () => undefined);
  const clearSessionRef = useRef<() => Promise<void>>(async () => undefined);
  const supabase = getSupabaseClient();
  const retryRestore = useCallback(() => retryRestoreRef.current(), []);
  const clearSessionAndSignIn = useCallback(() => clearSessionRef.current(), []);

  useEffect(() => {
    let isMounted = true;
    let restoreGeneration = 0;
    let restoreInFlight: Promise<void> | null = null;
    let cancelRestore: (() => void) | null = null;
    let committedIdentity = getMobileAuthIdentity(null);

    // Settles even when storage or the provider never answers, so leaving is
    // always possible.
    const clearStoredSession = () =>
      Promise.race([
        Promise.resolve()
          .then(() => supabase.auth.signOut({ scope: "local" }))
          .catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, LOCAL_SIGN_OUT_TIMEOUT_MS)),
      ]);

    const writeSession = (session: Session | null) => {
      const nextIdentity = getMobileAuthIdentity(session?.access_token ?? null);
      const identityChanged = !isSameMobileAuthIdentity(committedIdentity, nextIdentity);
      const crossesIdentityBoundary =
        identityChanged &&
        committedIdentity.kind === "authenticated" &&
        nextIdentity.kind !== "unreadable";

      if (nextIdentity.kind === "unreadable") {
        // A token that cannot be read will not become readable on retry, so
        // the stored copy goes too, or every launch would replay it.
        void queryClient.cancelQueries();
        queryClient.clear();
        committedIdentity = getMobileAuthIdentity(null);
        lastTrackedAccessTokenRef.current = null;
        void clearStoredSession();
        setValue({ session: null, isLoading: false, restoreError: false });
        return;
      }

      if (crossesIdentityBoundary) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      committedIdentity = nextIdentity;

      if (!session?.access_token) {
        lastTrackedAccessTokenRef.current = null;
      } else if (lastTrackedAccessTokenRef.current !== session.access_token) {
        const token = session.access_token;
        lastTrackedAccessTokenRef.current = token;
        const isCurrent = () => lastTrackedAccessTokenRef.current === token;
        void reportSessionPresence(token, { send: registerMobileSessionPresence, isCurrent }).then(
          (reported) => {
            // Forget a token that never got reported, so its next appearance
            // reports it again.
            if (!reported && isCurrent()) lastTrackedAccessTokenRef.current = null;
          },
        );
      }

      setValue({
        session,
        isLoading: false,
        restoreError: false,
      });
    };

    const commitAuthoritativeSession = (session: Session | null) => {
      restoreGeneration += 1;
      cancelRestore?.();
      writeSession(session);
    };

    activeSessionWriter = commitAuthoritativeSession;

    let stopSessionRestore = authEntryRecorder.startPhase("session_restore");
    const finishSessionRestore = () => {
      stopSessionRestore();
      stopSessionRestore = () => {};
    };

    const releaseStartup = (session: Session | null) => {
      finishSessionRestore();
      if (!session) {
        authEntryRecorder.cancel("warm_restore");
      }
      writeSession(session);
    };
    const restoreSession = () => {
      if (restoreInFlight) return restoreInFlight;
      const generation = ++restoreGeneration;

      const current = new Promise<void>((resolve) => {
        let settled = false;
        const settle = (apply: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(sessionRestoreTimeout);
          cancelRestore = null;
          if (isMounted && generation === restoreGeneration) apply();
          resolve();
        };
        const sessionRestoreTimeout = setTimeout(() => {
          settle(() => {
            finishSessionRestore();
            authEntryRecorder.cancel("warm_restore");
            setValue((currentValue) => ({
              ...currentValue,
              isLoading: false,
              restoreError: true,
            }));
          });
        }, SESSION_RESTORE_TIMEOUT_MS);
        cancelRestore = () => {
          if (settled) return;
          settled = true;
          clearTimeout(sessionRestoreTimeout);
          cancelRestore = null;
          resolve();
        };

        void supabase.auth.getSession().then(
          ({ data }) => settle(() => releaseStartup(data.session ?? null)),
          (error) =>
            settle(() => {
              finishSessionRestore();
              authEntryRecorder.cancel("warm_restore");
              if (shouldClearLocalAuthForRestoreError(error)) {
                void clearStoredSession();
                writeSession(null);
                return;
              }
              setValue((currentValue) => ({
                ...currentValue,
                isLoading: false,
                restoreError: true,
              }));
            }),
        );
      }).finally(() => {
        if (restoreInFlight === current) restoreInFlight = null;
      });

      restoreInFlight = current;
      return current;
    };

    retryRestoreRef.current = restoreSession;
    clearSessionRef.current = async () => {
      restoreGeneration += 1;
      cancelRestore?.();
      await clearStoredSession();
      if (isMounted) writeSession(null);
    };
    void restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      commitAuthoritativeSession(session ?? null);
    });

    return () => {
      isMounted = false;
      if (activeSessionWriter === commitAuthoritativeSession) {
        activeSessionWriter = null;
      }
      retryRestoreRef.current = async () => undefined;
      clearSessionRef.current = async () => undefined;
      cancelRestore?.();
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthSessionContext.Provider value={{ ...value, retryRestore, clearSessionAndSignIn }}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useSessionState() {
  const value = useContext(AuthSessionContext);
  if (!value) {
    throw new Error("useSessionState must be used within AuthSessionProvider");
  }

  return {
    ...value,
    accessToken: value.session?.access_token ?? null,
  };
}
