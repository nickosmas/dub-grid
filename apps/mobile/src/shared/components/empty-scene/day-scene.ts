import { EMPTY_SCENES, type EmptySceneShape } from "./scenes";

/** The day a day scene names on its tile: "TUE" and 3. */
export type EmptySceneDay = {
  weekday: string;
  date: number;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** The tile's day for an ISO date (`2026-11-03`), read without a time zone shift. */
export function emptySceneDayFromIso(isoDate: string): EmptySceneDay {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { weekday: WEEKDAYS[weekday], date: day };
}

/**
 * The empty day scene with the day it stands for on its tile. The canvas drew
 * a sample date; the shown day must be the one the screen is on, or the
 * picture contradicts the title under it.
 */
export function daySceneShapes(day: EmptySceneDay): EmptySceneShape[] {
  return [
    ...EMPTY_SCENES["team-day-empty"],
    { shape: "text", x: 46, y: 48, fill: "ground", size: 15, text: day.weekday },
    { shape: "text", x: 46, y: 100, fill: "ground", size: 46, text: String(day.date) },
  ];
}
