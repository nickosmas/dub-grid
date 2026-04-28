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

export interface DependencyInfo {
  hasDependencies: boolean;
  summary: string;
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

async function requestSettingsJson<T>(
  input: string,
  options: RequestOptions,
): Promise<T> {
  const response = await fetch(resolveClientUrl(input), options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : options.errorMessage,
    );
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
    { errorMessage: "Failed to fetch certifications." },
  );
  return body.items;
}

export async function saveCertifications(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const body = await postSettingsAction<{ items: NamedItem[] }>(
    { action: "saveCertifications", orgId, items, existing },
    "Failed to save certifications.",
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
    { errorMessage: "Failed to check certification dependencies." },
  );
}

export function restoreCertification(
  certId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreCertification", orgId, itemId: certId },
    "Failed to restore certification.",
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
    { errorMessage: "Failed to fetch roles." },
  );
  return body.items;
}

export async function saveOrganizationRoles(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const body = await postSettingsAction<{ items: NamedItem[] }>(
    { action: "saveOrganizationRoles", orgId, items, existing },
    "Failed to save roles.",
  );
  return body.items;
}

export function checkRoleDependencies(
  roleId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkRoleDependencies", {
      orgId,
      itemId: String(roleId),
    }),
    { errorMessage: "Failed to check role dependencies." },
  );
}

export function restoreOrganizationRole(
  roleId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreOrganizationRole", orgId, itemId: roleId },
    "Failed to restore role.",
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
    { errorMessage: "Failed to fetch departments." },
  );
  return body.items;
}

export async function saveDepartments(
  orgId: string,
  items: Department[],
  existing: Department[],
): Promise<Department[]> {
  const body = await postSettingsAction<{ items: Department[] }>(
    { action: "saveDepartments", orgId, items, existing },
    "Failed to save departments.",
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
    { errorMessage: "Failed to check department dependencies." },
  );
}

export function restoreDepartment(
  deptId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreDepartment", orgId, itemId: deptId },
    "Failed to restore department.",
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
    { errorMessage: "Failed to fetch focus areas." },
  );
  return body.items;
}

export async function upsertFocusArea(
  focusArea: Omit<FocusArea, "id"> & { id?: number },
): Promise<FocusArea> {
  const body = await postSettingsAction<{ item: FocusArea }>(
    { action: "upsertFocusArea", focusArea },
    "Failed to save focus area.",
  );
  return body.item;
}

export function deleteFocusArea(
  focusAreaId: number,
  orgId: string,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteFocusArea", orgId, itemId: focusAreaId },
    "Failed to delete focus area.",
  );
}

export function restoreFocusArea(
  focusAreaId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreFocusArea", orgId, itemId: focusAreaId },
    "Failed to restore focus area.",
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
    { errorMessage: "Failed to fetch shifts." },
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
    { errorMessage: "Failed to check shift dependencies." },
  );
}

export async function upsertShiftCategory(
  shiftCategory: Omit<ShiftCategory, "id"> & { id?: number },
): Promise<ShiftCategory> {
  const body = await postSettingsAction<{ item: ShiftCategory }>(
    { action: "upsertShiftCategory", shiftCategory },
    "Failed to save shift.",
  );
  return body.item;
}

export function deleteShiftCategory(
  categoryId: number,
  orgId: string,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteShiftCategory", orgId, itemId: categoryId },
    "Failed to delete shift.",
  );
}

export function restoreShiftCategory(
  categoryId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreShiftCategory", orgId, itemId: categoryId },
    "Failed to restore shift.",
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
    { errorMessage: "Failed to fetch jobs." },
  );
  return body.items;
}

export function checkJobDependencies(
  jobId: number,
  orgId: string,
): Promise<DependencyInfo> {
  return requestSettingsJson<DependencyInfo>(
    buildQuery("checkJobDependencies", {
      orgId,
      itemId: String(jobId),
    }),
    { errorMessage: "Failed to check job dependencies." },
  );
}

export async function upsertJobDefinition(
  job: Omit<JobDefinition, "id"> & { id?: number },
): Promise<JobDefinition> {
  const body = await postSettingsAction<{ item: JobDefinition }>(
    { action: "upsertJobDefinition", job },
    "Failed to save job.",
  );
  return body.item;
}

export function deleteJobDefinition(
  jobId: number,
  orgId: string,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteJobDefinition", orgId, itemId: jobId },
    "Failed to delete job.",
  );
}

export function restoreJobDefinition(
  jobId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreJobDefinition", orgId, itemId: jobId },
    "Failed to restore job.",
  ).then(() => undefined);
}

export async function fetchCoverageRequirements(
  orgId: string,
): Promise<CoverageRequirement[]> {
  const body = await requestSettingsJson<{ items: CoverageRequirement[] }>(
    buildQuery("fetchCoverageRequirements", { orgId }),
    { errorMessage: "Failed to fetch coverage requirements." },
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
    "Failed to save coverage requirements.",
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
    { errorMessage: "Failed to fetch absence types." },
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
    { errorMessage: "Failed to check absence type dependencies." },
  );
}

export async function upsertAbsenceType(
  absenceType: Omit<AbsenceType, "id"> & { id?: number },
): Promise<AbsenceType> {
  const body = await postSettingsAction<{ item: AbsenceType }>(
    { action: "upsertAbsenceType", absenceType },
    "Failed to save absence type.",
  );
  return body.item;
}

export function deleteAbsenceType(
  absenceTypeId: number,
  orgId: string,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteAbsenceType", orgId, itemId: absenceTypeId },
    "Failed to delete absence type.",
  );
}

export function restoreAbsenceType(
  absenceTypeId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreAbsenceType", orgId, itemId: absenceTypeId },
    "Failed to restore absence type.",
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
    { errorMessage: "Failed to fetch indicator types." },
  );
  return body.items;
}

export async function upsertIndicatorType(
  indicatorType: Omit<IndicatorType, "id"> & { id?: number },
): Promise<IndicatorType> {
  const body = await postSettingsAction<{ item: IndicatorType }>(
    { action: "upsertIndicatorType", indicatorType },
    "Failed to save indicator type.",
  );
  return body.item;
}

export function deleteIndicatorType(
  indicatorTypeId: number,
  orgId: string,
): Promise<{ success: true }> {
  return postSettingsAction<{ success: true }>(
    { action: "deleteIndicatorType", orgId, itemId: indicatorTypeId },
    "Failed to delete indicator type.",
  );
}

export function restoreIndicatorType(
  indicatorTypeId: number,
  orgId: string,
): Promise<void> {
  return postSettingsAction<{ success: true }>(
    { action: "restoreIndicatorType", orgId, itemId: indicatorTypeId },
    "Failed to restore indicator type.",
  ).then(() => undefined);
}
