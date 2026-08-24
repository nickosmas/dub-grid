"use client";

import type {
  AbsenceType,
  CoverageRequirement,
  Department,
  FocusArea,
  IndicatorType,
  JobDefinition,
  NamedItem,
  ShiftCategory,
} from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

export interface DependencyInfo {
  hasDependencies: boolean;
  summary: string;
  /**
   * True if anything anywhere references this row — including archived rows,
   * historical schedule cells, recurring shifts, etc. When false the server
   * will hard-delete (DELETE FROM) instead of archiving on the next remove.
   * Optional for backwards compatibility with older server responses.
   */
  hasAnyReferences?: boolean;
}

type RequestOptions = RequestInit & {
  errorMessage: string;
};

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestSettingsJson<T>(input: string, options: RequestOptions): Promise<T> {
  const response = await fetch(resolveClientUrl(input), options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(body?.error, options.errorMessage));
  }

  return body as T;
}

function buildQuery(action: string, params: Record<string, string>): string {
  const search = new URLSearchParams({ action, ...params });
  return `/api/settings/config?${search.toString()}`;
}

async function postSettingsAction<T>(
  body: Record<string, unknown>,
  errorMessage: string,
): Promise<T> {
  return requestSettingsJson<T>("/api/settings/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    errorMessage,
  });
}

export async function fetchCertifications(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  const body = await requestSettingsJson<{ items: NamedItem[] }>(
    buildQuery("fetchCertifications", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch certifications. Try again." },
  );
  return body.items;
}

export async function saveCertifications(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
  hardDeleteIds: number[] = [],
): Promise<NamedItem[]> {
  const body = await postSettingsAction<{ items: NamedItem[] }>(
    { action: "saveCertifications", orgId, items, existing, hardDeleteIds },
    "We couldn't save certifications. Try again.",
  );
  return body.items;
}

export function checkCertificationDependencies(
  certId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkCertificationDependencies", {
      orgId,
      itemId: String(certId),
    }),
    { errorMessage: "We couldn't check certification dependencies. Try again." },
  );
}

export function restoreCertification(certId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreCertification", orgId, itemId: certId },
    "We couldn't restore certification. Try again.",
  ).then(() => undefined);
}

export async function fetchOrganizationRoles(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  const body = await requestSettingsJson<{ items: NamedItem[] }>(
    buildQuery("fetchOrganizationRoles", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch roles. Try again." },
  );
  return body.items;
}

export async function saveOrganizationRoles(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
  hardDeleteIds: number[] = [],
): Promise<NamedItem[]> {
  const body = await postSettingsAction<{ items: NamedItem[] }>(
    { action: "saveOrganizationRoles", orgId, items, existing, hardDeleteIds },
    "We couldn't save roles. Try again.",
  );
  return body.items;
}

export function checkRoleDependencies(roleId: number, orgId: string): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkRoleDependencies", {
      orgId,
      itemId: String(roleId),
    }),
    { errorMessage: "We couldn't check role dependencies. Try again." },
  );
}

export function restoreOrganizationRole(roleId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreOrganizationRole", orgId, itemId: roleId },
    "We couldn't restore role. Try again.",
  ).then(() => undefined);
}

export async function fetchDepartments(
  orgId: string,
  includeArchived = false,
): Promise<Department[]> {
  const body = await requestSettingsJson<{ items: Department[] }>(
    buildQuery("fetchDepartments", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch departments. Try again." },
  );
  return body.items;
}

export async function saveDepartments(
  orgId: string,
  items: Department[],
  existing: Department[],
  hardDeleteIds: number[] = [],
): Promise<Department[]> {
  const body = await postSettingsAction<{ items: Department[] }>(
    { action: "saveDepartments", orgId, items, existing, hardDeleteIds },
    "We couldn't save departments. Try again.",
  );
  return body.items;
}

export function checkDepartmentDependencies(
  deptId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkDepartmentDependencies", {
      orgId,
      itemId: String(deptId),
    }),
    { errorMessage: "We couldn't check department dependencies. Try again." },
  );
}

export function restoreDepartment(deptId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreDepartment", orgId, itemId: deptId },
    "We couldn't restore department. Try again.",
  ).then(() => undefined);
}

export async function fetchFocusAreas(
  orgId: string,
  includeArchived = false,
): Promise<FocusArea[]> {
  const body = await requestSettingsJson<{ items: FocusArea[] }>(
    buildQuery("fetchFocusAreas", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch focus areas. Try again." },
  );
  return body.items;
}

export async function upsertFocusArea(
  focusArea: Omit<FocusArea, "id"> & { id?: number },
): Promise<FocusArea> {
  const body = await postSettingsAction<{ item: FocusArea }>(
    { action: "upsertFocusArea", focusArea },
    "We couldn't save focus area. Try again.",
  );
  return body.item;
}

export function checkFocusAreaDependencies(
  focusAreaId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkFocusAreaDependencies", {
      orgId,
      itemId: String(focusAreaId),
    }),
    { errorMessage: "We couldn't check focus area dependencies. Try again." },
  );
}

export function deleteFocusArea(
  focusAreaId: number,
  orgId: string,
  hard = false,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteFocusArea", orgId, itemId: focusAreaId, hard },
    "We couldn't delete focus area. Try again.",
  );
}

export function restoreFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreFocusArea", orgId, itemId: focusAreaId },
    "We couldn't restore focus area. Try again.",
  ).then(() => undefined);
}

export async function fetchShiftCategories(
  orgId: string,
  includeArchived = false,
): Promise<ShiftCategory[]> {
  const body = await requestSettingsJson<{ items: ShiftCategory[] }>(
    buildQuery("fetchShiftCategories", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch shifts. Try again." },
  );
  return body.items;
}

export function checkShiftCategoryDependencies(
  categoryId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkShiftCategoryDependencies", {
      orgId,
      itemId: String(categoryId),
    }),
    { errorMessage: "We couldn't check shift dependencies. Try again." },
  );
}

export async function upsertShiftCategory(
  shiftCategory: Omit<ShiftCategory, "id"> & { id?: number },
): Promise<ShiftCategory> {
  const body = await postSettingsAction<{ item: ShiftCategory }>(
    { action: "upsertShiftCategory", shiftCategory },
    "We couldn't save shift. Try again.",
  );
  return body.item;
}

export function deleteShiftCategory(
  categoryId: number,
  orgId: string,
  hard = false,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteShiftCategory", orgId, itemId: categoryId, hard },
    "We couldn't delete shift. Try again.",
  );
}

export function restoreShiftCategory(categoryId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreShiftCategory", orgId, itemId: categoryId },
    "We couldn't restore shift. Try again.",
  ).then(() => undefined);
}

export async function fetchJobDefinitions(
  orgId: string,
  includeArchived = false,
): Promise<JobDefinition[]> {
  const body = await requestSettingsJson<{ items: JobDefinition[] }>(
    buildQuery("fetchJobDefinitions", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch jobs. Try again." },
  );
  return body.items;
}

export function checkJobDependencies(jobId: number, orgId: string): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkJobDependencies", {
      orgId,
      itemId: String(jobId),
    }),
    { errorMessage: "We couldn't check job dependencies. Try again." },
  );
}

export async function upsertJobDefinition(
  job: Omit<JobDefinition, "id"> & { id?: number },
): Promise<JobDefinition> {
  const body = await postSettingsAction<{ item: JobDefinition }>(
    { action: "upsertJobDefinition", job },
    "We couldn't save job. Try again.",
  );
  return body.item;
}

export function deleteJobDefinition(
  jobId: number,
  orgId: string,
  hard = false,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteJobDefinition", orgId, itemId: jobId, hard },
    "We couldn't delete job. Try again.",
  );
}

export function restoreJobDefinition(jobId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreJobDefinition", orgId, itemId: jobId },
    "We couldn't restore job. Try again.",
  ).then(() => undefined);
}

export async function fetchCoverageRequirements(orgId: string): Promise<CoverageRequirement[]> {
  const body = await requestSettingsJson<{ items: CoverageRequirement[] }>(
    buildQuery("fetchCoverageRequirements", { orgId }),
    { errorMessage: "We couldn't fetch coverage requirements. Try again." },
  );
  return body.items;
}

export async function saveCoverageRequirements(
  orgId: string,
  focusAreaId: number,
  jobId: number,
  preferredShiftId: number | null,
  requirements: { dayOfWeek: number | null; minStaff: number }[],
): Promise<CoverageRequirement[]> {
  const body = await postSettingsAction<{ items: CoverageRequirement[] }>(
    {
      action: "saveCoverageRequirements",
      orgId,
      focusAreaId,
      jobId,
      preferredShiftId,
      requirements,
    },
    "We couldn't save coverage requirements. Try again.",
  );
  return body.items;
}

export async function fetchAbsenceTypes(
  orgId: string,
  includeArchived = false,
): Promise<AbsenceType[]> {
  const body = await requestSettingsJson<{ items: AbsenceType[] }>(
    buildQuery("fetchAbsenceTypes", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch absence types. Try again." },
  );
  return body.items;
}

export function checkAbsenceTypeDependencies(
  absenceTypeId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkAbsenceTypeDependencies", {
      orgId,
      itemId: String(absenceTypeId),
    }),
    { errorMessage: "We couldn't check absence type dependencies. Try again." },
  );
}

export async function upsertAbsenceType(
  absenceType: Omit<AbsenceType, "id"> & { id?: number },
): Promise<AbsenceType> {
  const body = await postSettingsAction<{ item: AbsenceType }>(
    { action: "upsertAbsenceType", absenceType },
    "We couldn't save absence type. Try again.",
  );
  return body.item;
}

export function deleteAbsenceType(
  absenceTypeId: number,
  orgId: string,
  hard = false,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteAbsenceType", orgId, itemId: absenceTypeId, hard },
    "We couldn't delete absence type. Try again.",
  );
}

export function restoreAbsenceType(absenceTypeId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreAbsenceType", orgId, itemId: absenceTypeId },
    "We couldn't restore absence type. Try again.",
  ).then(() => undefined);
}

export async function fetchIndicatorTypes(
  orgId: string,
  includeArchived = false,
): Promise<IndicatorType[]> {
  const body = await requestSettingsJson<{ items: IndicatorType[] }>(
    buildQuery("fetchIndicatorTypes", {
      orgId,
      includeArchived: includeArchived ? "1" : "0",
    }),
    { errorMessage: "We couldn't fetch indicator types. Try again." },
  );
  return body.items;
}

export async function upsertIndicatorType(
  indicatorType: Omit<IndicatorType, "id"> & { id?: number },
): Promise<IndicatorType> {
  const body = await postSettingsAction<{ item: IndicatorType }>(
    { action: "upsertIndicatorType", indicatorType },
    "We couldn't save indicator type. Try again.",
  );
  return body.item;
}

export function checkIndicatorTypeDependencies(
  indicatorTypeId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkIndicatorTypeDependencies", {
      orgId,
      itemId: String(indicatorTypeId),
    }),
    { errorMessage: "We couldn't check indicator type dependencies. Try again." },
  );
}

export function deleteIndicatorType(
  indicatorTypeId: number,
  orgId: string,
  hard = false,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteIndicatorType", orgId, itemId: indicatorTypeId, hard },
    "We couldn't delete indicator type. Try again.",
  );
}

export function restoreIndicatorType(indicatorTypeId: number, orgId: string): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreIndicatorType", orgId, itemId: indicatorTypeId },
    "We couldn't restore indicator type. Try again.",
  ).then(() => undefined);
}
