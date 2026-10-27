import { describe, expect, it } from "vitest";
import type { ScheduleCellStateEntry } from "@/types";
import { scheduleCellSnapshotToInput } from "@/lib/schedule-cells";
import { planAbsenceRunRemoval } from "./absence-run-removal";
import { planUndo } from "./coverage-suggestions";

const VACATION = 7;
const DAYS = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];

function absent(absenceTypeId: number): ScheduleCellStateEntry {
  return {
    label: "VAC",
    assignmentIds: [],
    isDraft: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: [],
    publishedLabel: "VAC",
    absenceTypeId,
    publishedAbsenceTypeId: absenceTypeId,
    effective: {
      kind: "absence",
      segments: [],
      assignmentIds: [],
      label: "VAC",
      absenceTypeId,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
  };
}

const run = Object.fromEntries(DAYS.map((dateKey) => [`ana_${dateKey}`, absent(VACATION)]));

describe("planAbsenceRunRemoval", () => {
  it("empties every day and remembers each as it stood", () => {
    const plan = planAbsenceRunRemoval("ana", DAYS, run);

    expect(plan.writes).toEqual(
      DAYS.map((dateKey) => ({ employeeId: "ana", dateKey, input: null })),
    );
    expect(plan.before.map((write) => write.input)).toEqual(
      DAYS.map(() => scheduleCellSnapshotToInput(absent(VACATION).effective)),
    );
    expect(plan.before[0].input?.absenceTypeId).toBe(VACATION);
  });

  it("lets Undo put back the whole run once it is removed", () => {
    const plan = planAbsenceRunRemoval("ana", DAYS, run);
    const removed = Object.fromEntries(
      DAYS.map((dateKey) => [`ana_${dateKey}`, { ...absent(VACATION), isDelete: true }]),
    );

    expect(planUndo(plan, removed)).toEqual({ restore: plan.before, kept: 0 });
    // A day with no draft backing leaves the map entirely.
    expect(planUndo(plan, {})).toEqual({ restore: plan.before, kept: 0 });
  });

  it("keeps a day someone changed since the removal", () => {
    const plan = planAbsenceRunRemoval("ana", DAYS, run);
    const changed = { [`ana_${DAYS[2]}`]: absent(9) };

    const { restore, kept } = planUndo(plan, changed);
    expect(kept).toBe(1);
    expect(restore.map((write) => write.dateKey)).toEqual([DAYS[0], DAYS[1], DAYS[3]]);
  });
});
