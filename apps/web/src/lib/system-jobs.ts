import type { JobDefinition, RecurringShift } from "@/types";

export const REGULAR_STAFF_SYSTEM_KEY = "regular_staff";
export const DEFAULT_SHIFT_JOB_SYSTEM_KEY = "default_shift_job";
export const DEFAULT_SCHEDULED_JOB_STYLE = {
  color: "#E5E5E5",
  border: "transparent",
  text: "#262626",
} as const;

type SystemJobLike = Pick<JobDefinition, "systemKey"> | null | undefined;

export function isRegularStaffSystemJob(job: SystemJobLike): boolean {
  return job?.systemKey === REGULAR_STAFF_SYSTEM_KEY;
}

export function isDefaultShiftSystemJob(job: SystemJobLike): boolean {
  return job?.systemKey === DEFAULT_SHIFT_JOB_SYSTEM_KEY;
}

export function isProtectedSystemJob(job: SystemJobLike): boolean {
  return isRegularStaffSystemJob(job) || isDefaultShiftSystemJob(job);
}

/**
 * Whether new work may use a job. With shifts without a job turned off
 * (Settings > Jobs), the default shift job takes no new work; a cell that
 * already holds it keeps it.
 */
export function createsWorkWithJob(job: SystemJobLike, defaultShiftEnabled?: boolean): boolean {
  return defaultShiftEnabled !== false || !isDefaultShiftSystemJob(job);
}

/** `createsWorkWithJob` by job id, for code holding assignments rather than jobs. */
export function jobIdTakesNewWork(
  jobs: ReadonlyArray<Pick<JobDefinition, "id" | "systemKey">>,
  defaultShiftEnabled?: boolean,
): (jobId: number | null | undefined) => boolean {
  if (defaultShiftEnabled !== false) return () => true;
  const off = new Set(jobs.filter((job) => isDefaultShiftSystemJob(job)).map((job) => job.id));
  return (jobId) => jobId == null || !off.has(jobId);
}

/** Recurring days that use a job taking no new work, so a fill leaves them empty. */
export function countPausedRecurringDays(
  recurringShifts: ReadonlyArray<Pick<RecurringShift, "input">>,
  jobs: ReadonlyArray<Pick<JobDefinition, "id" | "systemKey">>,
  defaultShiftEnabled?: boolean,
): number {
  const takesNewWork = jobIdTakesNewWork(jobs, defaultShiftEnabled);
  return recurringShifts.filter(
    ({ input }) =>
      input.kind === "worked" && input.segments.some((segment) => !takesNewWork(segment.jobId)),
  ).length;
}

/** Says how many recurring days wait while shifts without a job are off. */
export function pausedRecurringDaysMessage(count: number): string {
  return `Shifts without a job are off, so ${count} recurring ${count === 1 ? "day that uses one won't" : "days that use one won't"} fill. Give ${count === 1 ? "it" : "them"} a job, or allow shifts without a job in Settings under Jobs.`;
}
