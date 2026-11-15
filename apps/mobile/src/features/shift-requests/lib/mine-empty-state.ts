export type MineEmptyState = {
  title: string;
  body: string;
  action: { label: string; href: "/(tabs)/team" | "/(tabs)/home" } | null;
};

/**
 * The Mine tab with nothing open: where the person's shifts are, since a
 * request starts from one, and History when they have past requests. That is
 * the Schedule tab when they can see it, otherwise Home, which lists their
 * own shifts; someone who is on no schedule gets neither.
 */
export function getMineEmptyState(input: {
  canViewScheduleTab: boolean;
  hasOwnShifts: boolean;
  hasHistory: boolean;
}): MineEmptyState {
  const place = !input.hasOwnShifts
    ? null
    : input.canViewScheduleTab
      ? { where: "in Schedule", label: "Go to Schedule", href: "/(tabs)/team" as const }
      : { where: "on Home", label: "Go to Home", href: "/(tabs)/home" as const };
  const prompt = place
    ? `Open one of your shifts ${place.where} to drop or swap it.`
    : "Requests you make show here until they're decided, canceled or expire, or the shift starts.";

  return {
    title: "No open requests",
    body: input.hasHistory ? `${prompt} Your past requests are in History.` : prompt,
    action: place ? { label: place.label, href: place.href } : null,
  };
}
