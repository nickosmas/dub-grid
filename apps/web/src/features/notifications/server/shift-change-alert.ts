import {
  formatShiftChangeCompact,
  formatShiftChangePlain,
  type ShiftChange,
} from "@dubgrid/schedule-core";
import type { NotificationEmailDetail } from "@/emails/NotificationEmail";

/** One of a person's days that a publish changed. */
export interface ChangedDay {
  date: string;
  change: ShiftChange;
}

export interface ShiftChangeAlert {
  title: string;
  /** The inbox row and the push body: the compact form, one line per day. */
  message: string;
  metadata: { date: string; dates: string[]; publishHistoryId: string };
  email: { intro: string; details: NotificationEmailDetail[]; closing: string };
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T00:00:00Z`));
}

function listDays(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * One labeled email line per side of a day: "Wed, Oct 22 Before" (or "New"
 * for a day that had nothing) with the
 * shift, or with every item of a multi-item day joined, its total kept in the
 * label.
 */
function emailDetails(day: ChangedDay): NotificationEmailDetail[] {
  const details: NotificationEmailDetail[] = [];
  for (const line of formatShiftChangePlain(day.change)) {
    const heading = /^(Before|After|New)(?: \(([^)]*)\))?:\s*(.*)$/.exec(line);
    if (heading) {
      const [, side, total, rest] = heading;
      details.push({
        label: `${dayLabel(day.date)} ${side}${total ? ` (${total})` : ""}`,
        value: rest ?? "",
      });
      continue;
    }
    const current = details[details.length - 1];
    if (current) current.value = current.value ? `${current.value}; ${line}` : line;
  }
  return details;
}

/**
 * The alert one person gets for one publish (item 46e): every changed day in
 * date order. Without details (item 46f) it names the days only. It never
 * names who published. Null when nothing changed.
 */
export function buildShiftChangeAlert(input: {
  days: ChangedDay[];
  showDetails: boolean;
  publishHistoryId: string;
}): ShiftChangeAlert | null {
  const days = input.days
    .filter((day) => day.change.kind !== "none")
    .sort((left, right) => left.date.localeCompare(right.date));
  if (days.length === 0) return null;

  const labels = days.map((day) => dayLabel(day.date));
  const title =
    days.length === 1
      ? `Your schedule for ${labels[0]} changed`
      : `Your schedule changed on ${days.length} days`;
  const summary =
    days.length === 1
      ? "Open the schedule to see what changed."
      : `On ${listDays(labels)}. Open the schedule to see what changed.`;
  const message = input.showDetails
    ? days
        .map((day, index) => `${labels[index]}: ${formatShiftChangeCompact(day.change)}`)
        .join("\n")
    : summary;

  return {
    title,
    message,
    metadata: {
      date: days[0]!.date,
      dates: days.map((day) => day.date),
      publishHistoryId: input.publishHistoryId,
    },
    email: input.showDetails
      ? {
          intro: "The latest published schedule changed these days for you.",
          details: days.flatMap(emailDetails),
          closing: "Open the schedule in DubGrid to see your whole week.",
        }
      : { intro: summary, details: [], closing: "" },
  };
}
