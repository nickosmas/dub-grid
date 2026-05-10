import type { NextRequest } from "next/server";
import type { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

type ServiceClient = ReturnType<typeof getServiceClient>;

type GridmasterAuditActor = {
  id: string;
  email?: string | null;
};

export type GridmasterAuditInput = {
  serviceClient: ServiceClient;
  actor: GridmasterAuditActor;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  orgId?: string | null;
  details?: Record<string, unknown>;
  request?: NextRequest;
};

function getRequestIp(request?: NextRequest): string | null {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function writeGridmasterAuditLog({
  serviceClient,
  actor,
  action,
  resourceType,
  resourceId = null,
  orgId = null,
  details = {},
  request,
}: GridmasterAuditInput): Promise<void> {
  const { error } = await serviceClient.from("audit_log").insert({
    org_id: orgId,
    actor_id: actor.id,
    actor_email: actor.email ?? null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details: {
      initiated_by: "gridmaster",
      ...details,
    },
    ip_address: getRequestIp(request),
    user_agent: request?.headers.get("user-agent") ?? null,
  });

  if (error) {
    logger.error(
      { err: error, action, resourceType, resourceId, orgId },
      "Failed to write gridmaster audit log",
    );
    throw error;
  }
}
