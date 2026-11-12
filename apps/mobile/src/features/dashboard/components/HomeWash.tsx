import { useMemo } from "react";
import { PageWash } from "../../../shared/components/PageWash";
import { useIsDarkMode } from "../../../shared/providers/ThemeModeProvider";
import { buildHomeWash } from "../lib/home-wash";

/** The admin Home's wash: the brand aurora, whatever the period's coverage. */
export function HomeWash({ height }: { height: number }) {
  const isDark = useIsDarkMode();
  const colors = useMemo(() => buildHomeWash(isDark), [isDark]);

  return <PageWash colors={colors} height={height} />;
}
