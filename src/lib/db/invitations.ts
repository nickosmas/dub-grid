import { supabase, cacheThrough, cacheDel, CacheKey, TTL, logAudit } from "./shared";
import type { Invitation, AssignableOrganizationRole } from "@/types";

// ── Invitations ──────────────────────────────────────────────────────────────

export async function acceptInvitation(
  token: string,
): Promise<{ status: string; orgId: string; role: string; orgSlug: string | null }> {
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (error) throw error;
  return {
    status: data.status,
    orgId: data.org_id,
    role: data.role,
    orgSlug: data.org_slug ?? null,
  };
}

export async function sendInvitation(
  email: string,
  role: AssignableOrganizationRole,
  orgId: string,
  employeeId?: string,
  opts?: { firstName?: string; lastName?: string; phone?: string; departmentIds?: number[]; deptAdminIds?: number[] },
): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("send_invitation", {
    p_email: email,
    p_role: role,
    p_org_id: orgId,
    p_employee_id: employeeId ?? null,
    p_first_name: opts?.firstName ?? null,
    p_last_name: opts?.lastName ?? null,
    p_phone: opts?.phone ?? null,
    p_department_ids: opts?.departmentIds ?? [],
    p_dept_admin_ids: opts?.deptAdminIds ?? [],
  });
  if (error) throw error;
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.invitations(orgId));
  void logAudit("invitation.sent", "invitation", data.invitation_id, { email, role }, orgId);
  return {
    invitationId: data.invitation_id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function fetchInvitations(orgId: string): Promise<Invitation[]> {
  return cacheThrough(CacheKey.invitations(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select("id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      orgId: row.org_id as string,
      invitedBy: (row.invited_by as string) ?? null,
      email: row.email as string,
      roleToAssign: row.role_to_assign as AssignableOrganizationRole,
      expiresAt: row.expires_at as string,
      acceptedAt: (row.accepted_at as string) ?? null,
      revokedAt: (row.revoked_at as string) ?? null,
      createdAt: row.created_at as string,
      employeeId: (row.employee_id as string) ?? null,
      firstName: (row.first_name as string | null) ?? null,
      lastName: (row.last_name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      departmentIds: (row.department_ids as number[]) ?? [],
      deptAdminIds: (row.dept_admin_ids as number[]) ?? [],
    }));
  });
}

export async function revokeInvitation(invitationId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", invitationId);
  if (error) throw error;
  await cacheDel(CacheKey.invitations(orgId));
  void logAudit("invitation.revoked", "invitation", invitationId, {}, orgId);
}

export async function resendInvitation(
  invitationId: string,
  orgId: string,
): Promise<{ token: string; expiresAt: string }> {
  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("invitations")
    .update({ token: newToken, expires_at: expiresAt, revoked_at: null })
    .eq("id", invitationId)
    .eq("org_id", orgId)
    .is("accepted_at", null);
  if (error) throw error;
  await cacheDel(CacheKey.invitations(orgId));
  void logAudit("invitation.resent", "invitation", invitationId, {}, orgId);
  return { token: newToken, expiresAt };
}

export async function linkEmployeeToUser(
  employeeId: string,
  userId: string,
  orgId: string,
): Promise<{ status: string }> {
  const response = await fetch("/api/employees/link-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, userId, orgId }),
  });
  const payload = await response.json().catch(() => null) as { error?: string; status?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to link employee to user");
  }
  return { status: payload?.status ?? "linked" };
}
