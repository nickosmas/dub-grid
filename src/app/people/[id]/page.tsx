"use client";

import { use, useEffect, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/RouteGuards";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";
import { usePermissions } from "@/hooks";
import { fetchEmployeeByUserId } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PersonDetailRouteContent({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { orgId, isLoading: permsLoading } = usePermissions();
  const [selfCheckResolved, setSelfCheckResolved] = useState(false);
  const [isSelfRoute, setIsSelfRoute] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (authLoading || permsLoading) return () => { cancelled = true; };

    if (!user || !orgId) {
      setIsSelfRoute(false);
      setSelfCheckResolved(true);
      return () => { cancelled = true; };
    }

    setIsSelfRoute(false);
    setSelfCheckResolved(false);

    void (async () => {
      try {
        const selfEmployee = await fetchEmployeeByUserId(user.id, orgId);
        if (cancelled) return;
        if (selfEmployee?.id === employeeId) {
          setIsSelfRoute(true);
          router.replace("/profile");
          return;
        }
      } catch {
        // Fall through to the existing person-detail handling if the self lookup fails.
      } finally {
        if (!cancelled) {
          setSelfCheckResolved(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, employeeId, orgId, permsLoading, router, user]);

  if (!selfCheckResolved || isSelfRoute) return null;

  return <StaffDetailPage employeeId={employeeId} />;
}

export default function PersonDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (!UUID_RE.test(id)) notFound();

  return (
    <ProtectedRoute>
      <PersonDetailRouteContent employeeId={id} />
    </ProtectedRoute>
  );
}
