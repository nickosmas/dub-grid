const BOOTSTRAP_CONFIG_QUERIES = 10;

/**
 * A cached configuration bundle as this code wrote it: the organization row,
 * then nine lists, each a query result. Anything else (an older or newer
 * deployment's bundle, a truncated write) is refetched rather than read by
 * position, which would show the wrong list as departments or shift codes.
 */
export function isBootstrapConfigBundle(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== BOOTSTRAP_CONFIG_QUERIES) return false;
  return value.every((result, index) => {
    if (!result || typeof result !== "object") return false;
    const { data, error } = result as { data?: unknown; error?: unknown };
    if (error) return true;
    return index === 0
      ? data !== null && typeof data === "object" && !Array.isArray(data)
      : Array.isArray(data);
  });
}
