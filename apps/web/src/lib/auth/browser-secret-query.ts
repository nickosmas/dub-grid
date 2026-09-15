export function scrubBrowserSecretQuery(keys: readonly string[]): Record<string, string | null> {
  if (typeof window === "undefined") return {};

  const url = new URL(window.location.href);
  const captured: Record<string, string | null> = {};
  let changed = false;

  for (const key of keys) {
    captured[key] = url.searchParams.get(key);
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (changed) {
    const safeUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", safeUrl);
  }

  return captured;
}
