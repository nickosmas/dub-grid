"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({
  children,
  requireSuperAdmin = false,
}: {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}) {
  const { session, isSuperAdmin, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace(requireSuperAdmin ? "/admin/login" : "/");
      return;
    }
    if (requireSuperAdmin && !isSuperAdmin) {
      router.replace("/admin/login");
      return;
    }
    if (!requireSuperAdmin && isSuperAdmin) {
      router.replace("/admin");
      return;
    }
  }, [session, isSuperAdmin, isLoading, requireSuperAdmin, router]);

  // Not yet resolved or not authorized — render nothing while redirect is in flight
  if (isLoading || !session) return null;
  if (requireSuperAdmin && !isSuperAdmin) return null;
  if (!requireSuperAdmin && isSuperAdmin) return null;

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, isSuperAdmin, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (session) {
      router.replace(isSuperAdmin ? "/admin" : "/schedule");
    }
  }, [session, isSuperAdmin, isLoading, router]);

  // Authenticated — render nothing while redirect is in flight
  if (session) return null;

  return <>{children}</>;
}
