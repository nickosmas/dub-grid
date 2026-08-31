/**
 * Map over items in capped-concurrency batches, preserving input order.
 *
 * Bounds the simultaneous request burst when each item needs its own upstream
 * round-trip (for example one Auth admin lookup per organization member), so a
 * large organization cannot open an unbounded number of connections at once.
 */
export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("Batch size must be a positive integer");
  }

  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(task))));
  }
  return results;
}
