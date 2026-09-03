import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyRecurringSchedules,
  deleteShift,
  endScheduleEditorSession,
  endScheduleEditorSessions,
  fetchScheduleEditorSessionStatus,
  publishSchedule,
  upsertShift,
} from "./api";
import type { ScheduleCellInput } from "@/types";

describe("schedule client api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps schedule-editor takeover separate from authentication sessions", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ended: true, endedAt: "2026-09-02T22:00:00.000Z" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await endScheduleEditorSession({
      orgId: "11111111-1111-4111-8111-111111111111",
      targetEditorSessionId: "22222222-2222-4222-8222-222222222222",
      endingEditorSessionId: "33333333-3333-4333-8333-333333333333",
    });
    await endScheduleEditorSessions({
      orgId: "11111111-1111-4111-8111-111111111111",
      targetEditorSessionIds: [
        "22222222-2222-4222-8222-222222222222",
        "44444444-4444-4444-8444-444444444444",
      ],
      endingEditorSessionId: "33333333-3333-4333-8333-333333333333",
    });
    await fetchScheduleEditorSessionStatus({
      orgId: "11111111-1111-4111-8111-111111111111",
      editorSessionId: "22222222-2222-4222-8222-222222222222",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/schedule/editor-sessions");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          orgId: "11111111-1111-4111-8111-111111111111",
          targetEditorSessionIds: ["22222222-2222-4222-8222-222222222222"],
          endingEditorSessionId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          orgId: "11111111-1111-4111-8111-111111111111",
          targetEditorSessionIds: [
            "22222222-2222-4222-8222-222222222222",
            "44444444-4444-4444-8444-444444444444",
          ],
          endingEditorSessionId: "33333333-3333-4333-8333-333333333333",
        }),
      }),
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/schedule/editor-sessions?orgId=11111111-1111-4111-8111-111111111111&editorSessionId=22222222-2222-4222-8222-222222222222",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/sign-out"),
      expect.anything(),
    );
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

  describe("cell echo", () => {
    const ORG = "11111111-1111-4111-8111-111111111111";
    const EMP = "22222222-2222-4222-8222-222222222222";

    function stubFetch(payload: unknown) {
      const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payload,
      }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    /** A minimal well-formed cell input — the payload shape isn't under test. */
    const deletedInput: ScheduleCellInput = {
      kind: "deleted",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    };

    it("sends the label maps as entry arrays the server can rebuild", async () => {
      const fetchMock = stubFetch({ success: true, cells: {} });

      await deleteShift(EMP, "2026-04-12", ORG, 3, {
        isScheduler: true,
        assignmentLabelMap: new Map([[7, "DAY"]]),
        absenceTypeMap: new Map([[2, "PTO"]]),
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.echo).toEqual({
        isScheduler: true,
        assignmentLabels: [[7, "DAY"]],
        absenceTypeLabels: [[2, "PTO"]],
      });
    });

    it("omits echo entirely when the caller doesn't want cells back", async () => {
      const fetchMock = stubFetch({ success: true });

      await deleteShift(EMP, "2026-04-12", ORG, 3);

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect("echo" in body).toBe(false);
    });

    it("returns the echoed cells, including nulls for cells that were emptied", async () => {
      const entry = {
        label: "DAY",
        assignmentIds: [1],
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
      };
      stubFetch({
        success: true,
        cells: { [`${EMP}_2026-04-12`]: entry, [`${EMP}_2026-04-13`]: null },
      });

      const cells = await upsertShift(EMP, "2026-04-12", deletedInput, ORG, 1, {
        isScheduler: true,
        assignmentLabelMap: new Map(),
      });

      expect(cells).toEqual({
        [`${EMP}_2026-04-12`]: entry,
        [`${EMP}_2026-04-13`]: null,
      });
    });

    it("returns null when the server sent no cells, so the caller can refetch", async () => {
      stubFetch({ success: true });

      const cells = await deleteShift(EMP, "2026-04-12", ORG, 1, {
        isScheduler: true,
        assignmentLabelMap: new Map(),
      });

      expect(cells).toBeNull();
    });
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
