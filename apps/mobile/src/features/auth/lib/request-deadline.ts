export const MOBILE_AUTH_ACTION_TIMEOUT_MS = 15_000;

export class MobileAuthActionTimeoutError extends Error {
  constructor(timeoutMs: number = MOBILE_AUTH_ACTION_TIMEOUT_MS) {
    super(`Authentication action exceeded ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Bound a provider promise that does not accept an AbortSignal. Callers must
 * ignore late settlement and must never automatically replay the mutation.
 */
export async function settleMobileAuthAction<T>(
  request: PromiseLike<T>,
  timeoutMs: number = MOBILE_AUTH_ACTION_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new MobileAuthActionTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(request), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
