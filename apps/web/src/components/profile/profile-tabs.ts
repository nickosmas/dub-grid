// The tabs of /profile, and where an older ?section= link lands now that the
// settings sidebar is gone.

export type ProfileTab = "account" | "schedule";

/** The headings inside Account, which old links scroll to. */
export type ProfileAccountSection = "details" | "security" | "notifications" | "data-privacy";

const ACCOUNT_SECTIONS: Record<string, ProfileAccountSection> = {
  profile: "details",
  details: "details",
  security: "security",
  notifications: "notifications",
  "data-privacy": "data-privacy",
};

export function availableProfileTabs(ctx: {
  hasStaffRecord: boolean;
  isOnSchedule: boolean;
}): ProfileTab[] {
  return ctx.hasStaffRecord && ctx.isOnSchedule ? ["account", "schedule"] : ["account"];
}

/** The tab and Account heading a `?tab=` or `?section=` link means for this viewer. */
export function resolveProfileLink(
  params: { tab: string | null; section: string | null },
  tabs: readonly ProfileTab[],
): { tab: ProfileTab; section: ProfileAccountSection | null } {
  const section = params.section ? ACCOUNT_SECTIONS[params.section] : undefined;
  if (section) return { tab: "account", section };
  const asked = params.tab ?? params.section;
  const wanted = asked === "overview" ? "schedule" : asked;
  const tab = tabs.find((candidate) => candidate === wanted) ?? tabs[0];
  return { tab, section: null };
}
