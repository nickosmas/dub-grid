import {
  formatCompactRangeLabel,
  isValidCustomRange,
  resolvePeriodPreset,
  type PeriodPreset,
  type PeriodRange,
} from "./period-presets";

export type PersonPeriodPreset = PeriodPreset;

/** The period the staff page's tabs follow (item 55). */
export interface PersonPeriod {
  preset: PersonPeriodPreset;
  range: PeriodRange;
  /** Pay period was chosen but the organization has no pay period start date. */
  payPeriodUnset?: boolean;
}

/** What a viewer's browser keeps: a preset, and the dates only for Custom. */
export interface StoredPersonPeriod {
  preset: PersonPeriodPreset;
  range?: PeriodRange;
}

export const PERSON_PERIOD_PRESETS: readonly PersonPeriodPreset[] = [
  "current-week",
  "pay-period",
  "this-month",
  "last-12-weeks",
  "custom",
];

export const PERSON_PERIOD_STORAGE_KEY = "dg-person-period";

const DEFAULT_STORED: StoredPersonPeriod = { preset: "current-week" };

function isPreset(value: unknown): value is PersonPeriodPreset {
  return typeof value === "string" && (PERSON_PERIOD_PRESETS as readonly string[]).includes(value);
}

function isRange(value: unknown): value is PeriodRange {
  if (!value || typeof value !== "object") return false;
  const { startDate, endDate } = value as Record<string, unknown>;
  return typeof startDate === "string" && typeof endDate === "string";
}

/** Anything missing, malformed, unknown or over the cap reads as Current week. */
export function parseStoredPeriod(raw: string | null | undefined): StoredPersonPeriod {
  if (!raw) return DEFAULT_STORED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_STORED;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_STORED;
  const { preset, range } = parsed as Record<string, unknown>;
  if (!isPreset(preset)) return DEFAULT_STORED;
  if (preset !== "custom") return { preset };
  if (!isRange(range) || !isValidCustomRange(range)) return DEFAULT_STORED;
  return { preset, range: { startDate: range.startDate, endDate: range.endDate } };
}

export function serializeStoredPeriod(stored: StoredPersonPeriod): string {
  return JSON.stringify(
    stored.preset === "custom" && stored.range
      ? { preset: stored.preset, range: stored.range }
      : { preset: stored.preset },
  );
}

/**
 * Today's dates for a stored choice. An unset pay period keeps its preset (so
 * the control can say so) and covers the current week, as Reports does.
 */
export function resolvePersonPeriod(
  stored: StoredPersonPeriod,
  payPeriodStartDate: string | null | undefined,
  now: Date = new Date(),
): PersonPeriod {
  const currentWeek = resolvePeriodPreset("current-week", null, now)!;
  if (stored.preset === "custom") {
    return stored.range
      ? { preset: "custom", range: stored.range }
      : { preset: "current-week", range: currentWeek };
  }
  const range = resolvePeriodPreset(stored.preset, payPeriodStartDate, now);
  if (range) return { preset: stored.preset, range };
  return { preset: stored.preset, range: currentWeek, payPeriodUnset: true };
}

/**
 * The period as a sentence fragment for summaries: "No activity this pay
 * period", "3 events between Sep 1 and Oct 15".
 */
export function formatPersonPeriodPhrase(period: PersonPeriod): string {
  switch (period.preset) {
    case "current-week":
      return "this week";
    case "pay-period":
      return period.payPeriodUnset ? "this week" : "this pay period";
    case "this-month":
      return "this month";
    case "last-12-weeks":
      return "in the last 12 weeks";
    case "custom": {
      const [start, end] = formatCompactRangeLabel(period.range).split(" - ");
      return `between ${start} and ${end}`;
    }
  }
}
