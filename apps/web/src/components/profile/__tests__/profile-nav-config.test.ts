import { describe, expect, it } from "vitest";

import {
  buildProfileNavGroups,
  getDefaultProfileSection,
  resolveProfileSection,
  VALID_PROFILE_SECTIONS,
} from "@/components/profile/profile-nav-config";

describe("profile nav config", () => {
  it("always renders the Account group with Profile/Security/Notifications", () => {
    for (const isOnSchedule of [true, false]) {
      const groups = buildProfileNavGroups({ isOnSchedule });
      const account = groups.find((g) => g.id === "account");
      expect(account?.label).toBe("Account");
      expect(account?.items.map((i) => i.id)).toEqual([
        "profile",
        "security",
        "notifications",
      ]);
    }
  });

  it("does not expose a Privacy section (account deletion → Profile, cookies → Notifications, policies → Header menu)", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: true });
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).not.toContain("privacy");
  });

  it("hides the My work group for users who are not on the schedule (management-only or non-employees)", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: false });
    expect(groups.map((g) => g.id)).toEqual(["account"]);
  });

  it("renders the My work group with Overview and Schedule for on-schedule employees", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: true });
    const work = groups.find((g) => g.id === "work");
    expect(work?.label).toBe("My work");
    expect(work?.items.map((i) => i.id)).toEqual(["overview", "schedule"]);
  });

  it("defaults to Profile so anyone landing on /profile sees their account first", () => {
    expect(getDefaultProfileSection()).toBe("profile");
  });

  it("resolves valid section IDs and rejects unknown ones", () => {
    for (const id of VALID_PROFILE_SECTIONS) {
      expect(resolveProfileSection(id)).toBe(id);
    }
    expect(resolveProfileSection(null)).toBeNull();
    expect(resolveProfileSection("")).toBeNull();
    expect(resolveProfileSection("org-general")).toBeNull();
    expect(resolveProfileSection("settings")).toBeNull();
    expect(resolveProfileSection("privacy")).toBeNull();
  });
});
