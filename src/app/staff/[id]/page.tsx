"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProtectedRoute } from "@/components/RouteGuards";
import { StaffDetailPage } from "@/components/staff-detail/StaffDetailPage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function StaffDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (!UUID_RE.test(id)) notFound();

  return (
    <ProtectedRoute>
      <StaffDetailPage employeeId={id} />
    </ProtectedRoute>
  );
}
