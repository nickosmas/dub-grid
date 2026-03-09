"use client";

/**
 * Wraps public (unauthenticated) routes such as /login.
 * Renders children as-is; can be extended to redirect already-authenticated users.
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
