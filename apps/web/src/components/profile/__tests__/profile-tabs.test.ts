import { describe, expect, it } from "vitest";
import { availableProfileTabs, resolveProfileLink } from "../profile-tabs";

const ALL = availableProfileTabs({ hasStaffRecord: true, isOnSchedule: true });
const OFF_SCHEDULE = availableProfileTabs({ hasStaffRecord: true, isOnSchedule: false });

describe("availableProfileTabs", () => {
  it("offers Schedule only to someone on the schedule, and the settings tabs to everyone", () => {
    expect(ALL).toEqual(["account", "schedule", "alerts", "security", "privacy"]);
    expect(OFF_SCHEDULE).toEqual(["account", "alerts", "security", "privacy"]);
    expect(availableProfileTabs({ hasStaffRecord: false, isOnSchedule: false })).toEqual(
      OFF_SCHEDULE,
    );
  });
});

describe("resolveProfileLink", () => {
  it.each(["account", "schedule", "alerts", "security", "privacy"])(
    "opens the tab a ?tab=%s link names",
    (tab) => {
      expect(resolveProfileLink({ tab, section: null }, ALL)).toBe(tab);
    },
  );

  it.each([
    ["security", "security"],
    ["notifications", "alerts"],
    ["data-privacy", "privacy"],
    ["profile", "account"],
    ["details", "account"],
    ["overview", "schedule"],
  ])("sends an old ?section=%s link to %s", (section, tab) => {
    expect(resolveProfileLink({ tab: null, section }, ALL)).toBe(tab);
  });

  it("sends an old ?tab=overview link to Schedule", () => {
    expect(resolveProfileLink({ tab: "overview", section: null }, ALL)).toBe("schedule");
  });

  it("falls back to the first tab this viewer has", () => {
    expect(resolveProfileLink({ tab: "schedule", section: null }, OFF_SCHEDULE)).toBe("account");
    expect(resolveProfileLink({ tab: null, section: "overview" }, OFF_SCHEDULE)).toBe("account");
    expect(resolveProfileLink({ tab: "nonsense", section: null }, ALL)).toBe("account");
    expect(resolveProfileLink({ tab: null, section: null }, ALL)).toBe("account");
  });
});
