import { describe, it, expect } from "vitest";
import { config } from "../proxy";

/**
 * The matcher decides which paths reach the proxy at all, so an over-broad
 * exemption silently removes the authentication redirect from a route rather
 * than failing loudly.
 */
const matches = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

describe("proxy matcher", () => {
  it("lets crawlers reach the public metadata files", () => {
    // Both are public. /sitemap.xml used to run through the proxy and answer
    // 307 /login, while /robots.txt escaped only via the extension list.
    expect(matches("/sitemap.xml")).toBe(false);
    expect(matches("/robots.txt")).toBe(false);
  });

  it("keeps every other .xml path under the proxy", () => {
    expect(matches("/reports/export.xml")).toBe(true);
    expect(matches("/sitemap.xml.bak")).toBe(true);
  });

  it("still matches authenticated routes", () => {
    for (const pathname of ["/dashboard", "/schedule", "/people", "/settings", "/gridmaster"]) {
      expect(matches(pathname)).toBe(true);
    }
  });

  it("still exempts the paths that were already excluded", () => {
    for (const pathname of [
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/api/health",
      "/monitoring",
    ]) {
      expect(matches(pathname)).toBe(false);
    }
  });
});
