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

async function requestOrganizationJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(body?.error, "Organization request failed."),
    );
  }

  return body as T;
}

export function fetchOrganizationBootstrap(options?: {
  includeAssignments?: boolean;
}): Promise<OrganizationBootstrap> {
  const params = new URLSearchParams();
  if (options?.includeAssignments === false) {
    params.set("includeAssignments", "0");
  }

  const suffix = params.toString();
  return requestOrganizationJson<OrganizationBootstrap>(
    `/api/organization/bootstrap${suffix ? `?${suffix}` : ""}`,
  );
}

export function fetchOrganizationDirectory(
  orgId: string,
): Promise<{ directory: DirectoryPerson[] }> {
  const params = new URLSearchParams({ orgId });
  return requestOrganizationJson(`/api/organization/directory?${params}`);
}

export function fetchOrganizationEmployeeCount(
  orgId: string,
): Promise<{ employeeCount: number }> {
  const params = new URLSearchParams({ orgId });
  return requestOrganizationJson(`/api/organization/employee-count?${params}`);
}
