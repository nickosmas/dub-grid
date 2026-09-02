import type { JobDefinition } from "@/types";

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
