"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useLatestRef } from "./useLatestRef";

/**
 * Runs an action at most once at a time, so a double-press can't execute it
 * twice.
 *
 * The latch is a ref, not the `isRunning` state, and that distinction is the
 * whole point: a `useState` busy flag only reaches the DOM after React
 * re-renders, and a second click can land inside that window and pass a
 * `disabled` check that has not been applied yet. Reading and setting a ref
 * happens synchronously inside the first handler call, so the second call is
 * already too late. `isRunning` exists only to drive the spinner.
 *
 * A synchronous action returns `undefined`, which returns early without
 * touching state: wrapping a plain click handler is a no-op, which is what
 * makes this safe to build into shared primitives whose callers pass both.
 */
export function useAsyncAction<A extends unknown[]>(
  action: (...args: A) => void | Promise<unknown>,
) {
  const [isRunning, setIsRunning] = useState(false);
  const inFlight = useRef(false);
  const actionRef = useLatestRef(action);

  // A promise can settle after the surface that started it has gone (a dialog
  // that closes on success), and setting state on an unmounted tree is noise.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    (...args: A) => {
      if (inFlight.current) return;

      const result = actionRef.current(...args);
      if (!(result instanceof Promise)) return;

      inFlight.current = true;
      setIsRunning(true);

      const settle = () => {
        inFlight.current = false;
        if (mounted.current) setIsRunning(false);
      };

      void result.then(settle, (error: unknown) => {
        settle();
        // Logged rather than swallowed: the latch must not become an error
        // sink. Handlers here catch their own failures and surface a message,
        // so this only fires for a genuinely uncaught one, which before this
        // hook wrapped it landed in the browser console as an unhandled
        // rejection. Same console, same stack; rethrowing instead would just
        // move the unhandled rejection onto a promise nobody can catch.
        console.error("An async action failed:", error);
      });
    },
    [actionRef],
  );

  return { run, isRunning };
}
