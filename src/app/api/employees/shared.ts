import { NextResponse } from "next/server";
import { createNameMismatchResponseBody } from "@/lib/account-linking";
import { getServiceClient } from "@/lib/supabase-service";
import type { NameMismatchDetails } from "@/types";

export type ServiceClient = ReturnType<typeof getServiceClient>;

export async function canManageEmployees(
  serviceClient: ServiceClient,
  actorId: string,
  orgId: string,
): Promise<boolean> {
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", actorId)
      .eq("org_id", orgId)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", actorId)
      .single(),
  ]);

  const isGridmaster = profile?.platform_role === "gridmaster";
  const isSuperAdmin = membership?.org_role === "super_admin";
  const isAdmin = membership?.org_role === "admin";
  const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;
  return isGridmaster || isSuperAdmin || (isAdmin && adminPerms?.canManageEmployees === true);
}

export async function fetchProfileName(
  serviceClient: ServiceClient,
  userId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  return {
    firstName: (profile?.first_name as string | null) ?? null,
    lastName: (profile?.last_name as string | null) ?? null,
  };
}

export function nameMismatchResponse(
  details: NameMismatchDetails,
  error?: string,
): NextResponse {
  return NextResponse.json(
    createNameMismatchResponseBody(details, error),
    { status: 409 },
  );
}
