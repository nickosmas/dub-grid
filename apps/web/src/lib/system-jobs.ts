import type { JobDefinition } from "@/types";

export const REGULAR_STAFF_SYSTEM_KEY = "regular_staff";
export const DEFAULT_SHIFT_JOB_SYSTEM_KEY = "default_shift_job";

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
