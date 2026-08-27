import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportResultsModal from "@/components/ImportResultsModal";
import {
  buildEmployeeNameById,
  summarizeImportPreviousOutcomes,
} from "@/app/(app)/schedule/_lib/operations";
import type { ImportPreviousScheduleOutcome } from "@/features/schedule/client";

function row(
  overrides: Partial<ImportPreviousScheduleOutcome> = {},
): ImportPreviousScheduleOutcome {
  return {
    employeeId: "emp-1",
    sourceDate: "2026-07-19",
    targetDate: "2026-08-02",
    outcome: "imported",
    reason: null,
    ...overrides,
  };
}

describe("ImportResultsModal", () => {
  it("lists every skipped cell, not just a sample, grouped by reason", () => {
    const nameByEmpId = new Map([
      ["emp-1", "Nancy Thornton"],
      ["emp-2", "Kevin Donovan"],
      ["emp-3", "Barbara Trent"],
      ["emp-4", "Janet Morrison"],
    ]);

    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({ outcome: "imported" }),
      row({
        employeeId: "emp-1",
        targetDate: "2026-08-11",
        outcome: "skipped",
        reason: "target_has_data",
      }),
      row({
        employeeId: "emp-2",
        targetDate: "2026-08-12",
        outcome: "skipped",
        reason: "target_has_data",
      }),
      row({
        employeeId: "emp-3",
        targetDate: "2026-08-13",
        outcome: "skipped",
        reason: "target_has_data",
      }),
      row({
        employeeId: "emp-4",
        targetDate: "2026-08-14",
        outcome: "skipped",
        reason: "target_has_data",
      }),
      row({
        employeeId: "emp-1",
        targetDate: "2026-08-15",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);

    render(
      <ImportResultsModal
        sourceRange="Jul 19, 2026 – Aug 1, 2026"
        targetRange="Aug 2, 2026 – Aug 15, 2026"
        outcomes={outcomes}
        breakdown={breakdown}
        nameByEmpId={nameByEmpId}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Imported 1 of 6 shifts/)).toBeInTheDocument();

    // Group headers show the full count, not truncated to 3.
    expect(screen.getByText("Target already had data (4)")).toBeInTheDocument();
    expect(screen.getByText("Employee no longer active (1)")).toBeInTheDocument();

    // Every skipped row is listed individually, unlike the toast's 3-sample cap.
    // Nancy Thornton (emp-1) is skipped twice, for two different reasons.
    expect(screen.getAllByText("Nancy Thornton")).toHaveLength(2);
    expect(screen.getByText("Kevin Donovan")).toBeInTheDocument();
    expect(screen.getByText("Barbara Trent")).toBeInTheDocument();
    expect(screen.getByText("Janet Morrison")).toBeInTheDocument();
    expect(screen.getAllByText("8/15")).toHaveLength(1);
  });

  it("falls back to a generic label for an unknown employee id", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({ employeeId: "missing-emp", outcome: "skipped", reason: "source_has_no_content" }),
    ];
    const breakdown = summarizeImportPreviousOutcomes(outcomes);

    render(
      <ImportResultsModal
        sourceRange="Jul 19, 2026 – Aug 1, 2026"
        targetRange="Aug 2, 2026 – Aug 15, 2026"
        outcomes={outcomes}
        breakdown={breakdown}
        nameByEmpId={new Map()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("an employee")).toBeInTheDocument();
  });

  it("renders inactive and removed employees from the historical name directory", () => {
    const outcomes: ImportPreviousScheduleOutcome[] = [
      row({ employeeId: "inactive", outcome: "skipped", reason: "employee_inactive" }),
      row({
        employeeId: "removed",
        targetDate: "2026-08-03",
        outcome: "skipped",
        reason: "employee_inactive",
      }),
    ];

    render(
      <ImportResultsModal
        sourceRange="Jul 19, 2026 – Aug 1, 2026"
        targetRange="Aug 2, 2026 – Aug 15, 2026"
        outcomes={outcomes}
        breakdown={summarizeImportPreviousOutcomes(outcomes)}
        nameByEmpId={buildEmployeeNameById([
          { id: "inactive", firstName: "Ina", lastName: "Active" },
          { id: "removed", firstName: "Riley", lastName: "Stone" },
        ])}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Ina Active")).toBeInTheDocument();
    expect(screen.getByText("Riley Stone")).toBeInTheDocument();
    expect(screen.queryByText("an employee")).not.toBeInTheDocument();
  });
});
