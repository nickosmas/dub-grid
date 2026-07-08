import { NextRequest, NextResponse } from "next/server";
import {
  listAdminProfileChangeRequests,
  type ProfileChangeRequestStatus,
} from "@/features/account/server";
import { requireOrgPermissions } from "@/app/api/shared/permissions";

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) =>
      permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageEmployees,
  );
  if ("response" in auth) return auth.response;

  // Validate the status param against the known enum (M-6) rather than blind-casting.
  const VALID_STATUSES: ProfileChangeRequestStatus[] = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
  ];
  const rawStatus = req.nextUrl.searchParams.get("status");
  if (rawStatus !== null && !VALID_STATUSES.includes(rawStatus as ProfileChangeRequestStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const status = (rawStatus as ProfileChangeRequestStatus | null) ?? undefined;
  const requests = await listAdminProfileChangeRequests({
    serviceClient: auth.serviceClient,
    // Effective (sandbox-redirected) org, not the raw query param (M-1).
    orgId: auth.orgId,
    status,
  });

  return NextResponse.json({ requests });
}
