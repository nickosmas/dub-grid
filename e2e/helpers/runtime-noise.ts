/**
 * Console/network noise that isn't part of DubGrid's own runtime and is safe
 * for specs asserting "no unexpected console or network failures" to ignore.
 *
 * Vercel Speed Insights only resolves inside a real Vercel edge runtime, so
 * every environment we test in (local, CI) logs a 404 for its script, a
 * blocked-MIME-type execution refusal, and a handful of ERR_SSL_PROTOCOL_ERROR
 * retries for that same request. None of it reflects on the app under test.
 * Kept as one shared list so two spec files don't drift the way
 * auth-release-qualification.spec.ts and auth-session-continuity.spec.ts did
 * before this existed.
 */
const KNOWN_BENIGN_CONSOLE_PATTERNS: readonly RegExp[] = [
  /_vercel\/speed-insights\/script\.js/,
  /ERR_SSL_PROTOCOL_ERROR/,
  // The bare 404 console echo carries no URL to match by path, so this is
  // deliberately generic — a genuinely unexpected 404 is still caught by a
  // spec's own response listener, which has the path to check.
  /Failed to load resource: the server responded with a status of 404/,
  // Next.js's own resilience: a client-side RSC prefetch that hits a
  // transient network blip falls back to a full browser navigation rather
  // than failing the interaction. The fallback is the point of the message.
  /Failed to fetch RSC payload for .*\. Falling back to browser navigation\./,
];

export function isKnownBenignConsoleNoise(messageText: string): boolean {
  return KNOWN_BENIGN_CONSOLE_PATTERNS.some((pattern) => pattern.test(messageText));
}

/** Response paths for the same Speed Insights noise, for response-event listeners. */
export function isKnownBenignResponsePath(pathname: string): boolean {
  return (
    pathname === "/v1/speed-insights/script.debug.js" ||
    pathname === "/_vercel/speed-insights/script.js"
  );
}
