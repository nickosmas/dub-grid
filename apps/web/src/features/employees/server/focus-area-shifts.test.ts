import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { clearFocusAreaShiftsAfterSave, planFocusAreaShifts } from "./focus-area-shifts";

const ORG_ID = "org-1";
const EMP_ID = "emp-1";

let rpcResult: { data: unknown; error: unknown };
const rpc = vi.fn(() => Promise.resolve(rpcResult));
const audits: unknown[] = [];

function client(): SupabaseClient {
  return {
    rpc,
    from: (table: string) => {
      if (table === "audit_log") {
        return {
          insert: (row: unknown) => {
            audits.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () =>
          Promise.resolve({
            data: [
              { id: 3, name: "East Wing" },
              { id: 4, name: "West Wing" },
            ],
            error: null,
          }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const eastRow = {
  focus_area_id: 3,
  shift_count: 2,
  first_date: "2026-11-03",
  last_date: "2026-11-05",
};
const east = {
  focusAreaId: 3,
  focusAreaName: "East Wing",
  count: 2,
  firstDate: "2026-11-03",
  lastDate: "2026-11-05",
};

beforeEach(() => {
  rpc.mockClear();
  audits.length = 0;
  rpcResult = { data: [eastRow], error: null };
});

describe("planFocusAreaShifts", () => {
  const plan = (before: number[], after: number[], decision?: "clear" | "keep") =>
    planFocusAreaShifts(client(), { orgId: ORG_ID, employeeId: EMP_ID, before, after, decision });

  it("asks nothing when no focus area is removed or the answer is keep", async () => {
    await expect(plan([3], [3, 4])).resolves.toEqual({ clear: [] });
    await expect(plan([3, 4], [4], "keep")).resolves.toEqual({ clear: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts only the removed focus areas", async () => {
    await plan([3, 4], [4], "clear");
    expect(rpc).toHaveBeenCalledWith("upcoming_focus_area_shifts", {
      p_emp_id: EMP_ID,
      p_focus_area_ids: [3],
    });
  });

  it("refuses without an answer when the removed areas hold upcoming shifts", async () => {
    await expect(plan([3, 4], [4])).resolves.toEqual({
      refuse: {
        error: "Choose whether to clear or keep their 2 upcoming shifts in East Wing.",
        code: "FOCUS_AREA_SHIFTS_DECISION",
        focusAreaShifts: [east],
      },
    });
  });

  it("asks nothing when the removed areas hold no upcoming shifts", async () => {
    rpcResult = { data: [], error: null };
    await expect(plan([3, 4], [4])).resolves.toEqual({ clear: [] });
  });

  it("names the areas to clear on clear", async () => {
    await expect(plan([3, 4], [4], "clear")).resolves.toEqual({ clear: [east] });
  });

  it("throws when the count fails, so nothing is saved", async () => {
    rpcResult = { data: null, error: new Error("boom") };
    await expect(plan([3], [])).rejects.toThrow("boom");
  });
});

describe("clearFocusAreaShiftsAfterSave", () => {
  const clear = (areas = [east]) =>
    clearFocusAreaShiftsAfterSave(client(), {
      orgId: ORG_ID,
      employeeId: EMP_ID,
      firstName: "Barbara",
      lastName: "Trent",
      areas,
      actor: { id: "actor-1", email: "boss@dubgrid.test" },
      ipAddress: null,
      userAgent: null,
    });

  it("does nothing with no areas", async () => {
    await expect(clear([])).resolves.toEqual({ cleared: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears and records the clear", async () => {
    rpcResult = { data: 2, error: null };
    await expect(clear()).resolves.toEqual({ cleared: 2 });
    expect(rpc).toHaveBeenCalledWith("clear_focus_area_shifts", {
      p_emp_id: EMP_ID,
      p_focus_area_ids: [3],
      p_actor_id: "actor-1",
    });
    expect(audits).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        action: "employee.focus_area_shifts_cleared",
        resource_id: EMP_ID,
        details: { firstName: "Barbara", lastName: "Trent", count: 2, focusAreas: ["East Wing"] },
      }),
    ]);
  });

  it("records nothing when there was nothing left to clear", async () => {
    rpcResult = { data: 0, error: null };
    await expect(clear()).resolves.toEqual({ cleared: 0 });
    expect(audits).toEqual([]);
  });

  it("says the shifts weren't cleared when the clear fails", async () => {
    rpcResult = { data: null, error: new Error("boom") };
    await expect(clear()).resolves.toEqual({
      notCleared:
        "Saved, but their shifts in East Wing weren't cleared. Remove them on the schedule.",
    });
    expect(audits).toEqual([]);
  });
});
