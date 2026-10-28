import { useCallback, useRef, useState } from "react";
import {
  describeFocusAreaShiftsQuestion,
  type FocusAreaShiftsDecision,
  type FocusAreaUpcomingShifts,
} from "@dubgrid/domain";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { parseFocusAreaShiftsRefusal } from "../lib/api";

/** The manager closed the question about their shifts, so nothing was saved. */
export class FocusAreaShiftsCancelledError extends Error {
  constructor() {
    super("The save was cancelled.");
    this.name = "FocusAreaShiftsCancelledError";
  }
}

interface Pending {
  personName: string;
  areas: FocusAreaUpcomingShifts[];
  self: boolean;
}

export interface SaveAskingOptions {
  /** Words the question for the manager's own record. */
  self?: boolean;
  /** Runs just before the question opens, to close anything it would stack on. */
  beforeAsk?: () => void;
}

/**
 * Runs a person save and, when the server asks what to do with their
 * upcoming shifts in focus areas they come off (51i), asks and sends it again
 * with the answer. Render `modal` beside the form.
 */
export function useFocusAreaShiftsQuestion() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((decision: FocusAreaShiftsDecision | null) => void) | null>(null);

  const answer = useCallback((decision: FocusAreaShiftsDecision | null) => {
    resolver.current?.(decision);
    resolver.current = null;
    setPending(null);
  }, []);

  const saveAsking = useCallback(
    async <T,>(
      personName: string,
      save: (decision?: FocusAreaShiftsDecision) => Promise<T>,
      { self = false, beforeAsk }: SaveAskingOptions = {},
    ): Promise<T> => {
      try {
        return await save();
      } catch (error) {
        const areas = parseFocusAreaShiftsRefusal(error);
        if (!areas) throw error;
        beforeAsk?.();
        const decision = await new Promise<FocusAreaShiftsDecision | null>((resolve) => {
          resolver.current?.(null);
          resolver.current = resolve;
          setPending({ personName, areas, self });
        });
        if (!decision) throw new FocusAreaShiftsCancelledError();
        return save(decision);
      }
    },
    [],
  );

  const question = pending
    ? describeFocusAreaShiftsQuestion(pending.personName, pending.areas, { self: pending.self })
    : null;
  const modal = question ? (
    <ConfirmationModal
      body={question.message}
      confirmLabel={question.clearLabel}
      confirmTone="warning"
      onCancel={() => answer(null)}
      onConfirm={() => answer("clear")}
      secondaryAction={{ label: question.keepLabel, onPress: () => answer("keep") }}
      summary={{ points: question.points }}
      title={question.title}
      visible
    />
  ) : null;

  return { saveAsking, modal };
}
