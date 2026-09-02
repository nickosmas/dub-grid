import { describe, expect, it } from "vitest";

import {
  getProfileOverviewCurrentWeekDateKeys,
  getProfileOverviewDateRange,
  toPublishedOnlyProfileEntry,
} from "./profile-schedule";
import type { ScheduleCellStateEntry } from "@/types";

describe("toPublishedOnlyProfileEntry", () => {
  it("removes draft snapshots and editor metadata from self-profile data", () => {
    const published = {
      kind: "worked" as const,
      label: "Day",
      segments: [],
      assignmentIds: [1],
      absenceTypeId: null,
      customStartTime: "07:00",
      customEndTime: "15:00",
      seriesId: null,
      fromRecurring: false,
    };
    const entry: ScheduleCellStateEntry = {
      draft: { ...published, label: "Evening", assignmentIds: [2] },
      published,
      effective: published,
      label: "Day",
      assignmentIds: [1],
      isDraft: true,
      isDelete: false,
      draftKind: "modified",
      publishedAssignmentDefinitionIds: [1],
      publishedLabel: "Day",
      version: 4,
      createdBy: "creator",
      updatedBy: "editor",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    expect(toPublishedOnlyProfileEntry(entry)).toMatchObject({
      draft: null,
      effective: published,
      isDraft: false,
      draftKind: null,
      version: undefined,
      createdBy: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    });
  });
});

describe("profile Overview date range", () => {
  it("covers the current organization week and the prior eleven weeks", () => {
    const range = getProfileOverviewDateRange(
      new Date("2026-09-07T01:30:00.000Z"),
      "Pacific/Honolulu",
    );

    expect(range).toEqual({ startDate: "2026-06-21", endDate: "2026-09-12" });
    expect(getProfileOverviewCurrentWeekDateKeys(range)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });
});
