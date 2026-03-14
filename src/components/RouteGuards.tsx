"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect } from "react";

/**
 * Wraps public (unauthenticated) routes such as /login.
 * Renders children as-is; does NOT redirect authenticated users because
 * the login flow needs the form visible while verifying JWT claims post-sign-in.
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Wraps protected routes (e.g. /schedule).
 * Shows nothing while auth is loading, redirects to /login if unauthenticated,
 * and only renders children once a valid session is confirmed client-side.
 * This prevents flash-of-content when stale session cookies bypass the middleware.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.replace("/login");
    }
  }, [isLoading, user]);

  if (isLoading || !user) return null;

  return <>{children}</>;
}
