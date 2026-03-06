"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { checkIsSuperAdmin } from "@/lib/db";

// Per-user super-admin cache so returning users are unblocked instantly.
// The DB is still verified in the background after every load.
const SUPER_ADMIN_CACHE_KEY = "sg_super_admin_cache";

function readSuperAdminCache(userId: string): boolean | null {
  try {
    const raw = localStorage.getItem(SUPER_ADMIN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.uid === userId ? (parsed.value as boolean) : null;
  } catch {
    return null;
  }
}

function writeSuperAdminCache(userId: string, value: boolean): void {
  try {
    localStorage.setItem(
      SUPER_ADMIN_CACHE_KEY,
      JSON.stringify({ uid: userId, value }),
    );
  } catch {}
}

function clearSuperAdminCache(): void {
  try {
    localStorage.removeItem(SUPER_ADMIN_CACHE_KEY);
  } catch {}
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isSuperAdmin: false,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // Use onAuthStateChange as the single source of truth.
    // Supabase guarantees INITIAL_SESSION fires first with the correct
    // resolved session (including any token refresh), so we don't need
    // a separate getSession() call that races against it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;

      // Re-enter loading state while we resolve isSuperAdmin for a fresh login
      if (event === "SIGNED_IN") {
        setIsLoading(true);
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        // If we have a cached value for this user, unblock the UI immediately
        // and verify against the DB in the background.
        const cached = readSuperAdminCache(session.user.id);
        if (cached !== null && mounted) {
          setIsSuperAdmin(cached);
          setIsLoading(false);
        }

        try {
          const timeoutPromise = new Promise<boolean>((_, reject) =>
            setTimeout(
              () => reject(new Error("checkIsSuperAdmin timed out")),
              8000,
            ),
          );
          const superStatus = await Promise.race([
            checkIsSuperAdmin(session.user.id),
            timeoutPromise,
          ]);
          if (mounted) {
            setIsSuperAdmin(superStatus);
            writeSuperAdminCache(session.user.id, superStatus);
            if (cached === null) setIsLoading(false); // first-ever load, no cache
          }
        } catch {
          if (mounted && cached === null) {
            // No cache to fall back on — default to false and unblock
            setIsSuperAdmin(false);
            setIsLoading(false);
          }
          // If cache existed, keep it — UI is already unblocked with cached value
        }
      } else if (!session) {
        setIsSuperAdmin(false);
        clearSuperAdminCache();
      }

      // SIGNED_OUT: clear loading in case it was true when the session was revoked
      if (event === "SIGNED_OUT") {
        if (mounted) setIsLoading(false);
      }

      // Keep Server Components and Middleware in sync with the browser session.
      // TOKEN_REFRESHED: the middleware may have already refreshed on the server;
      // router.refresh() re-fetches server data with the new cookie so there's no
      // mismatch. SIGNED_OUT: force a refresh so protected routes redirect correctly.
      if (event === "TOKEN_REFRESHED") {
        router.refresh();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const signOut = () => {
    // Clear local state immediately so the UI redirects without waiting for
    // the network round-trip to Supabase.
    setSession(null);
    setUser(null);
    setIsSuperAdmin(false);
    clearSuperAdminCache();
    // Sign out only this browser session; other sessions (different browsers/devices) remain valid.
    supabase.auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider
      value={{ user, session, isSuperAdmin, isLoading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
