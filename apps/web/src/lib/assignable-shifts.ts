import type {
  AssignableShiftOption,
  Employee,
  FocusArea,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
  ShiftDisplayParts,
} from "@/types";
import {
  getJobPlacementShiftPool,
  getJobEligibilityMode,
  getStoredJobDepartmentIds,
  getStoredJobFocusAreaIds,
  normalizePlacementIds,
  resolveJobColorsForShift,
  resolveJobTimesForShift,
  shouldShowJobOnGrid,
} from "@/lib/job-placement";
import { isDefaultShiftSystemJob, isRegularStaffSystemJob } from "@/lib/system-jobs";

type EmployeeEligibilityInput = Pick<Employee, "certificationId" | "focusAreaIds" | "roleIds">;

type BuildAssignableShiftOptionsInput = {
  assignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  focusAreas: FocusArea[];
  orgRoles?: NamedItem[];
  certifications?: NamedItem[];
  employee?: EmployeeEligibilityInput | null;
  shiftDisplayMode?: ShiftDisplayMode;
};

function createStableScheduleOptionId(
  orgId: string,
  shiftId: number | null,
  jobId: number,
  usedIds: Set<number>,
): number {
  const input = `${orgId}:${shiftId ?? "null"}:${jobId}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  let id = -Math.max(1, hash >>> 0);
  while (usedIds.has(id) || id === 0) {
    id -= 1;
  }
  usedIds.add(id);
  return id;
}

function resolvePlacementFocusAreaIds(
  job: Pick<JobDefinition, "focusAreaIds" | "focusAreaId" | "departmentIds">,
  focusAreas: FocusArea[],
  includeArchived: boolean,
): number[] {
  const explicitFocusAreaIds = new Set(getStoredJobFocusAreaIds(job));
  const departmentIds = new Set(getStoredJobDepartmentIds(job));

  if (departmentIds.size === 0) {
    return [...explicitFocusAreaIds].sort((left, right) => left - right);
  }

  const departmentFocusAreas = focusAreas
    .filter((focusArea) => {
      if (!includeArchived && focusArea.archivedAt) return false;
      return focusArea.departmentId != null && departmentIds.has(focusArea.departmentId);
    })
    .map((focusArea) => focusArea.id);

  if (explicitFocusAreaIds.size === 0) {
    return departmentFocusAreas.sort((left, right) => left - right);
  }

  return departmentFocusAreas
    .filter((focusAreaId) => explicitFocusAreaIds.has(focusAreaId))
    .sort((left, right) => left - right);
}

function buildScheduleAssignmentValues(
  shift: ShiftCategory | null,
  job: JobDefinition,
): Omit<AssignmentDefinition, "id" | "orgId" | "sortOrder" | "archivedAt"> {
  const shiftAbbr = getShiftAbbr(shift) ?? "";
  const resolvedColors = resolveJobColorsForShift(job, shift);
  const resolvedTimes = resolveJobTimesForShift(job, shift);
  const label = shift
    ? shouldShowJobOnGrid(job)
      ? `${shiftAbbr}${job.abbr}`
      : shiftAbbr
    : job.abbr;
  const name = shift
    ? shouldShowJobOnGrid(job)
      ? `${shift.name} ${job.name}`
      : shift.name
    : job.name;

  return {
    label: label || job.abbr || "JOB",
    name,
    color: resolvedColors.color,
    border: resolvedColors.border,
    text: resolvedColors.text,
    categoryId: shift?.id ?? null,
    shiftId: shift?.id ?? null,
    jobId: job.id,
    isGeneral: shift == null,
    focusAreaId: shift?.focusAreaId ?? null,
    requiredCertificationIds: job.requiredCertificationIds ?? [],
    defaultStartTime: resolvedTimes.startTime,
    defaultEndTime: resolvedTimes.endTime,
    defaultDurationHours: shift ? null : (job.defaultDurationHours ?? null),
    defaultDurationMinutes: shift ? null : (job.defaultDurationMinutes ?? null),
  };
}

export function buildScheduleAssignmentOptions(input: {
  orgId: string;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  includeArchived?: boolean;
}): AssignmentDefinition[] {
  const includeArchived = input.includeArchived ?? false;
  const focusAreaById = new Map(input.focusAreas.map((focusArea) => [focusArea.id, focusArea]));
  const shiftCategories = input.shiftCategories.filter(
    (shift) => includeArchived || !shift.archivedAt,
  );
  const jobs = input.jobs.filter(
    (job) => !isRegularStaffSystemJob(job) && (includeArchived || !job.archivedAt),
  );
  const options: Array<{
    shiftId: number | null;
    jobId: number;
    sortOrder: number;
    archivedAt: string | null;
    values: Omit<AssignmentDefinition, "id" | "orgId" | "sortOrder" | "archivedAt">;
  }> = [];

  for (const job of jobs) {
    const assignmentMode = job.assignmentMode ?? "with_shift";
    const effectiveFocusAreaIdSet = new Set(
      resolvePlacementFocusAreaIds(job, input.focusAreas, includeArchived),
    );
    const applicableShiftIdSet = new Set(normalizePlacementIds(job.applicableShiftIds));
    const applicableShifts = shiftCategories.filter((shift) => {
      if (applicableShiftIdSet.size > 0 && !applicableShiftIdSet.has(shift.id)) {
        return false;
      }
      if (effectiveFocusAreaIdSet.size > 0) {
        return shift.focusAreaId != null && effectiveFocusAreaIdSet.has(shift.focusAreaId);
      }
      return true;
    });

    if (assignmentMode !== "shiftless") {
      for (const shift of applicableShifts) {
        const focusAreaArchivedAt =
          shift.focusAreaId != null
            ? (focusAreaById.get(shift.focusAreaId)?.archivedAt ?? null)
            : null;
        const archivedAt = job.archivedAt ?? shift.archivedAt ?? focusAreaArchivedAt ?? null;
        if (!includeArchived && archivedAt) continue;

        options.push({
          shiftId: shift.id,
          jobId: job.id,
          sortOrder: shift.sortOrder * 1000 + job.sortOrder,
          archivedAt,
          values: buildScheduleAssignmentValues(shift, job),
        });
      }
    }

    if (assignmentMode !== "with_shift") {
      options.push({
        shiftId: null,
        jobId: job.id,
        sortOrder: 1_000_000 + job.sortOrder,
        archivedAt: job.archivedAt ?? null,
        values: buildScheduleAssignmentValues(null, job),
      });
    }
  }

  const usedIds = new Set<number>();

  return options
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      const leftLabel = left.values.label.toUpperCase();
      const rightLabel = right.values.label.toUpperCase();
      if (leftLabel !== rightLabel) {
        return leftLabel.localeCompare(rightLabel);
      }
      if ((left.shiftId ?? -1) !== (right.shiftId ?? -1)) {
        return (left.shiftId ?? -1) - (right.shiftId ?? -1);
      }
      return left.jobId - right.jobId;
    })
    .map((row) => ({
      id: createStableScheduleOptionId(input.orgId, row.shiftId, row.jobId, usedIds),
      orgId: input.orgId,
      sortOrder: row.sortOrder,
      archivedAt: row.archivedAt,
      ...row.values,
    }));
}

function getScheduleEligibleRoleIds(
  job: Pick<JobDefinition, "eligibleRoleIds"> | null,
  orgRoles?: NamedItem[],
): number[] {
  if (!job?.eligibleRoleIds?.length) {
    return [];
  }

  if (!orgRoles || orgRoles.length === 0) {
    return job.eligibleRoleIds;
  }

  const scheduleRoleIds = new Set(
    orgRoles.filter((role) => role.isScheduleRole !== false).map((role) => role.id),
  );

  return job.eligibleRoleIds.filter((roleId) => scheduleRoleIds.has(roleId));
}

function toDisplayTime(value: string | null | undefined): string | null {
  return value ?? null;
}

function getLowestSortOrderForIds(
  ids: number[],
  sortOrderById: Map<number, number>,
): number | null {
  let best: number | null = null;
  for (const id of ids) {
    const sortOrder = sortOrderById.get(id);
    if (sortOrder == null) continue;
    if (best == null || sortOrder < best) {
      best = sortOrder;
    }
  }
  return best;
}

const QUALIFICATION_RANK_COMPONENT_FACTOR = 100_000;
const MISSING_QUALIFICATION_COMPONENT_RANK = 99_999;

export function getQualificationSeniorityRank(input: {
  job: Pick<JobDefinition, "eligibleRoleIds" | "requiredCertificationIds"> | null;
  fallbackRequiredCertificationIds?: number[];
  orgRoles?: NamedItem[];
  certifications?: NamedItem[];
}): number | null {
  const eligibleRoleIds = getScheduleEligibleRoleIds(input.job, input.orgRoles);
  const roleSortOrderById = new Map(
    (input.orgRoles ?? [])
      .filter((role) => role.isScheduleRole !== false && !role.archivedAt)
      .map((role) => [role.id, role.sortOrder]),
  );
  const certificationSortOrderById = new Map(
    (input.certifications ?? [])
      .filter((certification) => !certification.archivedAt)
      .map((certification) => [certification.id, certification.sortOrder]),
  );
  const requiredCertificationIds = input.job?.requiredCertificationIds?.length
    ? input.job.requiredCertificationIds
    : (input.fallbackRequiredCertificationIds ?? []);

  const roleRank = getLowestSortOrderForIds(eligibleRoleIds, roleSortOrderById);
  const certificationRank = getLowestSortOrderForIds(
    requiredCertificationIds,
    certificationSortOrderById,
  );

  if (roleRank == null && certificationRank == null) return null;

  return (
    (roleRank ?? MISSING_QUALIFICATION_COMPONENT_RANK) * QUALIFICATION_RANK_COMPONENT_FACTOR +
    (certificationRank ?? MISSING_QUALIFICATION_COMPONENT_RANK)
  );
}

function formatRequirementList(requirements: string[]): string {
  if (requirements.length === 0) {
    return "qualification requirements";
  }
  if (requirements.length === 1) {
    return requirements[0]!;
  }
  if (requirements.length === 2) {
    return `${requirements[0]} and ${requirements[1]}`;
  }
  const lastRequirement = requirements[requirements.length - 1]!;
  return `${requirements.slice(0, -1).join(", ")}, and ${lastRequirement}`;
}

function getRequirementNames(
  ids: number[],
  nameMap: Map<number, string> | undefined,
): string[] | null {
  const names = ids.map((id) => nameMap?.get(id)?.trim() ?? "").filter((name) => name.length > 0);

  if (names.length !== ids.length || names.length === 0) {
    return null;
  }

  return names;
}

export function formatShiftAssignmentDisqualificationMessage(input: {
  employeeName: string;
  assignmentLabel: string;
  reasons: string[];
}): string {
  const base = `${input.employeeName} can't take ${input.assignmentLabel}`;
  if (input.reasons.length === 0) {
    return `${base}.`;
  }
  return `${base} because this assignment requires ${formatRequirementList(input.reasons)}.`;
}

export function getShiftAbbr(shift: ShiftCategory | null | undefined): string | null {
  if (!shift) return null;
  if (shift.abbr?.trim()) return shift.abbr.trim();
  const initials = shift.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return initials || null;
}

function getFallbackJobName(assignment: AssignmentDefinition, shift: ShiftCategory | null): string {
  const normalizedCodeName = assignment.name.trim();
  if (!shift) return normalizedCodeName || assignment.label;

  const normalizedShiftName = shift.name.trim().toLowerCase();
  if (!normalizedCodeName) return "Staff";
  if (normalizedCodeName.toLowerCase() === normalizedShiftName) return "Staff";

  const withoutShift = normalizedCodeName
    .replace(/\b(day|evening|night)\b/gi, "")
    .replace(/\bshift\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return withoutShift || normalizedCodeName;
}

function getFallbackJobAbbr(assignment: AssignmentDefinition, shift: ShiftCategory | null): string {
  const shiftAbbr = getShiftAbbr(shift);
  if (shiftAbbr && assignment.label.toUpperCase().startsWith(shiftAbbr.toUpperCase())) {
    const trimmed = assignment.label.slice(shiftAbbr.length).trim();
    if (trimmed.length > 0) {
      return trimmed.toUpperCase();
    }
  }

  const fallbackName = getFallbackJobName(assignment, shift);
  const initials = fallbackName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return initials || assignment.label.toUpperCase();
}

function isAssignmentDefinitionBackedByCurrentJobs(input: {
  assignment: AssignmentDefinition;
  shift: ShiftCategory | null;
  job: JobDefinition | null;
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
}): boolean {
  const { assignment, shift, job, shiftCategories, focusAreas } = input;

  if (assignment.jobId == null) {
    return false;
  }

  if (!job || job.archivedAt) {
    return false;
  }

  if (isRegularStaffSystemJob(job)) {
    return false;
  }

  const assignmentMode = job.assignmentMode ?? (shift == null ? "shiftless" : "with_shift");
  const hasPlacementConstraints =
    job.focusAreaId != null ||
    (job.focusAreaIds?.length ?? 0) > 0 ||
    (job.departmentIds?.length ?? 0) > 0 ||
    (job.applicableShiftIds?.length ?? 0) > 0;

  if (shift == null) {
    return assignmentMode !== "with_shift";
  }
  if (assignmentMode === "shiftless") {
    return false;
  }
  if (!hasPlacementConstraints) {
    return true;
  }

  const allowedShiftIds = new Set(
    getJobPlacementShiftPool(job, shiftCategories, focusAreas).map((candidate) => candidate.id),
  );

  return allowedShiftIds.size > 0 && allowedShiftIds.has(shift.id);
}

function deriveShowJobOnGrid(
  job: JobDefinition | null,
  assignment: AssignmentDefinition,
  shift: ShiftCategory | null,
): boolean {
  if (job) {
    return shouldShowJobOnGrid(job);
  }

  if (!shift) {
    return true;
  }

  const shiftAbbr = getShiftAbbr(shift)?.toUpperCase() ?? null;
  const normalizedName = assignment.name.trim().toLowerCase();
  if (shiftAbbr && assignment.label.toUpperCase() === shiftAbbr) return false;
  if (normalizedName === shift.name.trim().toLowerCase()) return false;
  return true;
}

export function buildShiftDisplayParts(input: {
  shift: ShiftCategory | null;
  job: JobDefinition | null;
  assignment?: AssignmentDefinition | null;
  shiftDisplayMode: ShiftDisplayMode;
}): ShiftDisplayParts {
  const { shift, job, assignment, shiftDisplayMode } = input;
  const resolvedAssignmentDefinition = assignment ?? null;
  const isShiftOnly = shift != null && isDefaultShiftSystemJob(job);
  const showJobOnGrid = isShiftOnly
    ? false
    : deriveShowJobOnGrid(
        job,
        resolvedAssignmentDefinition ?? {
          id: -1,
          orgId: "derived",
          label: "",
          name: "",
          color: "",
          border: "",
          text: "",
          sortOrder: 0,
        },
        shift,
      );
  const shiftAbbr = getShiftAbbr(shift);
  const jobName =
    job?.name ??
    (resolvedAssignmentDefinition
      ? getFallbackJobName(resolvedAssignmentDefinition, shift)
      : "Staff");
  const jobAbbr =
    job?.abbr ??
    (resolvedAssignmentDefinition ? getFallbackJobAbbr(resolvedAssignmentDefinition, shift) : "");
  const isShiftless =
    shift == null &&
    (resolvedAssignmentDefinition
      ? resolvedAssignmentDefinition.isGeneral || resolvedAssignmentDefinition.focusAreaId == null
      : job?.assignmentMode === "shiftless");

  return {
    primaryLabel:
      shiftDisplayMode === "name"
        ? (shift?.name ??
          (isShiftless
            ? job
              ? jobName
              : resolvedAssignmentDefinition?.name || resolvedAssignmentDefinition?.label || ""
            : resolvedAssignmentDefinition?.name || resolvedAssignmentDefinition?.label || jobName))
        : (shiftAbbr ??
          (isShiftless
            ? job
              ? jobAbbr
              : resolvedAssignmentDefinition?.label || ""
            : resolvedAssignmentDefinition?.label || jobAbbr)),
    secondaryLabel:
      shift && showJobOnGrid && !isShiftOnly
        ? shiftDisplayMode === "name"
          ? jobName
          : jobAbbr
        : null,
    showJobOnGrid,
    isShiftless,
    isShiftOnly,
  };
}

export function isEmployeeQualifiedForJob(
  emp: EmployeeEligibilityInput,
  job: Pick<
    JobDefinition,
    "eligibleRoleIds" | "requiredCertificationIds" | "eligibilityMode"
  > | null,
  fallbackRequiredCertificationIds: number[] = [],
  orgRoles?: NamedItem[],
): boolean {
  const requiredCertificationIds = job?.requiredCertificationIds?.length
    ? job.requiredCertificationIds
    : fallbackRequiredCertificationIds;
  const eligibleRoleIds = getScheduleEligibleRoleIds(job, orgRoles);

  const rolesOk =
    eligibleRoleIds.length === 0 || eligibleRoleIds.some((roleId) => emp.roleIds.includes(roleId));
  const certificationsOk =
    requiredCertificationIds.length === 0 ||
    (emp.certificationId != null && requiredCertificationIds.includes(emp.certificationId));
  const hasRoleGate = eligibleRoleIds.length > 0;
  const hasCertificationGate = requiredCertificationIds.length > 0;

  if (hasRoleGate && hasCertificationGate && getJobEligibilityMode(job) === "or") {
    return rolesOk || certificationsOk;
  }

  return rolesOk && certificationsOk;
}

export function getAssignableShiftDisqualificationReasons(
  emp: EmployeeEligibilityInput,
  input: {
    shift: Pick<ShiftCategory, "focusAreaId" | "name"> | null;
    job: Pick<
      JobDefinition,
      "name" | "eligibleRoleIds" | "requiredCertificationIds" | "eligibilityMode"
    > | null;
    fallbackRequiredCertificationIds?: number[];
    focusAreaNames?: Map<number, string>;
    roleNames?: Map<number, string>;
    certificationNames?: Map<number, string>;
    orgRoles?: NamedItem[];
  },
): string[] {
  const reasons: string[] = [];

  if (input.shift?.focusAreaId && !emp.focusAreaIds.includes(input.shift.focusAreaId)) {
    const focusAreaName = input.focusAreaNames?.get(input.shift.focusAreaId)?.trim() ?? "";
    reasons.push(
      focusAreaName.length > 0 ? `the ${focusAreaName} focus area` : "the required focus area",
    );
  }

  const eligibleRoleIds = getScheduleEligibleRoleIds(input.job, input.orgRoles);
  const roleReason = (() => {
    if (!eligibleRoleIds.length) {
      return null;
    }

    const roleNames = getRequirementNames(eligibleRoleIds, input.roleNames);
    return eligibleRoleIds.some((roleId) => emp.roleIds.includes(roleId))
      ? null
      : roleNames
        ? `the ${roleNames.join(" or ")} role`
        : "an eligible role";
  })();

  const requiredCertificationIds = input.job?.requiredCertificationIds?.length
    ? input.job.requiredCertificationIds
    : (input.fallbackRequiredCertificationIds ?? []);
  const certificationReason =
    requiredCertificationIds.length > 0 &&
    (emp.certificationId == null || !requiredCertificationIds.includes(emp.certificationId))
      ? (() => {
          const certificationNames = getRequirementNames(
            requiredCertificationIds,
            input.certificationNames,
          );
          return certificationNames
            ? `${certificationNames.join(" or ")} certification`
            : "a required certification";
        })()
      : null;

  if (roleReason && certificationReason) {
    if (getJobEligibilityMode(input.job) === "or") {
      reasons.push(`${roleReason} or ${certificationReason}`);
    } else {
      reasons.push(roleReason, certificationReason);
    }
  } else if (roleReason) {
    reasons.push(roleReason);
  } else if (certificationReason) {
    reasons.push(certificationReason);
  }

  return reasons;
}

export function isEmployeeQualifiedForAssignableShift(
  emp: EmployeeEligibilityInput,
  input: {
    shift: Pick<ShiftCategory, "focusAreaId" | "name"> | null;
    job: Pick<
      JobDefinition,
      "eligibleRoleIds" | "requiredCertificationIds" | "eligibilityMode"
    > | null;
    fallbackRequiredCertificationIds?: number[];
    orgRoles?: NamedItem[];
  },
): boolean {
  const areaOk = !input.shift?.focusAreaId || emp.focusAreaIds.includes(input.shift.focusAreaId);

  return (
    areaOk &&
    isEmployeeQualifiedForJob(
      emp,
      input.job,
      input.fallbackRequiredCertificationIds ?? [],
      input.orgRoles,
    )
  );
}

export function buildAssignableShiftOptions({
  assignments,
  shiftCategories,
  jobs,
  focusAreas,
  orgRoles = [],
  certifications = [],
  employee,
  shiftDisplayMode = "code",
}: BuildAssignableShiftOptionsInput): AssignableShiftOption[] {
  const resolvedAssignmentDefinitions = assignments ?? [];
  const shiftById = new Map(shiftCategories.map((shift) => [shift.id, shift]));
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const focusAreaNameById = new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));

  const options: AssignableShiftOption[] = [];

  for (const assignment of resolvedAssignmentDefinitions) {
    if (assignment.archivedAt) continue;

    const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
    const shift = shiftId != null ? (shiftById.get(shiftId) ?? null) : null;
    const job = assignment.jobId != null ? (jobById.get(assignment.jobId) ?? null) : null;
    const focusAreaId = shift?.focusAreaId ?? assignment.focusAreaId ?? null;

    if (
      !isAssignmentDefinitionBackedByCurrentJobs({
        assignment,
        shift,
        job,
        shiftCategories,
        focusAreas,
      })
    ) {
      continue;
    }

    if (
      employee &&
      !isEmployeeQualifiedForAssignableShift(employee, {
        shift,
        job,
        fallbackRequiredCertificationIds: assignment.requiredCertificationIds ?? [],
        orgRoles,
      })
    ) {
      continue;
    }

    const shiftAbbr = getShiftAbbr(shift);
    const jobName = job?.name ?? getFallbackJobName(assignment, shift);
    const jobAbbr = job?.abbr ?? getFallbackJobAbbr(assignment, shift);
    const resolvedJobTimes = resolveJobTimesForShift(job, shift);
    const qualificationRank = getQualificationSeniorityRank({
      job,
      fallbackRequiredCertificationIds: assignment.requiredCertificationIds ?? [],
      orgRoles,
      certifications,
    });
    const displayParts = buildShiftDisplayParts({
      shift,
      job,
      assignment,
      shiftDisplayMode,
    });
    const groupLabel =
      shift?.name ??
      (!displayParts.isShiftless && focusAreaId != null
        ? (focusAreaNameById.get(focusAreaId) ?? assignment.name ?? assignment.label)
        : "General");
    const groupSortOrder = shift?.sortOrder ?? assignment.sortOrder;

    options.push({
      id: `shift-code:${assignment.id}`,
      assignmentId: assignment.id,
      shiftId,
      jobId: job?.id ?? 0,
      focusAreaId,
      focusAreaName: focusAreaId != null ? (focusAreaNameById.get(focusAreaId) ?? null) : null,
      shiftName: shift?.name ?? null,
      shiftAbbr,
      jobName,
      jobAbbr,
      showJobOnGrid: displayParts.showJobOnGrid,
      isShiftless: displayParts.isShiftless,
      isShiftOnly: displayParts.isShiftOnly,
      primaryLabel: displayParts.primaryLabel,
      secondaryLabel: displayParts.secondaryLabel,
      groupLabel,
      groupSortOrder,
      sortOrder: assignment.sortOrder,
      qualificationRank,
      color: assignment.color,
      border: assignment.border,
      text: assignment.text,
      startTime: toDisplayTime(assignment.defaultStartTime ?? resolvedJobTimes.startTime),
      endTime: toDisplayTime(assignment.defaultEndTime ?? resolvedJobTimes.endTime),
    });
  }

  return options.sort((left, right) => {
    const leftFocusArea = left.focusAreaName ?? "";
    const rightFocusArea = right.focusAreaName ?? "";
    if (leftFocusArea !== rightFocusArea) {
      return leftFocusArea.localeCompare(rightFocusArea);
    }
    if (left.groupSortOrder !== right.groupSortOrder) {
      return left.groupSortOrder - right.groupSortOrder;
    }
    if (left.groupLabel !== right.groupLabel) {
      return left.groupLabel.localeCompare(right.groupLabel);
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.primaryLabel.localeCompare(right.primaryLabel);
  });
}

export function formatAssignableShiftOptionLabel(
  option: Pick<AssignableShiftOption, "primaryLabel" | "secondaryLabel">,
): string {
  return option.secondaryLabel
    ? `${option.primaryLabel} · ${option.secondaryLabel}`
    : option.primaryLabel;
}

export function buildAssignableShiftDisplayMap(
  input: Omit<BuildAssignableShiftOptionsInput, "employee">,
): Map<number, string> {
  const resolvedAssignmentDefinitions = input.assignments ?? input.assignments ?? [];
  const shiftById = new Map(input.shiftCategories.map((shift) => [shift.id, shift]));
  const jobById = new Map(input.jobs.map((job) => [job.id, job]));

  return new Map(
    resolvedAssignmentDefinitions
      .filter((assignment) => !assignment.archivedAt)
      .map((assignment) => {
        const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
        const shift = shiftId != null ? (shiftById.get(shiftId) ?? null) : null;
        const job = assignment.jobId != null ? (jobById.get(assignment.jobId) ?? null) : null;
        const displayParts = buildShiftDisplayParts({
          shift,
          job,
          assignment,
          shiftDisplayMode: input.shiftDisplayMode ?? "code",
        });

        return [assignment.id, formatAssignableShiftOptionLabel(displayParts)] as const;
      }),
  );
}

export function isEmployeeQualifiedForAssignmentDefinition(
  emp: EmployeeEligibilityInput,
  input: {
    assignment: AssignmentDefinition;
    shiftCategories: ShiftCategory[];
    jobs: JobDefinition[];
    orgRoles?: NamedItem[];
  },
): boolean {
  const shiftId = input.assignment.shiftId ?? input.assignment.categoryId ?? null;
  const shift =
    shiftId != null
      ? (input.shiftCategories.find((candidate) => candidate.id === shiftId) ?? null)
      : null;
  const job =
    input.assignment.jobId != null
      ? (input.jobs.find((candidate) => candidate.id === input.assignment.jobId) ?? null)
      : null;

  return isEmployeeQualifiedForAssignableShift(emp, {
    shift,
    job,
    fallbackRequiredCertificationIds: input.assignment.requiredCertificationIds ?? [],
    orgRoles: input.orgRoles,
  });
}

export function getAssignmentDefinitionDisqualificationReasons(
  emp: EmployeeEligibilityInput,
  input: {
    assignment: AssignmentDefinition;
    shiftCategories: ShiftCategory[];
    jobs: JobDefinition[];
    orgRoles?: NamedItem[];
    focusAreaNames?: Map<number, string>;
    roleNames?: Map<number, string>;
    certificationNames?: Map<number, string>;
  },
): string[] {
  const shiftId = input.assignment.shiftId ?? input.assignment.categoryId ?? null;
  const shift =
    shiftId != null
      ? (input.shiftCategories.find((candidate) => candidate.id === shiftId) ?? null)
      : null;
  const job =
    input.assignment.jobId != null
      ? (input.jobs.find((candidate) => candidate.id === input.assignment.jobId) ?? null)
      : null;

  return getAssignableShiftDisqualificationReasons(emp, {
    shift,
    job,
    fallbackRequiredCertificationIds: input.assignment.requiredCertificationIds ?? [],
    focusAreaNames: input.focusAreaNames,
    orgRoles: input.orgRoles,
    roleNames: input.roleNames,
    certificationNames: input.certificationNames,
  });
}
