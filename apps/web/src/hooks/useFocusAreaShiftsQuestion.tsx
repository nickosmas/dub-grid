"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  describeFocusAreaShiftsQuestion,
  type FocusAreaShiftsDecision,
  type FocusAreaUpcomingShifts,
} from "@dubgrid/domain";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { UpdateEmployeeOptions } from "@/features/employees/client/api";

interface Pending {
  personName: string;
  areas: FocusAreaUpcomingShifts[];
}

/**
 * Asks, during a save that takes someone off focus areas holding their
 * upcoming shifts, whether to clear or keep those shifts (51i). Pass
 * `optionsFor(name)` to `updateEmployee` and render `dialog`.
 */
export function useFocusAreaShiftsQuestion() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((decision: FocusAreaShiftsDecision | null) => void) | null>(null);

  const optionsFor = useCallback(
    (personName: string): UpdateEmployeeOptions => ({
      askFocusAreaShifts: (areas) =>
        new Promise((resolve) => {
          resolver.current?.(null);
          resolver.current = resolve;
          setPending({ personName, areas });
        }),
      onFocusAreaShiftsNotCleared: (message) => toast.error(message),
    }),
    [],
  );

  const answer = (decision: FocusAreaShiftsDecision | null) => {
    resolver.current?.(decision);
    resolver.current = null;
    setPending(null);
  };

  let dialog: React.ReactNode = null;
  if (pending) {
    const question = describeFocusAreaShiftsQuestion(pending.personName, pending.areas);
    dialog = (
      <ConfirmDialog
        title={question.title}
        message={question.message}
        summary={{ points: question.points }}
        confirmLabel={question.clearLabel}
        secondaryConfirmLabel={question.keepLabel}
        secondaryConfirmTone="neutral"
        variant="warning"
        maxWidth={460}
        onConfirm={() => answer("clear")}
        onSecondaryConfirm={() => answer("keep")}
        onCancel={() => answer(null)}
      />
    );
  }

  return { dialog, optionsFor };
}
