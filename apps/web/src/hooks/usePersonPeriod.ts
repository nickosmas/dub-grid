"use client";

import { useCallback, useState } from "react";
import type { PeriodRange } from "@/lib/period-presets";
import {
  localIsoToday,
  personPeriod,
  stepPersonPeriod,
  type PersonPeriod,
  type PersonPeriodSpan,
} from "@/lib/person-period";

interface PersonPeriodState {
  span: PersonPeriodSpan;
  period: PersonPeriod;
}

/**
 * The period a person's page follows. It opens on the current month every
 * time; Week, Pay period and Year change what the arrows step by.
 */
export function usePersonPeriod(payPeriodStartDate?: string | null): {
  span: PersonPeriodSpan;
  period: PersonPeriod;
  today: string;
  setSpan: (span: PersonPeriodSpan) => void;
  step: (step: -1 | 1) => void;
  goToToday: () => void;
  goToMonthOf: (date: string) => void;
  setCustomRange: (range: PeriodRange) => void;
} {
  const [today] = useState(() => localIsoToday());
  const [state, setState] = useState<PersonPeriodState>(() => ({
    span: "month",
    period: personPeriod("month", today),
  }));

  // A new span holds today while the period on screen does, else where it starts.
  const setSpan = useCallback(
    (span: PersonPeriodSpan) =>
      setState(({ period }) => {
        const { startDate, endDate } = period.range;
        const anchor = startDate <= today && today <= endDate ? today : startDate;
        return { span, period: personPeriod(span, anchor, payPeriodStartDate) };
      }),
    [payPeriodStartDate, today],
  );
  const step = useCallback(
    (direction: -1 | 1) =>
      setState(({ span, period }) => ({
        span,
        period: stepPersonPeriod(period, direction, { span, payPeriodStartDate }),
      })),
    [payPeriodStartDate],
  );
  const goToToday = useCallback(
    () => setState(({ span }) => ({ span, period: personPeriod(span, today, payPeriodStartDate) })),
    [payPeriodStartDate, today],
  );
  const goToMonthOf = useCallback(
    (date: string) => setState({ span: "month", period: personPeriod("month", date) }),
    [],
  );
  const setCustomRange = useCallback(
    (range: PeriodRange) => setState(({ span }) => ({ span, period: { kind: "custom", range } })),
    [],
  );

  return { ...state, today, setSpan, step, goToToday, goToMonthOf, setCustomRange };
}
