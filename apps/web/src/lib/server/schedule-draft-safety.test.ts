import { describe, expect, it, vi } from "vitest";
import { discardScheduleDraftsDirect } from "./schedule-draft-safety";

describe("discardScheduleDraftsDirect", () => {
  it("hands the whole discard to one database transaction with the caller's bounds", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    await discardScheduleDraftsDirect({
      orgId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      startDate: "2026-04-12",
      endDate: "2026-04-18",
      serviceClient: { rpc } as never,
    });

    expect(rpc).toHaveBeenCalledWith("discard_schedule_drafts", {
      p_org_id: "11111111-1111-4111-8111-111111111111",
      p_user_id: "22222222-2222-4222-8222-222222222222",
      p_start_date: "2026-04-12",
      p_end_date: "2026-04-18",
    });
  });

  it("passes nulls for an unbounded, everyone's-drafts discard", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });

    await discardScheduleDraftsDirect({
      orgId: "11111111-1111-4111-8111-111111111111",
      serviceClient: { rpc } as never,
    });

    expect(rpc).toHaveBeenCalledWith("discard_schedule_drafts", {
      p_org_id: "11111111-1111-4111-8111-111111111111",
      p_user_id: null,
      p_start_date: null,
      p_end_date: null,
    });
  });

  it("surfaces a database refusal instead of reporting a discard that did not happen", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error("permission denied") });

    await expect(
      discardScheduleDraftsDirect({
        orgId: "11111111-1111-4111-8111-111111111111",
        serviceClient: { rpc } as never,
      }),
    ).rejects.toThrow("permission denied");
  });
});
