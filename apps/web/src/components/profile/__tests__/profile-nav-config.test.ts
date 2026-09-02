import { describe, expect, it } from "vitest";

import {
  buildProfileNavGroups,
  getDefaultProfileSection,
  resolveProfileSection,
  PROFILE_FOOTER_GROUP_IDS,
  VALID_PROFILE_SECTIONS,
} from "@/components/profile/profile-nav-config";

describe("profile nav config", () => {
  it("renders one flat primary group with account items", () => {
    for (const isOnSchedule of [true, false]) {
      const groups = buildProfileNavGroups({ isOnSchedule });
      const primary = groups.find((group) => group.id === "primary");
      expect(primary?.items.map((item) => item.id)).toEqual(
        isOnSchedule
          ? ["profile", "security", "notifications", "appearance", "overview"]
          : ["profile", "security", "notifications", "appearance"],
      );
    }
  });

  it("does not expose a legacy Privacy section (account deletion stays in Profile; cookies + policies live in Data & privacy)", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: true });
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).not.toContain("privacy");
    expect(allIds).toContain("data-privacy");
  });

  it("pins Data & privacy to its own footer group at the end of the sidebar", () => {
    for (const isOnSchedule of [true, false]) {
      const groups = buildProfileNavGroups({ isOnSchedule });
      const last = groups[groups.length - 1];
      expect(last?.id).toBe("legal");
      expect(last?.items.map((i) => i.id)).toEqual(["data-privacy"]);
      expect(PROFILE_FOOTER_GROUP_IDS).toContain("legal");
    }
  });

  it("does not add Overview for management-only or non-employee users", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: false });
    expect(groups.map((group) => group.id)).toEqual(["primary", "legal"]);
    expect(groups[0]?.items.map((item) => item.id)).not.toContain("overview");
  });

  it("adds Overview without a separate Schedule destination for on-schedule employees", () => {
    const groups = buildProfileNavGroups({ isOnSchedule: true });
    const primary = groups.find((group) => group.id === "primary");
    expect(primary?.items.map((item) => item.id)).toContain("overview");
    expect(primary?.items.map((item) => item.id)).not.toContain("schedule");
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
    expect(resolveProfileSection("schedule")).toBe("overview");
  });
});
