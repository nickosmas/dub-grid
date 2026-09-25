import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

export type InvitationAuditChange = {
  key: string;
  label: string;
  previousValue: unknown;
  nextValue: unknown;
};

// One writer for every invitation audit row, so the create, edit, replace,
// resend, revoke and refusal events all land in the same shape. A failed write
// is logged and swallowed: losing the record must not fail the action that was
// already authorized.
export async function writeInvitationAuditEntry(input: {
  orgId: string;
  actorId: string;
  actorEmail: string | null;
  action: string;
  resourceId: string;
  changes?: InvitationAuditChange[];
  details?: Record<string, unknown>;
  relatedInvitationId?: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  const changes = input.changes ?? [];
  try {
    await insertRow(input, changes);
  } catch (error) {
    // Never fail an authorized action because its record could not be kept.
    logger.error(
      { error, orgId: input.orgId, resourceId: input.resourceId, action: input.action },
      "Invitation audit log write threw",
    );
  }
}

async function insertRow(
  input: Parameters<typeof writeInvitationAuditEntry>[0],
  changes: InvitationAuditChange[],
): Promise<void> {
  const { error } = await getServiceClient()
    .from("audit_log")
    .insert({
      org_id: input.orgId,
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      action: input.action,
      resource_type: "invitation",
      resource_id: input.resourceId,
      details: {
        ...(changes.length > 0
          ? {
              changedFields: changes.map((change) => change.key),
              changes: changes.map((change) => ({
                field: change.key,
                label: change.label,
                from: change.previousValue,
                to: change.nextValue,
              })),
            }
          : {}),
        ...(input.relatedInvitationId
          ? { replacementInvitationId: input.relatedInvitationId }
          : {}),
        ...(input.details ?? {}),
      },
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
    });

  if (error) {
    logger.error(
      { error, orgId: input.orgId, resourceId: input.resourceId, action: input.action },
      "Invitation audit log write failed",
    );
  }
}
