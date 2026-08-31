import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogQuery = {
  orgId?: string;
  action?: string;
  actionPrefix?: string;
  actionPrefixes?: string[];
  resourceType?: string;
  actorId?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
  highRiskOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function fetchFilteredAuditRows(
  serviceClient: SupabaseClient,
  filters: AuditLogQuery,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await serviceClient.rpc("get_filtered_audit_log", {
    p_action: filters.action ?? null,
    p_action_prefix: filters.actionPrefix ?? null,
    p_action_prefixes: filters.actionPrefixes?.length ? filters.actionPrefixes : null,
    p_actor_id: filters.actorId ?? null,
    p_end_date: filters.endDate ?? null,
    p_high_risk_only: filters.highRiskOnly ?? false,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
    p_org_id: filters.orgId ?? null,
    p_resource_type: filters.resourceType ?? null,
    p_start_date: filters.startDate ?? null,
    p_target: filters.target ?? null,
  });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}
