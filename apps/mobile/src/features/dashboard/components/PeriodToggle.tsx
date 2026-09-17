import { SegmentedControl } from "../../../shared/components/SegmentedControl";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";

const OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "2weeks", label: "2 Weeks" },
] as const satisfies ReadonlyArray<{ value: DashboardPeriodMode; label: string }>;

/**
 * Kept as a named component rather than inlining `SegmentedControl` at the call
 * site: the period options are dashboard domain knowledge, and the hero card
 * shouldn't have to know them.
 */
export function PeriodToggle({
  mode,
  onChange,
}: {
  mode: DashboardPeriodMode;
  onChange: (mode: DashboardPeriodMode) => void;
}) {
  // Never disabled while a period loads: the cards dim to say so, and a
  // second tap simply moves the query on. Locking the control read as a hang.
  return (
    <SegmentedControl
      accessibilityLabel="Dashboard period"
      onChange={onChange}
      options={OPTIONS}
      size="sm"
      value={mode}
    />
  );
}
