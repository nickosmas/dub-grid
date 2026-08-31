import { describe, expect, it } from "vitest";
import { resolveActiveShiftRequests, type ActiveShiftRequestLike } from "./requests-assembly";

function makeRequest(overrides: Partial<ActiveShiftRequestLike> = {}): ActiveShiftRequestLike {
  return {
    type: "pickup",
    status: "pending_approval",
    expiresAt: "2099-01-01T00:00:00.000Z",
    requesterShiftDate: "2026-06-05",
    ...overrides,
  };
}

describe("resolveActiveShiftRequests", () => {
  const now = new Date("2026-06-01T08:00:00.000Z");

  it("excludes terminal statuses", () => {
    const requests = [
      makeRequest({ status: "expired" }),
      makeRequest({ status: "cancelled" }),
      makeRequest({ status: "approved" }),
      makeRequest({ status: "rejected" }),
      makeRequest({ status: "pending_approval" }),
    ];
    expect(resolveActiveShiftRequests(requests, now)).toHaveLength(1);
  });

  it("excludes requests past their expiry", () => {
    const requests = [
      makeRequest({ expiresAt: "2026-05-01T00:00:00.000Z" }),
      makeRequest({ expiresAt: "2099-01-01T00:00:00.000Z" }),
    ];
    expect(resolveActiveShiftRequests(requests, now)).toHaveLength(1);
  });

  it("excludes requests whose shift has already started", () => {
    const requests = [
      makeRequest({
        requesterShiftDate: "2026-06-01",
        requesterPresentation: { startTime: "06:00", endTime: "14:00", segments: null },
      }),
      makeRequest({
        requesterShiftDate: "2026-06-01",
        requesterPresentation: { startTime: "10:00", endTime: "18:00", segments: null },
      }),
    ];
    const active = resolveActiveShiftRequests(requests, now, "UTC");
    expect(active).toHaveLength(1);
    expect(active[0].requesterPresentation?.startTime).toBe("10:00");
  });
});
