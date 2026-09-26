import { supabase, cacheThrough, cacheDel, CacheKey, TTL } from "./shared";
import { parseNameMismatchResponse } from "@/lib/account-linking";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { rowToInvitation } from "./mappers";
import type { DbInvitation } from "./types";
import { resendOrganizationInvitationGuarded, revokeOrganizationInvitationGuarded } from "./access";
import type { Invitation } from "@/types";

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

export async function fetchInvitations(orgId: string): Promise<Invitation[]> {
  return cacheThrough(CacheKey.invitations(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select(
        "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: DbInvitation) => rowToInvitation(row));
  });
}

export async function revokeInvitation(invitationId: string, orgId: string): Promise<void> {
  const { data: invitationRow, error } = await supabase
    .from("invitations")
    .select("updated_at")
    .eq("org_id", orgId)
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw error;
  if (!invitationRow?.updated_at) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }
  await revokeOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitationRow.updated_at,
  });
  await cacheDel(CacheKey.invitations(orgId));
}

export async function resendInvitation(
  invitationId: string,
  orgId: string,
): Promise<{ expiresAt: string }> {
  const { data: invitationRow, error } = await supabase
    .from("invitations")
    .select("updated_at")
    .eq("org_id", orgId)
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw error;
  if (!invitationRow?.updated_at) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }
  const resent = await resendOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitationRow.updated_at,
  });
  await cacheDel(CacheKey.invitations(orgId));
  return { expiresAt: resent.expiresAt };
}

export async function linkEmployeeToUser(
  employeeId: string,
  userId: string,
  orgId: string,
): Promise<{ status: string }> {
  return postLinkRequest("/api/employees/link-user", { employeeId, userId, orgId });
}

export async function reconcileEmployeeNameAndLinkUser(
  employeeId: string,
  userId: string,
  orgId: string,
): Promise<{ status: string }> {
  return postLinkRequest("/api/employees/link-user/reconcile", { employeeId, userId, orgId });
}

async function postLinkRequest(
  url: string,
  body: { employeeId: string; userId: string; orgId: string },
): Promise<{ status: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    status?: string;
  } | null;
  const mismatchError = parseNameMismatchResponse(payload);
  if (mismatchError) throw mismatchError;
  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(payload?.error, "We couldn't link employee to user. Try again."),
    );
  }
  return { status: payload?.status ?? "linked" };
}
