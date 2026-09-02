// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { fetchProfileOverviewScheduleCells } from "./profile";

describe("fetchProfileOverviewScheduleCells", () => {
  it("bounds the self-profile schedule query to the Overview metrics window", async () => {
    const result = { data: [], error: null };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => Promise.resolve(result)),
    };
    const client = { from: vi.fn(() => builder) };

    await expect(
      fetchProfileOverviewScheduleCells(client as never, "org-1", "employee-1", {
        startDate: "2026-06-21",
        endDate: "2026-09-12",
      }),
    ).resolves.toEqual([]);

    expect(client.from).toHaveBeenCalledWith("schedule_cells");
    expect(builder.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(builder.eq).toHaveBeenCalledWith("emp_id", "employee-1");
    expect(builder.gte).toHaveBeenCalledWith("date", "2026-06-21");
    expect(builder.lte).toHaveBeenCalledWith("date", "2026-09-12");
  });
});
