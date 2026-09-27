import { useSyncExternalStore } from "react";

/**
 * Marks a credential sign-in whose screen still owns the navigation into the
 * app. `setSession` publishes the new session before it resolves, so without
 * this the launch route and the login screen's redirect would leave the form
 * the moment the token appears, ahead of bootstrap, and the sign-in's own
 * navigation would then land a second time.
 */
let currentOwner: symbol | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Begins a handoff. Only the returned release ends it, so a stale owner cannot end a newer one. */
export function beginSignInHandoff(): () => void {
  const owner = Symbol("sign-in-handoff");
  currentOwner = owner;
  notify();

  return () => {
    if (currentOwner !== owner) return;
    currentOwner = null;
    notify();
  };
}

export function isSignInHandoffPending(): boolean {
  return currentOwner !== null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSignInHandoffPending(): boolean {
  return useSyncExternalStore(subscribe, isSignInHandoffPending, isSignInHandoffPending);
}
