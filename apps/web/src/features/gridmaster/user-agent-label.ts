import { getWebSessionMetadata } from "@/features/account/client/session-metadata";

const SYSTEM_NAMES: Record<string, string> = {
  Macintosh: "Mac",
  "Windows PC": "Windows",
  "Linux computer": "Linux",
  "Android device": "Android",
};

/** "Safari on Mac" from a raw user agent; the raw string stays the source of truth. */
export function describeUserAgent(userAgent: string): string {
  // Native requests carry the platform networking stack's agent. Only iOS adds
  // the app's own bundle name, so only there can the app be named (F-104).
  if (/CFNetwork\//i.test(userAgent) && /Darwin\//i.test(userAgent)) {
    return /^DubGrid\//.test(userAgent) ? "DubGrid app on iPhone" : "iPhone or iPad app";
  }
  if (/^okhttp\//i.test(userAgent)) return "Android app";

  const { deviceLabel, browserName } = getWebSessionMetadata(userAgent);
  const browser = browserName ?? "Unknown browser";
  if (deviceLabel === "Unknown device") return browser;
  const system = /Android/i.test(userAgent)
    ? "Android"
    : (SYSTEM_NAMES[deviceLabel] ?? deviceLabel);
  return `${browser} on ${system}`;
}
