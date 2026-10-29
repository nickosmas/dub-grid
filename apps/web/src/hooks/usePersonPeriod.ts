"use client";

import { useCallback, useMemo, useState } from "react";
import type { PeriodRange } from "@/lib/period-presets";
import {
  PERSON_PERIOD_STORAGE_KEY,
  parseStoredPeriod,
  resolvePersonPeriod,
  serializeStoredPeriod,
  type PersonPeriod,
  type PersonPeriodPreset,
  type StoredPersonPeriod,
} from "@/lib/person-period";

function readStored(): StoredPersonPeriod {
  if (typeof window === "undefined") return parseStoredPeriod(null);
  try {
    return parseStoredPeriod(window.localStorage.getItem(PERSON_PERIOD_STORAGE_KEY));
  } catch {
    return parseStoredPeriod(null);
  }
}

function writeStored(stored: StoredPersonPeriod) {
  try {
    window.localStorage.setItem(PERSON_PERIOD_STORAGE_KEY, serializeStoredPeriod(stored));
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit.
  }
}

/**
 * The staff page's period, remembered by this browser. Choosing Custom keeps
 * the last dates until new ones are picked.
 */
export function usePersonPeriod(payPeriodStartDate: string | null | undefined): {
  period: PersonPeriod;
  setPreset: (preset: PersonPeriodPreset) => void;
  setCustomRange: (range: PeriodRange) => void;
} {
  const [stored, setStored] = useState(readStored);

  const update = useCallback((next: StoredPersonPeriod) => {
    setStored(next);
    writeStored(next);
  }, []);

  // Custom starts from the dates on screen, so picking it never jumps back to
  // the current week before any dates are chosen.
  const setPreset = useCallback(
    (preset: PersonPeriodPreset) => {
      setStored((current) => {
        const range =
          preset === "custom" && !current.range
            ? resolvePersonPeriod(current, payPeriodStartDate).range
            : current.range;
        const next = { preset, range };
        writeStored(next);
        return next;
      });
    },
    [payPeriodStartDate],
  );

  const setCustomRange = useCallback(
    (range: PeriodRange) => update({ preset: "custom", range }),
    [update],
  );

  const period = useMemo(
    () => resolvePersonPeriod(stored, payPeriodStartDate),
    [stored, payPeriodStartDate],
  );

  return { period, setPreset, setCustomRange };
}
