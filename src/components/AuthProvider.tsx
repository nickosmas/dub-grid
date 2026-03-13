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
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (event === "SIGNED_OUT" || !session) {
        const path = window.location.pathname;
        const isPublicRoute =
          path === "/" ||
          path === "/login" ||
          path.startsWith("/login") ||
          path === "/privacy" ||
          path === "/terms";
        if (!isPublicRoute) {
          window.location.replace("/");
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, signOut, isLoading }}>
      <Toaster
        position="top-center"
        richColors
        duration={6000}
        toastOptions={{
          style: {
            padding: "14px 20px",
            fontSize: "14px",
            fontWeight: 600,
            borderRadius: "10px",
            minWidth: "320px",
          },
        }}
      />
      {children}
    </AuthContext.Provider>
  );
}
