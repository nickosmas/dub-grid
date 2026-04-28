"use client";

import type { Employee } from "@dubgrid/domain";
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

export interface AccountOrgContext {
  orgId: string | null;
  isGridmaster: boolean;
}

export interface AccountPermissionsResponse {
  permissions: Permissions;
}

export interface AccessibleWorkspace {
  org_id: string;
  org_name: string;
  org_slug: string | null;
  is_active: boolean;
}

export interface InvitationLookup {
  orgName: string | null;
  orgSlug: string | null;
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Account request failed.",
    );
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

export function fetchSelfProfileData(
  orgId: string | null,
): Promise<AccountSelfProfileData> {
  const params = new URLSearchParams();
  if (orgId) {
    params.set("orgId", orgId);
  }
  const suffix = params.toString();
  return requestJson<AccountSelfProfileData>(
    `/api/account/self${suffix ? `?${suffix}` : ""}`,
  );
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
  sessions: AccountSessionRecord[];
}> {
  return requestJson("/api/account/sessions");
}

export function revokeAccountSession(
  refreshTokenHash: string,
): Promise<{ success: true }> {
  return requestJson("/api/account/sessions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshTokenHash }),
  });
}

export function fetchAccessibleWorkspaces(): Promise<{
  organizations: AccessibleWorkspace[];
}> {
  return requestJson("/api/auth/workspaces");
}

export function switchBrowserWorkspace(
  targetOrgId: string,
): Promise<{ success: true }> {
  return requestJson("/api/auth/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetOrgId }),
  });
}

export function fetchInvitationLookup(
  token: string,
): Promise<InvitationLookup> {
  const params = new URLSearchParams({ token });
  return requestJson(`/api/invitations/lookup?${params}`);
}
