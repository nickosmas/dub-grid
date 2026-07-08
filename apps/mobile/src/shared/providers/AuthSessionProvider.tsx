import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { registerMobileSessionPresence } from "../lib/api";
import { getSupabaseClient } from "../lib/supabase";

type AuthSessionContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
const SESSION_RESTORE_TIMEOUT_MS = 4000;
let activeSessionWriter: ((session: Session | null) => void) | null = null;

export function replaceAuthSession(session: Session | null) {
  activeSessionWriter?.(session);
}

function shouldClearLocalAuthForRestoreError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /invalid refresh token|refresh token not found/i.test(message);
}

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<AuthSessionContextValue>({
    session: null,
    isLoading: true,
  });
  const lastTrackedAccessTokenRef = useRef<string | null>(null);
  const supabase = getSupabaseClient();

  useEffect(() => {
    let isMounted = true;
    let startupReleased = false;
    const writeSession = (session: Session | null) => {
      if (!session?.access_token) {
        lastTrackedAccessTokenRef.current = null;
      } else if (lastTrackedAccessTokenRef.current !== session.access_token) {
        lastTrackedAccessTokenRef.current = session.access_token;
        registerMobileSessionPresence(session.access_token).catch(() => {});
      }

      setValue({
        session,
        isLoading: false,
      });
    };

    activeSessionWriter = writeSession;

    const releaseStartup = (session: Session | null) => {
      startupReleased = true;
      writeSession(session);
    };

    const sessionRestoreTimeout = setTimeout(() => {
      if (!isMounted || startupReleased) {
        return;
      }

      releaseStartup(null);
    }, SESSION_RESTORE_TIMEOUT_MS);

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        clearTimeout(sessionRestoreTimeout);
        if (!isMounted) return;
        writeSession(data.session ?? null);
      })
      .catch(async (error) => {
        clearTimeout(sessionRestoreTimeout);

        if (shouldClearLocalAuthForRestoreError(error)) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // Ignore cleanup failures; the provider still needs to recover locally.
          }
        }

        if (!isMounted) return;
        writeSession(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      writeSession(session ?? null);
    });

    return () => {
      isMounted = false;
      if (activeSessionWriter === writeSession) {
        activeSessionWriter = null;
      }
      clearTimeout(sessionRestoreTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
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
