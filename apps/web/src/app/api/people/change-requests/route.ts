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
      permissions.isGridmaster ||
      permissions.isSuperAdmin ||
      permissions.canManageEmployees,
  );
  if ("response" in auth) return auth.response;

  const status =
    (req.nextUrl.searchParams.get("status") as ProfileChangeRequestStatus | null) ??
    undefined;
  const requests = await listAdminProfileChangeRequests({
    serviceClient: auth.serviceClient,
    orgId,
    status,
  });

  return NextResponse.json({ requests });
}
