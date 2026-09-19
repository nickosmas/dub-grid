import { useMemo } from "react";
import { PageWash } from "../../../shared/components/PageWash";
import { useIsDarkMode } from "../../../shared/providers/ThemeModeProvider";
import { buildCoverageWash } from "../lib/coverage-wash";

/**
 * The dashboard's wash, coloured by the period's coverage: the brand aurora
 * when everything is normal, amber when close, red when behind. Renders
 * nothing when coverage is not configured.
 */
export function CoverageWash({ pct, height }: { pct: number | null; height: number }) {
  const isDark = useIsDarkMode();
  const colors = useMemo(() => buildCoverageWash(pct, isDark), [isDark, pct]);

  if (!colors) return null;

  return <PageWash colors={colors} height={height} />;
}
