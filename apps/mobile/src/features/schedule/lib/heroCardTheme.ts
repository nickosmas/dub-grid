import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleEntryAbsenceTypeId } from "./schedule";
import { getLocalDateTimeMinutes } from "./scheduleScreenHelpers";

/**
 * The look of the schedule hero card, shared by the Home hero and the shift
 * detail card so the two read as the same surface rather than a rich card and
 * a plain one.
 */
export const HERO_CARD_BACKGROUND_LIGHT = "#2946C7";
export const HERO_CARD_BACKGROUND_DARK = "#152238";
export const HERO_COLLABORATOR_BACKGROUND_LIGHT = "#3A55CB";
export const HERO_COLLABORATOR_BACKGROUND_DARK = "#1E2F66";
// Matches the web hero gradient: dark bottom-left to light top-right. The
// dark-mode variant keeps the same dark navy start but ends in the app's
// own vivid dark-mode brand blue instead of a pale periwinkle, which would
// read as a washed-out pastel blob against a near-black page.
export const HERO_CARD_GRADIENT_LIGHT = ["#142579", "#2C49CC", "#6E90FF"] as const;
export const HERO_CARD_GRADIENT_DARK = ["#0A1442", "#1D3AA0", "#2075FF"] as const;
export const HERO_CARD_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;
export const HERO_CARD_GRADIENT_START = { x: 0, y: 1 } as const;
export const HERO_CARD_GRADIENT_END = { x: 1, y: 0 } as const;
export const HERO_CARD_SHADOW_LIGHT = "rgba(37, 99, 235, 0.3)";
export const HERO_CARD_SHADOW_DARK = "rgba(32, 117, 255, 0.28)";
/**
 * Foreground colour for icons on the hero gradient, which cannot take one
 * from the theme's surface-relative tokens.
 */
export const HERO_ICON_COLOR = "rgba(255, 255, 255, 0.82)";

/**
 * The state a single shift is in relative to now. `active`, `upcoming`, `away`
 * and `scheduled` mirror the Home hero's own statuses; `completed` is extra,
 * because the detail screen can be opened on a shift that has already ended
 * and "Scheduled" would be a lie there.
 */
export type ShiftHeroStatus = "active" | "upcoming" | "completed" | "away" | "scheduled";

const STATUS_LABELS: Record<ShiftHeroStatus, string> = {
  active: "On Duty",
  upcoming: "Upcoming",
  completed: "Completed",
  away: "Away",
  scheduled: "Scheduled",
};

export function getShiftHeroStatusLabel(status: ShiftHeroStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Which status a shift-detail entry is in, from its own times rather than from
 * the Home screen's day-by-day pass over the week. An end time at or before the
 * start time is an overnight shift and rolls into the next day.
 */
export function getShiftHeroStatus(input: {
  entry: MobileScheduleEntry | null;
  startTime: string | null;
  endTime: string | null;
  currentDate: string;
  currentTime: string;
}): ShiftHeroStatus {
  const { entry, startTime, endTime, currentDate, currentTime } = input;

  if (!entry) {
    return "scheduled";
  }

  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return "away";
  }

  const currentMinutes = getLocalDateTimeMinutes(currentDate, currentTime);

  if (currentMinutes == null) {
    return "scheduled";
  }

  if (!startTime) {
    // No times to compare, so the date is all there is to go on.
    if (entry.date > currentDate) return "upcoming";
    if (entry.date < currentDate) return "completed";
    return "scheduled";
  }

  const startMinutes = getLocalDateTimeMinutes(entry.date, startTime);

  if (startMinutes == null) {
    return "scheduled";
  }

  if (currentMinutes < startMinutes) {
    return "upcoming";
  }

  if (!endTime) {
    return entry.date < currentDate ? "completed" : "active";
  }

  const rawEndMinutes = getLocalDateTimeMinutes(entry.date, endTime);

  if (rawEndMinutes == null) {
    return "scheduled";
  }

  const endMinutes = rawEndMinutes <= startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes;

  return currentMinutes < endMinutes ? "active" : "completed";
}

/**
 * The Home hero's timing helper only understands its own four statuses, so
 * `completed` maps onto the one it treats as "nothing to count down".
 */
export function toHeroTimingStatus(
  status: ShiftHeroStatus,
): "active" | "upcoming" | "scheduled" | "away" | "empty" {
  return status === "completed" ? "empty" : status;
}
