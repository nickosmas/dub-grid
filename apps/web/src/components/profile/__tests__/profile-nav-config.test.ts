import { describe, expect, it } from "vitest";

import {
  buildProfileNavGroups,
  getDefaultProfileSection,
  resolveProfileSection,
  VALID_PROFILE_SECTIONS,
} from "@/components/profile/profile-nav-config";

describe("profile nav config", () => {
  it("renders a single My work group with Overview and Schedule", () => {
    const groups = buildProfileNavGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("work");
    expect(groups[0].label).toBe("My work");
    expect(groups[0].items.map((i) => i.id)).toEqual(["overview", "schedule"]);
    expect(groups[0].items.map((i) => i.label)).toEqual(["Overview", "Schedule"]);
  });

  it("defaults to Overview", () => {
    expect(getDefaultProfileSection()).toBe("overview");
  });

  it("resolves valid section IDs and rejects unknown ones", () => {
    for (const id of VALID_PROFILE_SECTIONS) {
      expect(resolveProfileSection(id)).toBe(id);
    }
    expect(resolveProfileSection(null)).toBeNull();
    expect(resolveProfileSection("")).toBeNull();
    expect(resolveProfileSection("account")).toBeNull();
    expect(resolveProfileSection("settings")).toBeNull();
  });
});
