import type { ComponentPropsWithoutRef, ReactNode } from "react";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export type ShiftKind = "day" | "evening" | "night";

const SHIFT_LABEL: Record<ShiftKind, string> = {
  day: "Day",
  evening: "Evening",
  night: "Night",
};

const PATTERN_KIND: Record<string, ShiftKind> = { D: "day", E: "evening", N: "night" };

/** Reads a row pattern such as "DD-ED": D, E and N are shifts, anything else is a day off. */
export function parseWeekPattern(pattern: string): (ShiftKind | null)[] {
  return [...pattern].map((letter) => PATTERN_KIND[letter] ?? null);
}

export function ShiftChip({
  kind,
  className = "",
  ...rest
}: { kind: ShiftKind } & ComponentPropsWithoutRef<"span">) {
  return (
    <span className={`landing-chip landing-chip-${kind} ${className}`} {...rest}>
      {SHIFT_LABEL[kind]}
    </span>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return <span className="landing-avatar">{initials}</span>;
}

export function GridHeaderRow() {
  return (
    <>
      <div className="landing-grid-cell" />
      {WEEKDAYS.map((day) => (
        <div key={day} className="landing-grid-cell landing-grid-day">
          {day}
        </div>
      ))}
    </>
  );
}

export function PersonNameCell({ initials, name }: { initials: string; name: string }) {
  return (
    <div className="landing-grid-cell landing-grid-person">
      <Avatar initials={initials} />
      <span>{name}</span>
    </div>
  );
}

export function GridCell({ children }: { children?: ReactNode }) {
  return <div className="landing-grid-cell">{children}</div>;
}
