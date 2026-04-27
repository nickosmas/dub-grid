import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase";

type AuthSessionContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
let activeSessionWriter: ((session: Session | null) => void) | null = null;

export function replaceAuthSession(session: Session | null) {
  activeSessionWriter?.(session);
}

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<AuthSessionContextValue>({
    session: null,
    isLoading: true,
  });
  const supabase = getSupabaseClient();

  useEffect(() => {
    let isMounted = true;
    const writeSession = (session: Session | null) => {
      setValue({
        session,
        isLoading: false,
      });
    };

    activeSessionWriter = writeSession;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        writeSession(data.session ?? null);
      })
      .catch(async () => {
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // Ignore cleanup failures; the provider still needs to recover locally.
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
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthSessionContext.Provider value={value}>
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
