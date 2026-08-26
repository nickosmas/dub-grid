export interface WebSessionMetadata {
  deviceLabel: string;
  browserName: string | null;
  browserVersion: string | null;
}

/**
 * Returns the readable parts of a browser session without retaining the full
 * user-agent. iOS browsers intentionally announce a Macintosh-compatible UA,
 * so iPhone/iPad checks must run before the macOS branch.
 */
export function getWebSessionMetadata(userAgent: string): WebSessionMetadata {
  const deviceLabel = detectDeviceLabel(userAgent);
  const browser = detectBrowser(userAgent);

  return {
    deviceLabel,
    browserName: browser?.name ?? null,
    browserVersion: browser?.version ?? null,
  };
}

function detectDeviceLabel(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";

  if (/Android/i.test(userAgent)) {
    const model = userAgent.match(/Android[^;]*;\s*([^;)]+?)\s+Build\//i)?.[1]?.trim();
    return model || "Android device";
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Macintosh";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Linux/i.test(userAgent)) return "Linux computer";
  return "Unknown device";
}

function detectBrowser(userAgent: string): { name: string; version: string | null } | null {
  const matches = (pattern: RegExp, name: string) => {
    const version = userAgent.match(pattern)?.[1] ?? null;
    return { name, version };
  };

  if (/Edg\//i.test(userAgent)) return matches(/Edg\/([\d.]+)/i, "Edge");
  if (/OPR\//i.test(userAgent)) return matches(/OPR\/([\d.]+)/i, "Opera");
  if (/SamsungBrowser\//i.test(userAgent)) {
    return matches(/SamsungBrowser\/([\d.]+)/i, "Samsung Internet");
  }
  if (/Firefox\//i.test(userAgent)) return matches(/Firefox\/([\d.]+)/i, "Firefox");
  if (/CriOS\//i.test(userAgent)) return matches(/CriOS\/([\d.]+)/i, "Chrome");
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) {
    return matches(/Chrome\/([\d.]+)/i, "Chrome");
  }
  if (/Safari\//i.test(userAgent) && !/Android/i.test(userAgent)) {
    return matches(/Version\/([\d.]+)/i, "Safari");
  }
  return null;
}
