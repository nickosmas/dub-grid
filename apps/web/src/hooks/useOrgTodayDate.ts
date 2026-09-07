"use client";

import { useEffect, useState } from "react";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";

/**
 * Today's date key in the organization's timezone, so a manager viewing a
 * facility from another zone sees the facility's day.
 *
 * Polls rather than scheduling one timeout at device midnight: the org's
 * midnight lands anywhere in the viewer's day depending on the offset between
 * them. Mirrors the schedule grid's handling of the same problem.
 */
export function useOrgTodayDate(timeZone: string | null): string {
  const [todayDate, setTodayDate] = useState(() => getIsoDateInTimeZone(new Date(), timeZone));

  useEffect(() => {
    setTodayDate(getIsoDateInTimeZone(new Date(), timeZone));

    const interval = window.setInterval(() => {
      const current = getIsoDateInTimeZone(new Date(), timeZone);
      setTodayDate((previous) => (previous === current ? previous : current));
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [timeZone]);

  return todayDate;
}
