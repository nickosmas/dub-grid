/**
 * Bounds how long a dependency may hold a request.
 *
 * A promise that never settles is worse than one that rejects: a rejected call
 * takes an error path someone wrote, while a hung one takes no path at all.
 * That is how a button ends up spinning forever — nothing failed, so nothing
 * recovered.
 *
 * Every network call on a user-facing path should be wrapped in this or carry
 * its own deadline. Redis and Supabase clients do not time out by default.
 */

/** Thrown when `withTimeout` is used without a fallback and the deadline passes. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Resolves with `fallback` if `work` hasn't settled within `ms`.
 *
 * Use this where a missing answer is a valid one — a cache read, an optional
 * enrichment — so a slow dependency degrades into a miss rather than a stall.
 * The underlying promise is abandoned, not cancelled; it may still settle
 * later, so it must not have side effects the caller depends on.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Rejects with `TimeoutError` if `work` hasn't settled within `ms`.
 *
 * For calls where there is no sensible fallback and the caller needs to decide
 * — so the failure reaches an error path instead of hanging.
 */
export async function withTimeoutOrThrow<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
