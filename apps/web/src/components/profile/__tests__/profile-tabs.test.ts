import { describe, expect, it } from "vitest";
import { availableProfileTabs, resolveProfileLink } from "../profile-tabs";

const ALL = availableProfileTabs({ hasStaffRecord: true, isOnSchedule: true });

describe("availableProfileTabs", () => {
  it("offers Schedule only to someone on the schedule, and only Account without a staff record", () => {
    expect(ALL).toEqual(["overview", "schedule", "account"]);
    expect(availableProfileTabs({ hasStaffRecord: true, isOnSchedule: false })).toEqual([
      "overview",
      "account",
    ]);
    expect(availableProfileTabs({ hasStaffRecord: false, isOnSchedule: false })).toEqual([
      "account",
    ]);
  });
});

describe("resolveProfileLink", () => {
  it("opens the tab a ?tab= link names", () => {
    expect(resolveProfileLink({ tab: "schedule", section: null }, ALL)).toEqual({
      tab: "schedule",
      section: null,
    });
  });

  it.each([
    ["security", "security"],
    ["notifications", "notifications"],
    ["data-privacy", "data-privacy"],
    ["profile", "details"],
  ])("sends an old ?section=%s link to Account at its heading", (section, heading) => {
    expect(resolveProfileLink({ tab: null, section }, ALL)).toEqual({
      tab: "account",
      section: heading,
    });
  });

  it("sends the old overview section to Overview", () => {
    expect(resolveProfileLink({ tab: null, section: "overview" }, ALL).tab).toBe("overview");
  });

  it("falls back to the first tab this viewer has", () => {
    expect(
      resolveProfileLink({ tab: "schedule", section: null }, ["overview", "account"]).tab,
    ).toBe("overview");
    expect(resolveProfileLink({ tab: null, section: "overview" }, ["account"]).tab).toBe("account");
    expect(resolveProfileLink({ tab: null, section: null }, ALL).tab).toBe("overview");
  });
});
