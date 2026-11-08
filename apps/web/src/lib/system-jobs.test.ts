import { describe, expect, it } from "vitest";
import type { RecurringShift } from "@/types";
import {
  countPausedRecurringDays,
  createsWorkWithJob,
  jobIdTakesNewWork,
  pausedRecurringDaysMessage,
} from "./system-jobs";

const shiftOnly = { id: 43, systemKey: "default_shift_job" };
const charge = { id: 7, systemKey: null };
const jobs = [shiftOnly, charge];

function recurring(jobIds: number[]): Pick<RecurringShift, "input"> {
  return {
    input: {
      kind: "worked",
      segments: jobIds.map((jobId, position) => ({ shiftId: 1, jobId, position })),
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    },
  } as Pick<RecurringShift, "input">;
}

describe("new work with the default shift job", () => {
  it("is allowed unless shifts without a job are turned off", () => {
    expect(createsWorkWithJob(shiftOnly, true)).toBe(true);
    expect(createsWorkWithJob(shiftOnly, undefined)).toBe(true);
    expect(createsWorkWithJob(shiftOnly, false)).toBe(false);
    expect(createsWorkWithJob(charge, false)).toBe(true);
  });

  it("is told apart by job id", () => {
    expect(jobIdTakesNewWork(jobs, false)(43)).toBe(false);
    expect(jobIdTakesNewWork(jobs, false)(7)).toBe(true);
    expect(jobIdTakesNewWork(jobs, false)(null)).toBe(true);
    expect(jobIdTakesNewWork(jobs, true)(43)).toBe(true);
  });
});

describe("recurring days paused while shifts without a job are off", () => {
  it("counts each day with a shift without a job, even beside a job", () => {
    const days = [recurring([43]), recurring([7, 43]), recurring([7])];
    expect(countPausedRecurringDays(days, jobs, false)).toBe(2);
    expect(countPausedRecurringDays(days, jobs, true)).toBe(0);
  });

  it("says how many wait", () => {
    expect(pausedRecurringDaysMessage(1)).toMatch(/1 recurring day that uses one won't fill/);
    expect(pausedRecurringDaysMessage(3)).toMatch(/3 recurring days that use one won't fill/);
  });
});
