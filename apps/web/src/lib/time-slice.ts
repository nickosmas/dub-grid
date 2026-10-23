/**
 * A pause for long work on the main thread: it resolves at once until the
 * current slice has run `budgetMs`, then waits a task so the page can draw
 * and respond, and starts a new slice.
 */
export function createTimeSlicer(budgetMs: number, now: () => number = () => performance.now()) {
  let sliceStart = now();
  return async (): Promise<void> => {
    if (now() - sliceStart < budgetMs) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    sliceStart = now();
  };
}
