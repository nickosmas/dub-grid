import { useEffect, useRef } from "react";

/**
 * Test shim for `@react-navigation/native`.
 *
 * The real `usePreventRemove` calls `useNavigation`, `useRoute` and
 * `usePreventRemoveContext`, all three of which throw "Couldn't find … context"
 * outside a `NavigationContainer` — so a screen importing it would crash every
 * one of its existing tests.
 *
 * It keeps a real registry rather than no-oping. A shim that swallowed the back
 * press would let a broken guard pass its own tests, which is worse than the
 * crash it replaces: the guard would be silently disabled everywhere.
 *
 * Allowlist, like the reanimated stub: an export this file lacks is `undefined`
 * at import time wherever it is reached, not an error.
 */

export type NavigationAction = {
  type: string;
  payload?: Record<string, unknown>;
  source?: string;
  target?: string;
};

type PreventRemoveEntry = {
  preventRemove: boolean;
  callback: (options: { data: { action: NavigationAction } }) => void;
};

/** Mounted guards, innermost last — the order react-navigation resolves in. */
const entries: PreventRemoveEntry[] = [];

/** Every action that got past the guards, in order, for assertions. */
export const navigatedActions: NavigationAction[] = [];

export const GO_BACK: NavigationAction = { type: "GO_BACK" };

/**
 * One removal attempt.
 *
 * `navigation.dispatch` runs through here as well as `pressBack`, on purpose: a
 * guard that dispatches its captured action while it is still preventing
 * removal gets that action swallowed here exactly as the real `beforeRemove`
 * listener would swallow it. The bug then shows up as a failing test rather
 * than as a screen that silently refuses to pop on device.
 */
function attemptRemoval(action: NavigationAction): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.preventRemove) {
      entry.callback({ data: { action } });
      return true;
    }
  }
  navigatedActions.push(action);
  return false;
}

/**
 * Fire one back press. The header button, Android hardware back and the iOS
 * back swipe all reach JS as the same dispatched pop, so one helper covers all
 * three. Returns true when a guard prevented it. Call inside `act()` so the
 * guard's effects flush.
 */
export function pressBack(action: NavigationAction = GO_BACK): boolean {
  return attemptRemoval(action);
}

/** `beforeEach`: the registry and the log outlive a single test in a file. */
export function resetNavigationShim(): void {
  entries.length = 0;
  navigatedActions.length = 0;
}

const navigation = {
  dispatch: (action: NavigationAction) => {
    attemptRemoval(action);
  },
  goBack: () => {
    attemptRemoval(GO_BACK);
  },
  addListener: () => () => undefined,
  setOptions: () => undefined,
  navigate: () => undefined,
  isFocused: () => true,
  canGoBack: () => true,
};

export function useNavigation() {
  return navigation;
}

export function useRoute() {
  return { key: "test-route", name: "test", params: {} };
}

export function usePreventRemove(
  preventRemove: boolean,
  callback: (options: { data: { action: NavigationAction } }) => void,
): void {
  // Latest values in a stable box, as the real hook does via
  // use-latest-callback: registration must not churn every render, and the
  // callback must not go stale.
  const entry = useRef<PreventRemoveEntry>({ preventRemove, callback });
  entry.current.preventRemove = preventRemove;
  entry.current.callback = callback;

  useEffect(() => {
    const current = entry.current;
    entries.push(current);

    return () => {
      const index = entries.indexOf(current);
      if (index >= 0) entries.splice(index, 1);
    };
  }, []);
}
