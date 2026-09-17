import type { DashboardCardTone } from "../components/DashboardCard";
import type { MobileColors } from "../../../shared/theme/tokens";

// Same thresholds as web's CoverageBySectionCard
// (apps/web/src/components/dashboard/CoverageBySectionCard.tsx). Shared by the
// hero meter and the per-section rows so one number reads one colour.
export function coverageColor(mobileColors: MobileColors, pct: number): string {
  if (pct >= 90) return mobileColors.success;
  if (pct >= 70) return mobileColors.warning;
  return mobileColors.danger;
}

/** The same thresholds as a card tone: amber when close, red when behind, plain when fine. */
export function coverageToneForPct(pct: number | null): DashboardCardTone {
  if (pct == null) return "neutral";
  if (pct >= 90) return "neutral";
  if (pct >= 70) return "warning";
  return "danger";
}

/** A list of sections reads by its weakest one. */
export function coverageTone(sections: ReadonlyArray<{ pct: number }>): DashboardCardTone {
  if (sections.length === 0) return "neutral";
  return coverageToneForPct(Math.min(...sections.map((section) => section.pct)));
}
