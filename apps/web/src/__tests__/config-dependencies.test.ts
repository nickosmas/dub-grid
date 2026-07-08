import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/lib/db/shared", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/shared")>("@/lib/db/shared");
  return {
    ...actual,
    supabase: {
      from: (table: string) => from(table),
    },
  };
});

import { checkJobDependencies } from "@/lib/db/config";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function makeScheduleCellsBuilder(data: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(async () => ({ data, error: null })),
  };

  return chain;
}

function makeRecurringStatesBuilder(data: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(async () => ({ data, error: null })),
  };

  return chain;
}

function makeCoverageRequirementsBuilder(count: number) {
  let eqCalls = 0;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => {
      eqCalls += 1;
      if (eqCalls >= 2) return Promise.resolve({ count, error: null });
      return chain;
    }),
  };

  return chain;
}

describe("config dependency checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a valid nested schedule cell projection when checking job dependencies", async () => {
    const scheduleCellsBuilder = makeScheduleCellsBuilder([
      {
        id: "cell-1",
        snapshots: [
          {
            absence_type_id: null,
            segments: [{ shift_id: 10, job_id: 42 }],
          },
        ],
      },
      {
        id: "cell-2",
        snapshots: [
          {
            absence_type_id: null,
            segments: [{ shift_id: 11, job_id: 99 }],
          },
        ],
      },
    ]);
    const recurringStatesBuilder = makeRecurringStatesBuilder([
      {
        id: "recurring-1",
        state: {
          kind: "worked",
          label: "Day",
          absenceTypeId: null,
          segments: [{ shiftId: 10, jobId: 42, label: "Supervisor" }],
        },
      },
    ]);
    const coverageRequirementsBuilder = makeCoverageRequirementsBuilder(2);

    from
      .mockImplementationOnce((table: string) => {
        expect(table).toBe("schedule_cells");
        return scheduleCellsBuilder;
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe("recurring_shifts");
        return recurringStatesBuilder;
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe("coverage_requirements");
        return coverageRequirementsBuilder;
      });

    await expect(checkJobDependencies(42, "org-1")).resolves.toEqual({
      hasDependencies: true,
      summary: "Used by 1 shift and 1 recurring template and 2 coverage requirements",
    });

    const firstSelectCall = scheduleCellsBuilder.select.mock.calls[0] as unknown as
      [string] | undefined;
    const projection = normalizeWhitespace(firstSelectCall?.[0] ?? "");
    expect(projection).toContain("segments:schedule_cell_segments( shift_id, job_id )");
    expect(projection).not.toMatch(/job_id\s*,\s*\)/);
  });
});
