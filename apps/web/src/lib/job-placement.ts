import type {
  FocusArea,
  JobEligibilityMode,
  JobDefinition,
  JobShiftTimeOverride,
  ShiftCategory,
} from "@/types";
import { borderColor, getPresetByBg, normalizePresetBg } from "@/lib/colors";
import { isRegularStaffSystemJob } from "@/lib/system-jobs";

type JobPlacementScope = Pick<
  JobDefinition,
  "focusAreaIds" | "focusAreaId" | "departmentIds" | "applicableShiftIds"
>;

type ShiftlessJobTiming = Pick<
  JobDefinition,
  | "assignmentMode"
  | "defaultStartTime"
  | "defaultEndTime"
  | "defaultDurationHours"
  | "defaultDurationMinutes"
>;

export function normalizePlacementIds(values: readonly number[] | null | undefined): number[] {
  return [...new Set((values ?? []).filter((value) => Number.isFinite(value)))].sort(
    (left, right) => left - right,
  );
}

export function getJobEligibilityMode(
  job: Pick<JobDefinition, "eligibilityMode"> | null | undefined,
): JobEligibilityMode {
  return job?.eligibilityMode ?? "and";
}

export function normalizeShiftlessJobTiming(job: ShiftlessJobTiming): {
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultDurationHours: number | null;
  defaultDurationMinutes: number | null;
} {
  const defaultStartTime = job.defaultStartTime ?? null;
  const defaultEndTime = job.defaultEndTime ?? null;
  const defaultDurationHours = job.defaultDurationHours ?? null;
  const defaultDurationMinutes = job.defaultDurationMinutes ?? null;

  if (job.assignmentMode !== "shiftless") {
    return {
      defaultStartTime,
      defaultEndTime,
      defaultDurationHours,
      defaultDurationMinutes,
    };
  }

  if (defaultStartTime != null || defaultEndTime != null) {
    return {
      defaultStartTime,
      defaultEndTime,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
    };
  }

  if (defaultDurationHours != null || defaultDurationMinutes != null) {
    return {
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours,
      defaultDurationMinutes,
    };
  }

  return {
    defaultStartTime: null,
    defaultEndTime: null,
    defaultDurationHours: null,
    defaultDurationMinutes: null,
  };
}

export function shouldShowJobOnGrid(
  job: Pick<JobDefinition, "systemKey" | "showOnGrid"> | null | undefined,
): boolean {
  if (!job) {
    return false;
  }

  if (isRegularStaffSystemJob(job)) {
    return false;
  }

  return job.showOnGrid !== false;
}

export function normalizeShiftTimeOverrides(
  overrides: Record<string, JobShiftTimeOverride | undefined> | null | undefined,
): Record<string, JobShiftTimeOverride> {
  const normalized: Record<string, JobShiftTimeOverride> = {};

  for (const [shiftId, value] of Object.entries(overrides ?? {})) {
    if (shiftId.trim().length === 0 || value == null) {
      continue;
    }

    const nextValue = {
      startTime: value.startTime ?? null,
      endTime: value.endTime ?? null,
    };

    if (nextValue.startTime == null && nextValue.endTime == null) {
      continue;
    }

    normalized[shiftId] = nextValue;
  }

  return normalized;
}

export function normalizeShiftColorOverrides(
  overrides: Record<string, string | null | undefined> | null | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [shiftId, value] of Object.entries(overrides ?? {})) {
    if (shiftId.trim().length === 0 || typeof value !== "string" || value.trim().length === 0) {
      continue;
    }

    normalized[shiftId] = normalizePresetBg(value);
  }

  return normalized;
}

export function getJobShiftTimeOverride(
  job: Pick<JobDefinition, "shiftTimeOverrides"> | null,
  shiftId: number | null,
): JobShiftTimeOverride | null {
  if (job == null || shiftId == null) {
    return null;
  }

  const overrides = normalizeShiftTimeOverrides(job.shiftTimeOverrides);
  return overrides[String(shiftId)] ?? null;
}

export function getJobShiftColorOverride(
  job: Pick<JobDefinition, "shiftColorOverrides"> | null,
  shiftId: number | null,
): string | null {
  if (job == null || shiftId == null) {
    return null;
  }

  const overrides = normalizeShiftColorOverrides(job.shiftColorOverrides);
  return overrides[String(shiftId)] ?? null;
}

export function resolveJobTimesForShift(
  job: Pick<
    JobDefinition,
    "assignmentMode" | "defaultStartTime" | "defaultEndTime" | "shiftTimeOverrides"
  > | null,
  shift: Pick<ShiftCategory, "id" | "startTime" | "endTime"> | null,
): JobShiftTimeOverride {
  const shiftOverride = getJobShiftTimeOverride(job, shift?.id ?? null);
  const shouldUseDirectTimes = shift == null || job?.assignmentMode === "shiftless";

  return {
    startTime:
      shiftOverride?.startTime ??
      (shouldUseDirectTimes ? (job?.defaultStartTime ?? null) : null) ??
      shift?.startTime ??
      null,
    endTime:
      shiftOverride?.endTime ??
      (shouldUseDirectTimes ? (job?.defaultEndTime ?? null) : null) ??
      shift?.endTime ??
      null,
  };
}

export function resolveJobColorsForShift(
  job:
    | (Pick<JobDefinition, "assignmentMode" | "color" | "shiftColorOverrides"> &
        Partial<Pick<JobDefinition, "border" | "text">>)
    | null,
  shift: Pick<ShiftCategory, "id" | "color"> | null,
): {
  color: string;
  text: string;
  border: string;
  isShiftOverride: boolean;
} {
  const shiftOverrideColor = getJobShiftColorOverride(job, shift?.id ?? null);
  const shouldUseShiftlessJobColor = shift == null && job?.assignmentMode === "shiftless";
  const resolvedColor =
    shiftOverrideColor ??
    shift?.color ??
    (shouldUseShiftlessJobColor ? (job?.color ?? null) : null) ??
    normalizePresetBg(null);
  const preset = getPresetByBg(resolvedColor);

  return {
    color: resolvedColor,
    text: shouldUseShiftlessJobColor ? (job?.text ?? preset.text) : preset.text,
    border: shouldUseShiftlessJobColor
      ? (job?.border ?? borderColor(preset.text))
      : borderColor(preset.text),
    isShiftOverride: shiftOverrideColor != null,
  };
}

export function getStoredJobFocusAreaIds(
  job: Pick<JobDefinition, "focusAreaIds" | "focusAreaId">,
): number[] {
  if (job.focusAreaIds && job.focusAreaIds.length > 0) {
    return normalizePlacementIds(job.focusAreaIds);
  }

  return job.focusAreaId != null ? [job.focusAreaId] : [];
}

export function getStoredJobDepartmentIds(job: Pick<JobDefinition, "departmentIds">): number[] {
  return normalizePlacementIds(job.departmentIds);
}

export function resolveEffectiveJobFocusAreaIds(
  job: Pick<JobDefinition, "focusAreaIds" | "focusAreaId" | "departmentIds">,
  focusAreas: Array<Pick<FocusArea, "id" | "departmentId" | "archivedAt">>,
): number[] {
  const explicitFocusAreaIds = new Set(getStoredJobFocusAreaIds(job));
  const departmentIds = new Set(getStoredJobDepartmentIds(job));

  if (departmentIds.size === 0) {
    return [...explicitFocusAreaIds].sort((left, right) => left - right);
  }

  const departmentFocusAreas = focusAreas
    .filter((focusArea) => {
      if (focusArea.archivedAt) return false;
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

export function getJobPlacementShiftPool<
  TShift extends Pick<ShiftCategory, "id" | "focusAreaId" | "archivedAt">,
>(
  job: JobPlacementScope,
  shiftCategories: TShift[],
  focusAreas: Array<Pick<FocusArea, "id" | "departmentId" | "archivedAt">>,
): TShift[] {
  const effectiveFocusAreaIds = new Set(resolveEffectiveJobFocusAreaIds(job, focusAreas));
  const explicitShiftIds = new Set(normalizePlacementIds(job.applicableShiftIds));

  return shiftCategories.filter((shift) => {
    if (shift.archivedAt) return false;

    if (effectiveFocusAreaIds.size > 0) {
      return shift.focusAreaId != null && effectiveFocusAreaIds.has(shift.focusAreaId);
    }

    if (explicitShiftIds.size > 0) {
      return explicitShiftIds.has(shift.id);
    }

    return true;
  });
}
