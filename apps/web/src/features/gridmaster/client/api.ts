"use client";

import type {
  AuditLogEntry,
  FullAuditLogEntry,
  ImpersonationHistoryEntry,
  Organization,
  AssignableOrganizationRole,
  DraftKind,
  GridmasterAccount,
  GridmasterAuditExportResult,
  GridmasterBillingSummary,
  GridmasterComplianceSummary,
  GridmasterOrgHealthSummary,
  GridmasterOverview,
  GridmasterSecuritySummary,
  GridmasterUserSession,
  PlatformFeatureFlag,
  PlatformUser,
  UserMembership,
} from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

export interface GridmasterInvitationRecord {
  id: string;
  org_id: string;
  email: string;
  role_to_assign: string;
  invited_by?: string | null;
  token?: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  employee_id?: string | null;
}

export interface GridmasterReadOnlyShiftRow {
  empId: string;
  empName: string;
  date: string;
  assignments: string[];
  assignmentDetails: Array<{
    id: number;
    label: string;
    name: string;
    color: string | null;
    border: string | null;
    text: string | null;
    shiftId: number | null;
    jobId: number | null;
    focusAreaName: string | null;
    defaultStartTime: string | null;
    defaultEndTime: string | null;
    isShiftless: boolean;
    isShiftOnly: boolean;
    focusAreaId: number | null;
    coverageStatus: {
      actual: number;
      required: number;
      isMet: boolean;
    } | null;
  }>;
  requestIndicators: Array<{
    id: string;
    type: string;
    status: string;
    relation: "requester" | "target";
  }>;
  absenceLabel: string | null;
  focusAreaName: string | null;
  isDraft: boolean;
  draftKind: DraftKind;
}

export interface TenantStats {
  orgId: string;
  userCount: number;
  employeeCount: number;
}

export interface GridmasterDashboardData {
  organizations: Organization[];
  platformUserCount: number;
  stats: TenantStats[];
}

export interface StartImpersonationResult {
  sessionId: string;
  expiresAt: string;
}

export interface GridmasterOrganizationSetupInput {
  name: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  phone: string;
  timezone: string;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  shiftDisplayMode: "code" | "name";
  superAdminFirstName: string;
  superAdminLastName: string;
  superAdminEmail: string;
  superAdminPhone: string;
}

export type GridmasterSuperAdminSetupResult =
  | { kind: "none" }
  | { kind: "assigned"; displayName: string }
  | {
      kind: "pending-invite";
      displayName: string;
      pendingInvite: { token: string; email: string; name: string };
    }
  | { kind: "invite-error"; displayName: string; message: string };

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestGridmasterJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw Object.assign(
      new Error(formatClientErrorMessage(body?.error, "Gridmaster request failed.")),
      { status: response.status, code: body?.code, method: body?.method },
    );
  }

  return body as T;
}

export function fetchGridmasterUsers(): Promise<{ users: PlatformUser[] }> {
  return requestGridmasterJson("/api/gridmaster/users");
}

export function fetchGridmasterAccounts(): Promise<{ accounts: GridmasterAccount[] }> {
  return requestGridmasterJson("/api/gridmaster/accounts");
}

export function promoteGridmasterAccount(
  email: string,
): Promise<{ success: true; userId: string | null }> {
  return requestGridmasterJson("/api/gridmaster/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "promote", email }),
  });
}

export function demoteGridmasterAccount(input: {
  userId: string;
  orgId: string;
  orgRole: AssignableOrganizationRole;
}): Promise<{ success: true }> {
  return requestGridmasterJson("/api/gridmaster/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "demote", ...input }),
  });
}

export function updateGridmasterAccountActivation(input: {
  userId: string;
  deactivate: boolean;
}): Promise<{ success: true }> {
  return requestGridmasterJson("/api/gridmaster/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setActivation", ...input }),
  });
}

export function updateGridmasterUserActivation(input: {
  userId: string;
  orgId: string;
  deactivate: boolean;
}): Promise<{ success: true }> {
  return requestGridmasterJson("/api/gridmaster/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchGridmasterUserMemberships(
  userId: string,
): Promise<{ memberships: UserMembership[] }> {
  return requestGridmasterJson(`/api/gridmaster/users/${encodeURIComponent(userId)}/memberships`);
}

export function forceLogoutGridmasterUser(
  userId: string,
  accessToken?: string,
): Promise<{ success: true }> {
  return requestGridmasterJson(`/api/gridmaster/users/${encodeURIComponent(userId)}/force-logout`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export function terminateGridmasterUser(
  userId: string,
  reason: string,
  accessToken?: string,
): Promise<{ success: true }> {
  return requestGridmasterJson(`/api/gridmaster/users/${encodeURIComponent(userId)}/terminate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ reason }),
  });
}

export function reinstateGridmasterUser(
  userId: string,
  accessToken?: string,
): Promise<{ success: true }> {
  return requestGridmasterJson(`/api/gridmaster/users/${encodeURIComponent(userId)}/reinstate`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export function fetchGridmasterInvitations(
  orgId: string,
): Promise<{ invitations: GridmasterInvitationRecord[] }> {
  const params = new URLSearchParams({ orgId });
  return requestGridmasterJson(`/api/gridmaster/invitations?${params}`);
}

export function fetchGridmasterReadOnlySchedule(input: {
  orgId: string;
  startDate: string;
  endDate: string;
}): Promise<{ shifts: GridmasterReadOnlyShiftRow[] }> {
  const params = new URLSearchParams(input);
  return requestGridmasterJson(`/api/gridmaster/schedule?${params}`);
}

export function fetchGridmasterDashboardData(): Promise<GridmasterDashboardData> {
  return requestGridmasterJson("/api/gridmaster/dashboard");
}

export function fetchGridmasterOverview(): Promise<GridmasterOverview> {
  return requestGridmasterJson("/api/gridmaster/overview");
}

export function fetchGridmasterOrgHealth(options?: {
  orgId?: string;
}): Promise<{ organizations: GridmasterOrgHealthSummary[] }> {
  const params = new URLSearchParams();
  if (options?.orgId) params.set("orgId", options.orgId);
  const suffix = params.toString();
  return requestGridmasterJson(`/api/gridmaster/org-health${suffix ? `?${suffix}` : ""}`);
}

export function fetchGridmasterSecurity(): Promise<GridmasterSecuritySummary> {
  return requestGridmasterJson("/api/gridmaster/security");
}

export function fetchPlatformFeatureFlags(): Promise<{ flags: PlatformFeatureFlag[] }> {
  return requestGridmasterJson("/api/gridmaster/platform-flags");
}

export function updatePlatformFeatureFlag(input: {
  key: string;
  enabled: boolean;
  expectedUpdatedAt: string;
}): Promise<{ flag: PlatformFeatureFlag }> {
  return requestGridmasterJson("/api/gridmaster/platform-flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function createPlatformFeatureFlag(input: {
  key: string;
  description: string;
  enabled?: boolean;
}): Promise<{ flag: PlatformFeatureFlag }> {
  return requestGridmasterJson("/api/gridmaster/platform-flags", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchGridmasterSessions(options?: {
  orgId?: string;
  platform?: "web" | "ios" | "android" | "unknown";
  limit?: number;
  offset?: number;
}): Promise<{
  sessions: GridmasterUserSession[];
  gridmasterSessions: GridmasterUserSession[];
}> {
  const params = new URLSearchParams();
  if (options?.orgId) {
    params.set("orgId", options.orgId);
  }
  if (options?.platform) {
    params.set("platform", options.platform);
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const suffix = params.toString();
  return requestGridmasterJson(`/api/gridmaster/security/sessions${suffix ? `?${suffix}` : ""}`);
}

export function fetchGridmasterBilling(): Promise<GridmasterBillingSummary> {
  return requestGridmasterJson("/api/gridmaster/billing");
}

export function syncGridmasterBilling(orgId: string): Promise<{ success: true }> {
  return requestGridmasterJson("/api/gridmaster/stripe-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}

export function updateGridmasterSubscription(
  input:
    | {
        orgId: string;
        action: "extend_trial";
        trialDays: number;
      }
    | {
        orgId: string;
        action: "cancel";
      }
    | {
        orgId: string;
        action: "cancel_at_period_end";
      }
    | {
        orgId: string;
        action: "sync_seats";
      }
    | {
        orgId: string;
        action: "override_status";
        status: string;
      },
): Promise<{ success: true }> {
  return requestGridmasterJson("/api/gridmaster/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchGridmasterCompliance(): Promise<GridmasterComplianceSummary> {
  return requestGridmasterJson("/api/gridmaster/compliance");
}

export function fetchGridmasterAuditLog(options?: {
  orgId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (options?.orgId) {
    params.set("orgId", options.orgId);
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const suffix = params.toString();
  return requestGridmasterJson<{ entries: AuditLogEntry[] }>(
    `/api/gridmaster/audit-log${suffix ? `?${suffix}` : ""}`,
  ).then((data) => data.entries);
}

export interface AuditDayCountsResult {
  counts: Record<string, number>;
  total: number;
  truncated: boolean;
}

/**
 * How many events each day of a period holds, independent of which page of
 * rows is loaded. Supports only the filters the count endpoint can apply.
 */
export function fetchAuditLogDayCounts(options: {
  orgId?: string;
  startDate: string;
  endDate: string;
  timeZone?: string | null;
  actionPrefixes?: string[];
  resourceType?: string;
}): Promise<AuditDayCountsResult> {
  const params = new URLSearchParams();
  if (options.orgId) params.set("orgId", options.orgId);
  params.set("startDate", options.startDate);
  params.set("endDate", options.endDate);
  if (options.timeZone) params.set("timeZone", options.timeZone);
  if (options.actionPrefixes?.length) {
    params.set("actionPrefixes", options.actionPrefixes.join(","));
  }
  if (options.resourceType) params.set("resourceType", options.resourceType);

  return requestGridmasterJson<AuditDayCountsResult>(
    `/api/gridmaster/audit-log/day-counts?${params.toString()}`,
  );
}

export function fetchGridmasterFullAuditLog(options?: {
  orgId?: string;
  action?: string;
  actionPrefix?: string;
  /**
   * Action prefixes to include, OR'd together. Lets a category that spans
   * several prefixes ("Setup", "Access & roles") filter server-side, so
   * pagination counts stay honest.
   */
  actionPrefixes?: string[];
  resourceType?: string;
  actorId?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
  highRiskOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<FullAuditLogEntry[]> {
  const params = new URLSearchParams();
  if (options?.orgId) {
    params.set("orgId", options.orgId);
  }
  if (options?.action) {
    params.set("action", options.action);
  }
  if (options?.actionPrefix) {
    params.set("actionPrefix", options.actionPrefix);
  }
  if (options?.actionPrefixes?.length) {
    params.set("actionPrefixes", options.actionPrefixes.join(","));
  }
  if (options?.resourceType) {
    params.set("resourceType", options.resourceType);
  }
  if (options?.actorId) {
    params.set("actorId", options.actorId);
  }
  if (options?.target) {
    params.set("target", options.target);
  }
  if (options?.startDate) {
    params.set("startDate", options.startDate);
  }
  if (options?.endDate) {
    params.set("endDate", options.endDate);
  }
  if (options?.highRiskOnly) {
    params.set("highRiskOnly", "true");
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const suffix = params.toString();
  return requestGridmasterJson<{ entries: FullAuditLogEntry[] }>(
    `/api/gridmaster/audit-log/full${suffix ? `?${suffix}` : ""}`,
  ).then((data) => data.entries);
}

export function exportGridmasterAuditLog(options?: {
  orgId?: string;
  action?: string;
  actionPrefix?: string;
  resourceType?: string;
  actorId?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
  highRiskOnly?: boolean;
  limit?: number;
}): Promise<GridmasterAuditExportResult> {
  return requestGridmasterJson("/api/gridmaster/audit-log/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
}

export function fetchGridmasterImpersonationHistory(options?: {
  limit?: number;
  offset?: number;
}): Promise<ImpersonationHistoryEntry[]> {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }
  if (typeof options?.offset === "number") {
    params.set("offset", String(options.offset));
  }
  const suffix = params.toString();
  return requestGridmasterJson<{ entries: ImpersonationHistoryEntry[] }>(
    `/api/gridmaster/impersonation${suffix ? `?${suffix}` : ""}`,
  ).then((data) => data.entries);
}

export function startGridmasterImpersonation(input: {
  targetUserId: string;
  justification: string;
  targetOrgId?: string;
  userAgent?: string;
}): Promise<StartImpersonationResult> {
  return requestGridmasterJson<StartImpersonationResult>("/api/gridmaster/impersonation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", ...input }),
  });
}

export function endGridmasterImpersonation(input: {
  sessionId: string;
  reason?: string;
  targetOrgId?: string | null;
}): Promise<{ success: true }> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/impersonation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "end", ...input }),
  });
}

export function archiveGridmasterOrganization(orgId: string): Promise<void> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "archiveOrganization", orgId }),
  }).then(() => undefined);
}

export function restoreGridmasterOrganization(orgId: string): Promise<void> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restoreOrganization", orgId }),
  }).then(() => undefined);
}

export function suspendGridmasterOrganization(orgId: string, reason: string): Promise<void> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "suspendOrganization", orgId, reason }),
  }).then(() => undefined);
}

export function unsuspendGridmasterOrganization(orgId: string): Promise<void> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "unsuspendOrganization", orgId }),
  }).then(() => undefined);
}

export function assignGridmasterOrgRoleByEmail(
  orgId: string,
  email: string,
  role: AssignableOrganizationRole,
): Promise<void> {
  return requestGridmasterJson<{ success: true }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assignOrgRoleByEmail", orgId, email, role }),
  }).then(() => undefined);
}

export function createGridmasterOrganizationSetup(
  input: GridmasterOrganizationSetupInput,
): Promise<{ org: Organization; superAdmin: GridmasterSuperAdminSetupResult }> {
  return requestGridmasterJson<{
    org: Organization;
    superAdmin: GridmasterSuperAdminSetupResult;
  }>("/api/gridmaster/organizations/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "createOrganizationSetup", input }),
  });
}
