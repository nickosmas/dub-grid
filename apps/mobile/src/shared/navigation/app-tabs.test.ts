import { describe, expect, it } from "vitest";
import { visibleAppTabs } from "./app-tabs";

const gate = (overrides: Partial<Parameters<typeof visibleAppTabs>[0]> = {}) => ({
  kind: "ready" as const,
  canViewHomeTab: true,
  canViewTeamSchedule: true,
  canViewRequestsTab: true,
  ...overrides,
});

const names = (g: Parameters<typeof visibleAppTabs>[0]) => visibleAppTabs(g).map((tab) => tab.name);

describe("visibleAppTabs", () => {
  it("shows every tab, in order, to someone who can see them all", () => {
    expect(names(gate())).toEqual(["home", "team", "requests", "people", "profile"]);
  });

  it("hides each gated tab its flag turns off", () => {
    expect(names(gate({ canViewHomeTab: false }))).toEqual([
      "team",
      "requests",
      "people",
      "profile",
    ]);
    expect(names(gate({ canViewTeamSchedule: false, canViewRequestsTab: false }))).toEqual([
      "home",
      "people",
      "profile",
    ]);
  });

  it("always keeps People and Profile", () => {
    expect(
      names(gate({ canViewHomeTab: false, canViewTeamSchedule: false, canViewRequestsTab: false })),
    ).toEqual(["people", "profile"]);
  });
});
