"use client";

import type { Employee } from "@dubgrid/domain";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { RecurringShift, ShiftMap, ShiftRequest } from "@/types";
import type { NotificationPreferenceMap } from "@/features/account/shared/preferences";
import type { Permissions } from "@/features/permissions/shared";

export interface TermsAcceptanceStatus {
  acceptedCurrentTerms: boolean;
  acceptedVersion: string | null;
}

export interface SelfProfileRecord {
  first_name: string | null;
  last_name: string | null;
  mfa_enabled: boolean;
}

export interface AccountSelfProfileData {
  profile: SelfProfileRecord | null;
  employee: Employee | null;
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  shiftRequests: ShiftRequest[];
  auditNames: Array<[string, string]>;
}

export interface AccountSessionRecord {
  id: string;
  userId: string;
  orgId: string | null;
  supabaseSessionId: string | null;
  platform: "web" | "ios" | "android" | null;
  appVersion: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
  refreshTokenHash: string;
}

export interface AccountIdentity {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  orgSlug: string | null;
  hasOrganizationMembership: boolean;
}

export interface ProfileRequestedChanges {
  firstName?: string;
  lastName?: string;
  employmentType?: "full_time" | "part_time";
  certificationId?: number | null;
  focusAreaIds?: number[];
  roleIds?: number[];
  departmentIds?: number[];
}

export interface ProfileChangeRequest {
  id: string;
  orgId: string;
  requesterUserId: string | null;
  requesterEmployeeId: string | null;
  requesterEmployeeVersion: number | null;
  requesterName: string;
  requesterEmail: string | null;
  type: "profile_update" | "account_deletion";
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedChanges: ProfileRequestedChanges;
  currentValues: Record<string, unknown>;
  requestNote: string;
  resolverUserId: string | null;
  resolverNote: string;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AccountOrgContext {
  orgId: string | null;
  isGridmaster: boolean;
}

export interface AccountPermissionsResponse {
  permissions: Permissions;
  // Self-employment shape, used by web nav (Header.tsx) to detect
  // "management-only, non-admin" accounts that should only see Schedule +
  // People, never Dashboard. Defaults to false when the caller has no
  // employees row for the effective org (gridmaster, unlinked super_admin).
  isOnSchedule?: boolean;
  isManagementUser?: boolean;
}

export interface AccessibleOrganization {
  org_id: string;
  org_name: string;
  org_slug: string | null;
  is_active: boolean;
}

export interface InvitationLookup {
  orgName: string | null;
  orgSlug: string | null;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(body?.error, "Account request failed."));
  }

  return body as T;
}

export function fetchTermsAcceptanceStatus(): Promise<TermsAcceptanceStatus> {
  return requestJson<TermsAcceptanceStatus>("/api/account/terms");
}

export function recordCurrentTermsAcceptance(): Promise<{ success: true }> {
  return requestJson<{ success: true }>("/api/account/terms", {
    method: "POST",
  });
}

export function clearLogoutCleanup(): Promise<{ success: true }> {
  return requestJson<{ success: true }>("/api/account/logout-cleanup", {
    method: "POST",
  });
}

export function fetchAccountIdentity(): Promise<AccountIdentity> {
  return requestJson<AccountIdentity>("/api/account/identity");
}

export function fetchAccountOrgContext(): Promise<AccountOrgContext> {
  return requestJson<AccountOrgContext>("/api/account/org-context");
}

export function fetchAccountPermissions(): Promise<AccountPermissionsResponse> {
  return requestJson<AccountPermissionsResponse>("/api/account/permissions");
}

export function fetchSelfProfileData(orgId: string | null): Promise<AccountSelfProfileData> {
  const params = new URLSearchParams();
  if (orgId) {
    params.set("orgId", orgId);
  }
  const suffix = params.toString();
  return requestJson<AccountSelfProfileData>(`/api/account/self${suffix ? `?${suffix}` : ""}`);
}

export function updateSelfProfileDetails(input: {
  firstName: string | null;
  lastName: string | null;
  orgId: string | null;
}): Promise<{
  profile: SelfProfileRecord | null;
  employee: Employee | null;
}> {
  return requestJson("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateSelfProfilePhone(input: {
  orgId: string;
  phone: string;
  expectedVersion?: number;
}): Promise<{ employee: Employee }> {
  return requestJson("/api/account/profile/phone", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchOwnProfileChangeRequests(
  orgId: string,
): Promise<{ requests: ProfileChangeRequest[] }> {
  const params = new URLSearchParams({ orgId });
  return requestJson(`/api/account/change-requests?${params}`);
}

export function createOwnProfileChangeRequest(input: {
  orgId: string;
  type: "profile_update" | "account_deletion";
  requestedChanges?: ProfileRequestedChanges;
  requestNote?: string;
}): Promise<{ request: ProfileChangeRequest }> {
  return requestJson("/api/account/change-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function cancelOwnProfileChangeRequest(
  requestId: string,
): Promise<{ success: true; request: ProfileChangeRequest }> {
  return requestJson(`/api/account/change-requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  });
}

export function fetchPeopleProfileChangeRequests(
  orgId: string,
  status = "pending",
): Promise<{ requests: ProfileChangeRequest[] }> {
  const params = new URLSearchParams({ orgId, status });
  return requestJson(`/api/people/change-requests?${params}`);
}

export function resolvePeopleProfileChangeRequest(input: {
  orgId: string;
  requestId: string;
  action: "approve" | "reject";
  resolverNote?: string;
}): Promise<{ success: true; request: ProfileChangeRequest }> {
  const params = new URLSearchParams({ orgId: input.orgId });
  return requestJson(`/api/people/change-requests/${input.requestId}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action,
      resolverNote: input.resolverNote,
    }),
  });
}

export function fetchNotificationPreferences(): Promise<{
  prefs: NotificationPreferenceMap | null;
}> {
  return requestJson("/api/account/notification-preferences");
}

export function saveNotificationPreferences(
  prefs: NotificationPreferenceMap,
): Promise<{ prefs: NotificationPreferenceMap }> {
  return requestJson("/api/account/notification-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefs }),
  });
}

export function updateMfaStatus(enabled: boolean): Promise<{
  profile: SelfProfileRecord | null;
}> {
  return requestJson("/api/account/mfa-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function fetchAccountSessions(): Promise<{
  active: AccountSessionRecord[];
  stale: AccountSessionRecord[];
}> {
  return requestJson("/api/account/sessions");
}

export function revokeAccountSession(refreshTokenHash: string): Promise<{ success: true }> {
  return requestJson("/api/account/sessions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshTokenHash }),
  });
}

export function fetchAccessibleOrganizations(): Promise<{
  organizations: AccessibleOrganization[];
}> {
  return requestJson("/api/auth/organizations");
}

export function switchBrowserOrganization(targetOrgId: string): Promise<{ success: true }> {
  return requestJson("/api/auth/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetOrgId }),
  });
}

// Starts the org's trial on the first super_admin login. Idempotent + self-gated
// to super_admins server-side, so it is safe to call after any genuine login.
export function startBrowserTrial(orgId: string): Promise<{ success: true }> {
  return requestJson("/api/auth/start-trial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}

/**
 * Destroys every sandbox the caller owns and clears the sandbox cookie
 * (the `/api/test-sandbox` "exit" action). Used in two auth paths:
 * - on the next login, to wipe a sandbox left over from a session that ended
 *   without an explicit exit (involuntary logout / browser close);
 * - before a user-initiated sign-out, so the sandbox is gone before logout.
 * Idempotent and self-gated server-side: a no-op when the user owns no sandbox.
 */
export function exitSandbox(): Promise<{ success: true }> {
  return requestJson("/api/test-sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "exit" }),
  });
}

export function fetchInvitationLookup(token: string): Promise<InvitationLookup> {
  const params = new URLSearchParams({ token });
  return requestJson(`/api/invitations/lookup?${params}`);
}
