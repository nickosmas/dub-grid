import { NavigatorLockAcquireTimeoutError, navigatorLock } from "@supabase/supabase-js";

type Outcome<R> = { ok: true; value: R } | { ok: false; error: unknown };

async function settle<R>(fn: () => Promise<R>): Promise<Outcome<R>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function unwrap<R>(outcome: Outcome<R>): R {
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/**
 * auth-js's Web Locks lock, except that nothing is thrown inside the lock's
 * callback. Firefox (from 159) reports an error thrown there as uncaught even
 * when the awaiting code catches it, so every auto-refresh tick that found the
 * lock taken, which auth-js skips on purpose, surfaced as a page error.
 */
export async function authNavigatorLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const locks = globalThis.navigator?.locks;
  if (acquireTimeout !== 0 || typeof locks?.request !== "function") {
    return unwrap(await navigatorLock(name, acquireTimeout, () => settle(fn)));
  }
  const outcome = await locks.request(
    name,
    { mode: "exclusive", ifAvailable: true },
    async (lock): Promise<Outcome<R> | null> => (lock ? settle(fn) : null),
  );
  if (!outcome) {
    throw new NavigatorLockAcquireTimeoutError(
      `Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`,
    );
  }
  return unwrap(outcome);
}
