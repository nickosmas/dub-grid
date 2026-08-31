import { describe, expect, it, vi } from "vitest";
import { fetchFilteredAuditRows } from "./server-query";

describe("fetchFilteredAuditRows", () => {
  it("passes target and high-risk filters to the database before pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });

    const rows = await fetchFilteredAuditRows({ rpc } as never, {
      actionPrefixes: ["employee.", "invitation."],
      highRiskOnly: true,
      limit: 50,
      offset: 100,
      orgId: "11111111-1111-4111-8111-111111111111",
      target: "Mina Diaz",
    });

    expect(rows).toEqual([{ id: 1 }]);
    expect(rpc).toHaveBeenCalledWith("get_filtered_audit_log", {
      p_action: null,
      p_action_prefix: null,
      p_action_prefixes: ["employee.", "invitation."],
      p_actor_id: null,
      p_end_date: null,
      p_high_risk_only: true,
      p_limit: 50,
      p_offset: 100,
      p_org_id: "11111111-1111-4111-8111-111111111111",
      p_resource_type: null,
      p_start_date: null,
      p_target: "Mina Diaz",
    });
  });
});
