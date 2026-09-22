import { describe, expect, it } from "vitest";
import { buildActivityFeed } from "./dashboard-stats";
import type { Invitation, PublishHistoryEntryWithName, ShiftRequest } from "@/types";

function publish(
  overrides: Partial<PublishHistoryEntryWithName> = {},
): PublishHistoryEntryWithName {
  return {
    id: "pub-1",
    publishedBy: "profile-1",
    publishedByName: "Jordan Lee",
    startDate: "2026-05-11",
    endDate: "2026-05-17",
    changeCount: 0,
    changes: [],
    publishedAt: "2026-05-10T12:00:00.000Z",
    ...overrides,
  };
}

function request(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: "req-1",
    type: "pickup",
    status: "pending_approval",
    requesterName: "Alex Rivera",
    requesterShiftDate: "2026-05-12",
    requesterPresentation: { label: "D", shiftName: "Day Shift", segments: [] },
    createdAt: "2026-05-10T09:00:00.000Z",
    ...overrides,
  } as ShiftRequest;
}

describe("buildActivityFeed", () => {
  it("folds a publish's cell changes into one row", () => {
    const changes = Array.from({ length: 14 }, (_, i) => ({
      empId: `emp-${i}`,
      date: "2026-05-12",
      kind: i % 2 === 0 ? ("new" as const) : ("modified" as const),
    }));
    const feed = buildActivityFeed(
      [publish({ changes, changeCount: changes.length })],
      [],
      [],
      100,
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "publish",
      description: "Jordan Lee published the schedule · 7 shifts added, 7 updated",
      href: "/schedule",
    });
    expect(feed.some((item) => item.type === "shift_change")).toBe(false);
    expect(feed.some((item) => item.description.includes("2026-05-12"))).toBe(false);
  });

  it("falls back to the recorded count and a nameless publish", () => {
    const { publishedByName: _name, ...entry } = publish({ changeCount: 12 });
    const feed = buildActivityFeed([entry], [], []);

    expect(feed[0]?.description).toBe("Schedule published · 12 changes");
  });

  it("reads request statuses as copy, never the raw token", () => {
    const feed = buildActivityFeed(
      [],
      [request(), request({ id: "req-2", type: "swap", status: "approved" })],
      [],
    );

    expect(feed.map((item) => item.description)).toEqual([
      "Pickup request · Day Shift · Awaiting approval",
      "Swap request · Alex Rivera · Approved",
    ]);
    expect(feed[1]?.iconVariant).toBe("success");
  });

  it("picks one glyph per event kind so the icon says what the row is", () => {
    const feed = buildActivityFeed(
      [publish({ changeCount: 1 })],
      [
        request(),
        request({ id: "req-2", type: "swap" }),
        request({ id: "req-3", type: "calloff" }),
      ],
      [
        {
          id: "inv-1",
          email: "jane@example.com",
          roleToAssign: "user",
          acceptedAt: "2026-05-10T09:00:00.000Z",
        } as Invitation,
      ],
    );

    expect(feed.map((item) => item.iconKind).sort()).toEqual([
      "calloff",
      "pickup",
      "publish",
      "swap",
      "user_signup",
    ]);
  });

  it("names the role of a new member instead of its enum", () => {
    const invitation = {
      id: "inv-1",
      email: "jane@example.com",
      roleToAssign: "admin",
      acceptedAt: "2026-05-10T09:00:00.000Z",
    } as Invitation;
    const pending = { ...invitation, id: "inv-2", acceptedAt: null } as Invitation;

    const feed = buildActivityFeed([], [], [invitation, pending]);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: "user_signup",
      description: "New member · jane@example.com · Admin",
      href: "/people",
    });
  });

  it("sorts most recent first and honors the cap", () => {
    const feed = buildActivityFeed(
      [publish({ publishedAt: "2026-05-10T08:00:00.000Z" })],
      [request({ createdAt: "2026-05-10T12:00:00.000Z" })],
      [
        {
          id: "inv-1",
          email: "jane@example.com",
          roleToAssign: "user",
          acceptedAt: "2026-05-10T06:00:00.000Z",
        } as Invitation,
      ],
      2,
    );

    expect(feed.map((item) => item.type)).toEqual(["request", "publish"]);
  });
});
