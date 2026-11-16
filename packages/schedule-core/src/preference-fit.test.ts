import { describe, expect, it } from "vitest";
import { onlyPreferenceBreaks } from "./preference-fit";

const onlyEvening = { mode: "only" as const, shiftIds: [2] };
const prefersDay = { mode: "prefers" as const, shiftIds: [1] };
const onlyCna = { mode: "only" as const, jobIds: [10] };

describe("onlyPreferenceBreaks", () => {
  it("never breaks without a preference or with Prefers", () => {
    expect(onlyPreferenceBreaks(3, 11, undefined, undefined)).toEqual({ shift: false, job: false });
    expect(onlyPreferenceBreaks(3, 11, prefersDay, { mode: "prefers", jobIds: [10] })).toEqual({
      shift: false,
      job: false,
    });
  });

  it("breaks Only shifts for another shift, and not for a chosen one", () => {
    expect(onlyPreferenceBreaks(1, 10, onlyEvening, undefined)).toEqual({
      shift: true,
      job: false,
    });
    expect(onlyPreferenceBreaks(2, 10, onlyEvening, undefined).shift).toBe(false);
  });

  it("breaks Only jobs for another job, and not for a chosen one", () => {
    expect(onlyPreferenceBreaks(1, 11, undefined, onlyCna)).toEqual({ shift: false, job: true });
    expect(onlyPreferenceBreaks(1, 10, undefined, onlyCna).job).toBe(false);
  });

  it("reports both when a choice breaks both", () => {
    expect(onlyPreferenceBreaks(1, 11, onlyEvening, onlyCna)).toEqual({ shift: true, job: true });
  });

  it("treats work with no shift or no job as outside, as Auto-build does", () => {
    expect(onlyPreferenceBreaks(null, 10, onlyEvening, onlyCna)).toEqual({
      shift: true,
      job: false,
    });
    expect(onlyPreferenceBreaks(2, undefined, onlyEvening, onlyCna)).toEqual({
      shift: false,
      job: true,
    });
  });
});
