import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import type { TabsGateResult } from "../../features/auth/hooks/useTabsGate";

type ReadyTabsGate = Extract<TabsGateResult, { kind: "ready" }>;
type TabGateFlag = "canViewHomeTab" | "canViewTeamSchedule" | "canViewRequestsTab";

export type AppTab = {
  name: "home" | "team" | "requests" | "people" | "profile";
  label: string;
  sf: { default: SFSymbol; selected: SFSymbol };
  material: AndroidSymbol;
  /** The gate flag that shows the tab; a tab without one is always shown. */
  gate?: TabGateFlag;
};

/** Every tab, in order. Each platform's tab layout draws this one list. */
export const APP_TABS: readonly AppTab[] = [
  {
    name: "home",
    label: "Home",
    // An SF Symbol like the other tabs: a vector glyph loads its two images
    // separately, and when the selected one lands first react-native-screens
    // throws and the whole tab tree fails.
    sf: { default: "house", selected: "house.fill" },
    material: "home",
    gate: "canViewHomeTab",
  },
  {
    name: "team",
    label: "Schedule",
    sf: { default: "calendar", selected: "calendar" },
    material: "calendar_month",
    gate: "canViewTeamSchedule",
  },
  {
    name: "requests",
    label: "Requests",
    sf: { default: "arrow.left.arrow.right", selected: "arrow.left.arrow.right.circle.fill" },
    material: "swap_horiz",
    gate: "canViewRequestsTab",
  },
  {
    name: "people",
    label: "People",
    sf: { default: "person.2", selected: "person.2.fill" },
    material: "group",
  },
  {
    name: "profile",
    label: "Profile",
    sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" },
    material: "account_circle",
  },
];

export function visibleAppTabs(gate: ReadyTabsGate): AppTab[] {
  return APP_TABS.filter((tab) => !tab.gate || gate[tab.gate]);
}
