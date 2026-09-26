"use client";

import { useEffect, useRef, useState } from "react";
import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import {
  confirmBrowserStepUp,
  getStepUpMethod,
  readStepUpContext,
  type StepUpMethod,
} from "@/features/account/client/step-up";

type Action = (accessToken: string) => Promise<unknown>;
export type StepUpRun = (action: Action) => Promise<boolean>;
interface PendingAction {
  context: string;
  action: Action;
  resolve: (completed: boolean) => void;
  reject: (error: unknown) => void;
}

/** Retry only an explicit server denial, never an ambiguous failed mutation. */
export function useStepUpAction() {
  const pending = useRef<PendingAction | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const [method, setMethod] = useState<StepUpMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);

  async function run(action: Action): Promise<boolean> {
    if (running.current || !mounted.current) return false;
    running.current = true;
    try {
      const context = await settleWithRequestTimeout(readStepUpContext());
      if (!mounted.current) return false;
      try {
        await action(context.accessToken);
        return true;
      } catch (failure) {
        const required = getStepUpMethod(failure);
        if (!required) throw failure;
        if (!mounted.current) return false;
        setError(null);
        setMethod(required);
        return await new Promise<boolean>((resolve, reject) => {
          pending.current = { context: context.key, action, resolve, reject };
        });
      }
    } finally {
      pending.current = null;
      running.current = false;
      if (mounted.current) setMethod(null);
    }
  }

  async function confirm(credential: string) {
    const request = pending.current;
    if (!request || !method) return;
    setError(null);
    let accessToken: string;
    try {
      if ((await settleWithRequestTimeout(readStepUpContext())).key !== request.context) {
        request.reject(new Error("Your account or organization changed. Try the action again."));
        return;
      }
      if (pending.current !== request) return;
      accessToken = await settleWithRequestTimeout(confirmBrowserStepUp(method, credential));
      if (pending.current !== request) return;
      if ((await settleWithRequestTimeout(readStepUpContext())).key !== request.context) {
        request.reject(new Error("Your account or organization changed. Try the action again."));
        return;
      }
    } catch (failure) {
      if (pending.current !== request) return;
      const required = getStepUpMethod(failure);
      if (required) setMethod(required);
      setError("We couldn't confirm your identity. Check your details and try again.");
      return;
    }
    if (pending.current !== request) return;
    try {
      await request.action(accessToken);
      request.resolve(true);
    } catch (failure) {
      if (pending.current !== request) return;
      const required = getStepUpMethod(failure);
      if (required) {
        setMethod(required);
        setError("Your identity confirmation expired or changed. Confirm again to continue.");
      } else {
        request.reject(failure);
      }
    }
  }

  return {
    run,
    dialog: method ? (
      <StepUpDialog
        key={method}
        method={method}
        error={error}
        onConfirm={confirm}
        onCancel={() => pending.current?.resolve(false)}
      />
    ) : null,
  };
}
