"use client";

import { useCallback, useState } from "react";
import type { PeriodRange } from "@/lib/period-presets";
import {
  localIsoToday,
  monthPeriod,
  stepPersonPeriod,
  type PersonPeriod,
} from "@/lib/person-period";

/** The staff page's period. It opens on the current month every time. */
export function usePersonPeriod(): {
  period: PersonPeriod;
  today: string;
  step: (step: -1 | 1) => void;
  goToToday: () => void;
  goToMonthOf: (date: string) => void;
  setCustomRange: (range: PeriodRange) => void;
} {
  const [today] = useState(() => localIsoToday());
  const [period, setPeriod] = useState<PersonPeriod>(() => monthPeriod(today));

  const step = useCallback(
    (direction: -1 | 1) => setPeriod((current) => stepPersonPeriod(current, direction)),
    [],
  );
  const goToToday = useCallback(() => setPeriod(monthPeriod(today)), [today]);
  const goToMonthOf = useCallback((date: string) => setPeriod(monthPeriod(date)), []);
  const setCustomRange = useCallback(
    (range: PeriodRange) => setPeriod({ kind: "custom", range }),
    [],
  );

  return { period, today, step, goToToday, goToMonthOf, setCustomRange };
}
