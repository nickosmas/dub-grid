import { useEffect, useRef, useState } from "react";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { MobileStepUpSheet } from "../components/MobileStepUpSheet";
import {
  confirmMobileStepUp,
  getMobileStepUpContextKey,
  getMobileStepUpMethod,
  readMobileStepUpContext,
  type MobileStepUpMethod,
} from "../lib/step-up";

type Action = (accessToken: string) => Promise<unknown>;

interface PendingAction {
  context: string;
  action: Action;
  resolve: (completed: boolean) => void;
  reject: (error: unknown) => void;
}

/** Retry only an explicit server denial, never an ambiguous failed mutation. */
export function useMobileStepUpAction() {
  const { accessToken: renderedAccessToken } = useSessionState();
  const pending = useRef<PendingAction | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const [method, setMethod] = useState<MobileStepUpMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);

  useEffect(() => {
    const request = pending.current;
    if (!request || !renderedAccessToken) return;
    try {
      if (getMobileStepUpContextKey(renderedAccessToken) !== request.context) {
        request.resolve(false);
      }
    } catch {
      request.resolve(false);
    }
  }, [renderedAccessToken]);

  async function run(action: Action): Promise<boolean> {
    if (running.current || !mounted.current) return false;
    running.current = true;
    try {
      const context = await readMobileStepUpContext();
      if (!mounted.current) return false;
      try {
        await action(context.accessToken);
        return true;
      } catch (failure) {
        const required = getMobileStepUpMethod(failure);
        if (!required) throw failure;
        if (!mounted.current) return false;
        setError(null);
        setMethod(required);
        return await new Promise<boolean>((resolve, reject) => {
          pending.current = {
            context: context.key,
            action,
            resolve,
            reject,
          };
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
      const context = await readMobileStepUpContext();
      if (context.key !== request.context) {
        request.resolve(false);
        return;
      }
      if (pending.current !== request) return;
      accessToken = await confirmMobileStepUp(method, credential, context.accessToken);
      if (pending.current !== request) return;
      if (getMobileStepUpContextKey(accessToken) !== request.context) {
        request.resolve(false);
        return;
      }
    } catch (failure) {
      if (pending.current !== request) return;
      const required = getMobileStepUpMethod(failure);
      if (required) setMethod(required);
      setError("We couldn't confirm your identity. Check your details and try again.");
      return;
    }

    try {
      await request.action(accessToken);
      request.resolve(true);
    } catch (failure) {
      if (pending.current !== request) return;
      const required = getMobileStepUpMethod(failure);
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
    active: method !== null,
    sheet: method ? (
      <MobileStepUpSheet
        key={method}
        error={error}
        method={method}
        onCancel={() => pending.current?.resolve(false)}
        onConfirm={confirm}
      />
    ) : null,
  };
}
