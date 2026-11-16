import type { CoverageJobPreference, CoverageShiftPreference } from "./coverage-suggestions";

/** Which of a person's Only preferences a choice breaks. */
export interface OnlyPreferenceBreaks {
  shift: boolean;
  job: boolean;
}

/**
 * Whether work on `shiftId` as `jobId` falls outside an Only preference. Work
 * with no shift breaks Only shifts, and work with no job breaks Only jobs, as
 * Auto-build refuses both. A Prefers preference never breaks.
 */
export function onlyPreferenceBreaks(
  shiftId: number | null | undefined,
  jobId: number | null | undefined,
  shiftPreference: CoverageShiftPreference | undefined,
  jobPreference: CoverageJobPreference | undefined,
): OnlyPreferenceBreaks {
  return {
    shift:
      shiftPreference?.mode === "only" &&
      (shiftId == null || !shiftPreference.shiftIds.includes(shiftId)),
    job: jobPreference?.mode === "only" && (jobId == null || !jobPreference.jobIds.includes(jobId)),
  };
}
