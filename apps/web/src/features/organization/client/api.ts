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
import { formatClientErrorMessage } from "@/lib/client-facing";

export interface OrganizationBootstrap {
  org: Organization | null;
  isGridmaster: boolean;
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

async function requestOrganizationJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
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
  return requestOrganizationJson<OrganizationBootstrap>("/api/organization/bootstrap", { signal });
}

export function isRetryableOrganizationBootstrapError(error: unknown): boolean {
  if (error instanceof OrganizationRequestError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
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
