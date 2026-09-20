import { useWindowDimensions } from "react-native";
import { SegmentedControl } from "../../../shared/components/SegmentedControl";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";

const OPTIONS = [
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
  // A compact pill at the default size; once text is scaled up the labels
  // no longer fit it and truncated to their first letter, so the control
  // takes the row instead.
  const { fontScale } = useWindowDimensions();
  // Never disabled while a period loads: the cards dim to say so, and a
  // second tap simply moves the query on. Locking the control read as a hang.
  return (
    <SegmentedControl
      accessibilityLabel="Dashboard period"
      onChange={onChange}
      options={OPTIONS}
      size="sm"
      stretch={fontScale > 1}
      // On the coverage wash a grey track read as a patch; the theme's own
      // ground (white or black) sits cleanly on it.
      track="background"
      value={mode}
    />
  );
}
