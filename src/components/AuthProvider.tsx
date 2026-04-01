"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Toaster } from "sonner";
import { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { setSentryUser } from "@/lib/sentry";

interface AuthContextType {
  user: User | null;
  signOut: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initial session check with timeout — stale cookies from a different
    // Supabase instance (e.g. remote→local switch) can cause getSession()
    // to hang indefinitely on token refresh. The timeout clears the dead
    // session so the app doesn't spin forever.
    const checkSession = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("session_timeout")), 5000),
        );
        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        if (error) {
          await supabase.auth.signOut({ scope: "local" });
          setUser(null);
          return;
        }
        setUser(session?.user ?? null);
      } catch {
        // Timeout or network error — clear any stale cookies
        try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setIsLoading(false);
      setSentryUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null);
      // No redirect on SIGNED_OUT — signOutLocal() handles the apex redirect,
      // and ProtectedRoute handles session-expiry redirects to /login.
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const contextValue = useMemo(
    () => ({ user, signOut, isLoading }),
    [user, signOut, isLoading],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      <Toaster
        position="top-center"
        closeButton
        duration={6000}
        toastOptions={{
          style: {
            fontSize: "15px",
            fontWeight: 600,
            borderRadius: "12px",
            width: "min(calc(100vw - 48px), 720px)",
            maxWidth: "100%",
          },
        }}
      />
      {children}
    </AuthContext.Provider>
  );
}
