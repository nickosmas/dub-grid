import type { NextRequest, NextResponse } from "next/server";
import { audienceForViewer, type Audience } from "@dubgrid/domain";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";

type ServiceClient = ReturnType<typeof getServiceClient>;

export type AuditLogReader = { serviceClient: ServiceClient; audience: Audience };

/**
 * Who may read an audit log: a super admin for their own organization, and a
 * gridmaster for any organization or for the platform-wide log. Shared so the
 * rows endpoint and the day-count endpoint can never drift apart on this.
 */
export async function authorizeAuditLogRead(
  req: NextRequest,
  orgId: string | undefined,
): Promise<AuditLogReader | { response: NextResponse }> {
  if (!orgId) {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return { response: auth.response };
    }
    return { serviceClient: getServiceClient(), audience: "platform" };
  }

  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => permissions.isGridmaster || permissions.isSuperAdmin,
  );
  if ("response" in auth) {
    return { response: auth.response };
  }
  return { serviceClient: auth.serviceClient, audience: audienceForViewer(auth.permissions) };
}
