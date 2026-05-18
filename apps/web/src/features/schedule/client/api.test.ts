import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRecurringSchedules, publishSchedule } from "./api";

describe("schedule client api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes the reviewed local calendar date range instead of UTC-shifted dates", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        summary: {
          newShifts: 1,
          modifiedShifts: 0,
          deletedShifts: 0,
          newNotes: 0,
          deletedNotes: 0,
          totalChanges: 1,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-04-11T21:00:00.000Z");

    await publishSchedule(
      "11111111-1111-4111-8111-111111111111",
      new Date(2026, 3, 12),
      new Date(2026, 3, 18),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/publish",
      expect.objectContaining({
        body: JSON.stringify({
          orgId: "11111111-1111-4111-8111-111111111111",
          startDate: "2026-04-12",
          endDate: "2026-04-18",
        }),
      }),
    );
  });

  it("applies recurring schedules to the reviewed local calendar date range", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ generated: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-04-11T21:00:00.000Z");

    await applyRecurringSchedules(
      "11111111-1111-4111-8111-111111111111",
      new Date(2026, 3, 12),
      new Date(2026, 3, 18),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/schedule/manage",
      expect.objectContaining({
        body: JSON.stringify({
          action: "applyRecurringSchedules",
          orgId: "11111111-1111-4111-8111-111111111111",
          startDate: "2026-04-12",
          endDate: "2026-04-18",
        }),
      }),
    );
  });
});
