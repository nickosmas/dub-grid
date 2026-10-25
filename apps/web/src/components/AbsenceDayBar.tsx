import { formatShiftChangeHours } from "@dubgrid/schedule-core";
import type { AbsenceStripeFill } from "@/lib/absence-stripes";
import { clockSpanMinutes, type ClockRange } from "./absence-span";
import { fmt12h } from "./shiftEditTime";

export interface AbsenceDayBarPart extends ClockRange {
  kind: "work" | "absence";
}

const DAY = 1440;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The day beside an absence (item 50c): the time worked and the absence in
 * time order, labelled in that order, with the times where they meet.
 */
export function AbsenceDayBar({
  parts,
  absenceName,
  absenceColors,
}: {
  parts: AbsenceDayBarPart[];
  absenceName: string;
  absenceColors: Pick<AbsenceStripeFill, "background" | "border" | "text">;
}) {
  if (parts.length === 0) return null;
  const base = minutesOf(parts[0].start);
  let cursor = 0;
  const placed = parts.map((part) => {
    let from = (minutesOf(part.start) - base + DAY) % DAY;
    while (from < cursor) from += DAY;
    const to = from + clockSpanMinutes(part);
    cursor = to;
    return { ...part, from, to };
  });
  const total = cursor;
  const workedMinutes = placed
    .filter((part) => part.kind === "work")
    .reduce((sum, part) => sum + part.to - part.from, 0);
  const labels = placed
    .map((part) => part.kind)
    .filter((kind, index, kinds) => index === 0 || kinds[index - 1] !== kind)
    .map((kind) =>
      kind === "work" ? `${formatShiftChangeHours(workedMinutes)} worked` : absenceName,
    );
  const ticks = placed
    .flatMap((part) => [
      { at: part.from, time: part.start },
      { at: part.to, time: part.end },
    ])
    .filter((tick, index, all) => all.findIndex((other) => other.at === tick.at) === index);
  const description = placed
    .map(
      (part) =>
        `${part.kind === "work" ? "Worked" : absenceName} ${fmt12h(part.start)} to ${fmt12h(part.end)}`,
    )
    .join(", ");

  return (
    <div data-absence-day-bar className="flex flex-col gap-1.5 pt-1">
      <div className="flex justify-between gap-2 text-[length:var(--dg-fs-micro)] font-semibold">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="dg-tabular-nums truncate"
            style={{ color: label === absenceName ? absenceColors.text : "var(--dg-color-brand)" }}
          >
            {label}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={description}
        className="relative h-3.5 overflow-hidden rounded-[4px] border border-border bg-bg-secondary"
      >
        {placed.map((part, index) => (
          <span
            key={`${part.kind}-${index}`}
            className="absolute inset-y-0"
            style={{
              left: `${(part.from / total) * 100}%`,
              width: `${((part.to - part.from) / total) * 100}%`,
              background: part.kind === "work" ? "var(--dg-color-brand)" : absenceColors.background,
              boxShadow: index > 0 ? "inset 1px 0 0 var(--dg-color-surface)" : undefined,
            }}
          />
        ))}
      </div>
      <div className="relative h-4 text-[length:var(--dg-fs-micro)] text-text-muted dg-tabular-nums">
        {ticks.map((tick, index) => {
          const edge = index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle";
          return (
            <span
              key={tick.at}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${(tick.at / total) * 100}%`,
                transform:
                  edge === "start"
                    ? undefined
                    : edge === "end"
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {fmt12h(tick.time)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
