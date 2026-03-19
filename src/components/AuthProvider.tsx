"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Toaster } from "sonner";
import { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

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
    // Initial session check
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          // Stale or revoked refresh token (e.g. after DB reset, server restart,
          // or another browser signed out globally). Clear the dead session
          // silently so the user just sees the login page.
          await supabase.auth.signOut({ scope: "local" });
          setUser(null);
          return;
        }
        setUser(session?.user ?? null);
      } catch {
        // Network errors etc. — treat as no session
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
      setUser(session?.user ?? null);
      setIsLoading(false);
      // No redirect on SIGNED_OUT — signOutLocal() handles the apex redirect,
      // and ProtectedRoute handles session-expiry redirects to /login.
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider value={{ user, signOut, isLoading }}>
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
