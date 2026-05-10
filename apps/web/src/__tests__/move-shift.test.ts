import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabase";
import { moveShift } from "@/lib/db/shifts";
import { OptimisticLockError } from "@/lib/db/shared";

describe("moveShift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes absence payloads and copy mode to the RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.rpc>>);

    await moveShift(
      "org-1",
      "emp-1",
      "2026-04-14",
      "emp-2",
      "2026-04-15",
      {
        kind: "absence",
        segments: [],
        absenceTypeId: 7,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
      "copy",
      3,
      5,
      false,
    );

    expect(supabase.rpc).toHaveBeenCalledWith("move_shift", {
      p_org_id: "org-1",
      p_source_emp_id: "emp-1",
      p_source_date: "2026-04-14",
      p_target_emp_id: "emp-2",
      p_target_date: "2026-04-15",
      p_kind: "absence",
      p_shift_ids: [],
      p_job_ids: [],
      p_is_mentored_flags: [],
      p_absence_type_id: 7,
      p_custom_start_time: null,
      p_custom_end_time: null,
      p_drag_mode: "copy",
      p_expected_version: 3,
      p_target_expected_version: 5,
      p_target_was_empty: false,
    });
  });

  it("throws OptimisticLockError when the RPC reports a version mismatch", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      error: { message: "Optimistic lock failed: expected version 3, found 4" },
    } as Awaited<ReturnType<typeof supabase.rpc>>);

    await expect(
      moveShift(
        "org-1",
        "emp-1",
        "2026-04-14",
        "emp-2",
        "2026-04-15",
        {
          kind: "absence",
          segments: [],
          absenceTypeId: 7,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        "move",
        3,
      ),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });
});
