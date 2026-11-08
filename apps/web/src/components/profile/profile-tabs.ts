// The tabs of /profile, and where an older ?section= link lands now that the
// settings that sat under Account have tabs of their own.

export type ProfileTab = "account" | "schedule" | "alerts" | "security" | "privacy";

const SECTION_TABS: Record<string, ProfileTab> = {
  profile: "account",
  details: "account",
  overview: "schedule",
  security: "security",
  notifications: "alerts",
  "data-privacy": "privacy",
};

export function availableProfileTabs(ctx: {
  hasStaffRecord: boolean;
  isOnSchedule: boolean;
}): ProfileTab[] {
  const schedule: ProfileTab[] = ctx.hasStaffRecord && ctx.isOnSchedule ? ["schedule"] : [];
  return ["account", ...schedule, "alerts", "security", "privacy"];
}

/** The tab a `?tab=` or older `?section=` link means for this viewer. */
export function resolveProfileLink(
  params: { tab: string | null; section: string | null },
  tabs: readonly ProfileTab[],
): ProfileTab {
  const asked = params.tab ?? params.section;
  const wanted = asked ? (SECTION_TABS[asked] ?? asked) : null;
  return tabs.find((candidate) => candidate === wanted) ?? tabs[0];
}
