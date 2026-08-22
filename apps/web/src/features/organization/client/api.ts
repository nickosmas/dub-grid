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
    throw new Error(formatClientErrorMessage(body?.error, "Organization request failed."));
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
export function fetchOrganizationBootstrap(): Promise<OrganizationBootstrap> {
  return requestOrganizationJson<OrganizationBootstrap>("/api/organization/bootstrap");
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
