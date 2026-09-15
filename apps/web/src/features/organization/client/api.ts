"use client";

import type {
  AbsenceType,
  AssignmentDefinition,
  CoverageRequirement,
  Department,
  DirectoryPerson,
  FocusArea,
  IndicatorType,
  JobDefinition,
  NamedItem,
  Organization,
  ShiftCategory,
} from "@/types";
import type { BillingAccessState } from "@dubgrid/domain";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/fetch-with-timeout";

const ORGANIZATION_BOOTSTRAP_TIMEOUT_MS = 5_000;
const ORGANIZATION_BOOTSTRAP_STALE_TIME_MS = 5 * 60_000;
const ORGANIZATION_ACCESS_STATUS_TIMEOUT_MS = 8_000;

export interface OrganizationBootstrap {
  org: Organization | null;
  isGridmaster: boolean;
  entryGate: {
    onboardingCompleted: boolean;
    /** Org-wide: a super admin has finished their own onboarding, so the
     *  organization is open to members who cannot configure it themselves. */
    adminOnboardingCompleted: boolean;
    /** Only present for a super-admin's own organization. */
    billingLocked: boolean | null;
  };
  /**
   * Active employees in the org, as a count rather than the roster.
   * SetupGuard only needs to know whether the org has any staff, and asking
   * here keeps first paint off the critical path of the full roster fetch.
   */
  activeEmployeeCount: number;
  focusAreas: FocusArea[];
  allAssignmentDefinitions: AssignmentDefinition[];
  allAbsenceTypes: AbsenceType[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  coverageRequirements: CoverageRequirement[];
}

export class OrganizationRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "OrganizationRequestError";
  }
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestOrganizationJson<T>(
  input: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const response = timeoutMs
    ? await fetchWithTimeout(resolveClientUrl(input), init, timeoutMs)
    : await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    throw new OrganizationRequestError(
      formatClientErrorMessage(body?.error, "Organization request failed."),
      response.status,
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1_000
        : null,
    );
  }

  return body as T;
}

/**
 * There is no `includeAssignments` option any more. It only ever gated
 * buildScheduleAssignmentOptions, a pure derivation over focus areas, shifts
 * and jobs the response already carries — it saved no queries, only bytes, and
 * in exchange it split the cache so the same payload was fetched twice per page
 * under two keys. The server now always includes them.
 */
export function fetchOrganizationBootstrap(signal?: AbortSignal): Promise<OrganizationBootstrap> {
  return requestOrganizationJson<OrganizationBootstrap>(
    "/api/organization/bootstrap",
    { signal },
    ORGANIZATION_BOOTSTRAP_TIMEOUT_MS,
  );
}

export function isRetryableOrganizationBootstrapError(error: unknown): boolean {
  if (error instanceof OrganizationRequestError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  if (error instanceof RequestTimeoutError) return true;
  // Browser fetch rejects network/connection failures without a response.
  return error instanceof TypeError;
}

export function getOrganizationBootstrapRetryDelay(error: unknown, failureCount: number): number {
  if (error instanceof OrganizationRequestError && error.retryAfterMs != null) {
    return error.retryAfterMs;
  }
  const cappedDelay = Math.min(1_000 * 2 ** failureCount, 30_000);
  return Math.round(cappedDelay * (0.5 + Math.random() * 0.5));
}

export function getOrganizationBootstrapQueryPolicy() {
  return {
    queryFn: (context: { signal?: AbortSignal } | undefined) =>
      fetchOrganizationBootstrap(context?.signal),
    staleTime: ORGANIZATION_BOOTSTRAP_STALE_TIME_MS,
    retry: (failureCount: number, error: unknown) =>
      failureCount < 3 && isRetryableOrganizationBootstrapError(error),
    retryDelay: (failureCount: number, error: unknown) =>
      getOrganizationBootstrapRetryDelay(error, failureCount),
    retryOnMount: false,
  };
}

export type OrganizationAccessState = BillingAccessState | "archived" | "unavailable" | "unknown";

export interface OrganizationAccessStatus {
  /** True once the proxy's organization gate would no longer hold the caller. */
  available: boolean;
  state: OrganizationAccessState;
}

export function fetchOrganizationAccessStatus(
  signal?: AbortSignal,
): Promise<OrganizationAccessStatus> {
  return requestOrganizationJson<OrganizationAccessStatus>(
    "/api/organization/access-status",
    { signal },
    ORGANIZATION_ACCESS_STATUS_TIMEOUT_MS,
  );
}

export function fetchOrganizationDirectory(
  orgId: string,
  page?: { limit?: number; offset?: number },
): Promise<{ directory: DirectoryPerson[]; hasMore: boolean; nextOffset: number | null }> {
  const params = new URLSearchParams({ orgId });
  if (page?.limit != null) params.set("limit", String(page.limit));
  if (page?.offset != null) params.set("offset", String(page.offset));
  return requestOrganizationJson(`/api/organization/directory?${params}`);
}

export function fetchOrganizationEmployeeCount(orgId: string): Promise<{ employeeCount: number }> {
  const params = new URLSearchParams({ orgId });
  return requestOrganizationJson(`/api/organization/employee-count?${params}`);
}
