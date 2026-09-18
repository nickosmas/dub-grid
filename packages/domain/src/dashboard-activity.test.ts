import { describe, expect, it } from "vitest";
import {
  describeMemberSignupActivity,
  describeShiftRequestActivity,
  summarizePublishChanges,
} from "./dashboard-activity";

describe("summarizePublishChanges", () => {
  it("folds per-cell changes into one phrase", () => {
    expect(
      summarizePublishChanges([
        { kind: "new" },
        { kind: "new" },
        { kind: "new" },
        { kind: "modified" },
        { kind: "deleted" },
        { kind: "deleted" },
      ]),
    ).toBe("3 shifts added, 1 updated, 2 removed");
  });

  it("names the unit on whichever kind comes first", () => {
    expect(summarizePublishChanges([{ kind: "new" }])).toBe("1 shift added");
    expect(summarizePublishChanges([{ kind: "modified" }, { kind: "deleted" }])).toBe(
      "1 shift updated, 1 removed",
    );
    expect(summarizePublishChanges([{ kind: "deleted" }, { kind: "deleted" }])).toBe(
      "2 shifts removed",
    );
  });

  it("falls back to the recorded count, then to no changes", () => {
    expect(summarizePublishChanges([], 12)).toBe("12 changes");
    expect(summarizePublishChanges([], 1)).toBe("1 change");
    expect(summarizePublishChanges([])).toBe("No shift changes");
    expect(summarizePublishChanges([], 0)).toBe("No shift changes");
  });
});

describe("describeShiftRequestActivity", () => {
  it("reads a pickup by shift and a swap by requester, with human statuses", () => {
    expect(
      describeShiftRequestActivity({
        type: "pickup",
        shiftName: "Day Shift",
        requesterName: "Alex Rivera",
        status: "pending_approval",
      }),
    ).toBe("Pickup request · Day Shift · Awaiting approval");
    expect(
      describeShiftRequestActivity({
        type: "swap",
        shiftName: "Day Shift",
        requesterName: "Alex Rivera",
        status: "approved",
      }),
    ).toBe("Swap request · Alex Rivera · Approved");
    expect(
      describeShiftRequestActivity({
        type: "calloff",
        shiftName: "Night",
        requesterName: "Sam Lee",
        status: "expired",
      }),
    ).toBe("Call-off request · Sam Lee · Expired");
  });
});

describe("describeMemberSignupActivity", () => {
  it("shows the role label, never the enum", () => {
    expect(describeMemberSignupActivity({ email: "jane@example.com", role: "super_admin" })).toBe(
      "New member · jane@example.com · Super Admin",
    );
    expect(describeMemberSignupActivity({ email: "kim@example.com", role: "user" })).toBe(
      "New member · kim@example.com · User",
    );
  });
});
