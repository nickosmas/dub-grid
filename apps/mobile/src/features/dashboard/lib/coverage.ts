import type { MobileColors } from "../../../shared/theme/tokens";

// Same thresholds as web's CoverageBySectionCard
// (apps/web/src/components/dashboard/CoverageBySectionCard.tsx). Shared by the
// hero meter and the per-section rows so one number reads one colour.
export function coverageColor(mobileColors: MobileColors, pct: number): string {
  if (pct >= 90) return mobileColors.success;
  if (pct >= 70) return mobileColors.warning;
  return mobileColors.danger;
}
