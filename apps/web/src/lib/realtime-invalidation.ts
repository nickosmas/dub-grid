/**
 * De-duplicates a list of React Query keys by structural equality, preserving
 * order. Shared by the realtime-invalidation hooks, whose per-table key maps
 * frequently reference the same key (e.g. the org bootstrap key) more than once.
 */
export function uniqueKeys(keys: readonly (readonly unknown[])[]): readonly unknown[][] {
  const seen = new Set<string>();
  const unique: unknown[][] = [];
  for (const key of keys) {
    const cacheKey = JSON.stringify(key);
    if (seen.has(cacheKey)) continue;
    seen.add(cacheKey);
    unique.push([...key]);
  }
  return unique;
}
