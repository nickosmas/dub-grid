"use client";

import { useRef } from "react";
import { getStepUpMethod } from "@/features/account/client/step-up";
import { useStepUpAction } from "@/hooks/useStepUpAction";

type Action = (accessToken?: string) => Promise<unknown>;

/**
 * Runs an action as it is and asks for fresh proof only when the server
 * refuses it. Refusals that arrive while the prompt is open, as in a bulk
 * action, wait for it and retry with its token, so one confirmation covers
 * the batch. Resolves false when the person cancels.
 */
export function useSharedStepUp() {
  const stepUp = useStepUpAction();
  const prompt = useRef<Promise<string | null> | null>(null);

  async function run(action: Action): Promise<boolean> {
    let required: ReturnType<typeof getStepUpMethod>;
    try {
      await action();
      return true;
    } catch (failure) {
      required = getStepUpMethod(failure);
      if (!required) throw failure;
    }

    if (prompt.current) {
      const token = await prompt.current;
      if (!token) return false;
      await action(token);
      return true;
    }

    let assured: string | null = null;
    // The refusal already happened, so ask at once: each refused row is sent
    // twice (the refusal, then the assured retry), never three times (F-103).
    const current = stepUp
      .prompt(async (token) => {
        await action(token);
        assured = token;
      }, required)
      .then((completed) => (completed ? assured : null))
      .finally(() => {
        if (prompt.current === current) prompt.current = null;
      });
    prompt.current = current;
    return (await current) !== null;
  }

  return { run, dialog: stepUp.dialog };
}
