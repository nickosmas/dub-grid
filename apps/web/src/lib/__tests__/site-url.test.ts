import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_SITE_URL } from "../site-url";

/** Runs from apps/web or the repo root, matching helpers/sql-inventory.ts. */
function robotsTxtPath(): string {
  const fromWebRoot = resolve(process.cwd(), "public/robots.txt");
  return existsSync(fromWebRoot)
    ? fromWebRoot
    : resolve(process.cwd(), "apps/web/public/robots.txt");
}

/**
 * robots.txt is a static file, so it cannot import the constant. Binding it
 * here is what stops the host drifting back to the apex in one place while the
 * metadata and sitemap move on.
 */
const robotsTxt = readFileSync(robotsTxtPath(), "utf8");

describe("canonical site URL", () => {
  it("names the host that serves, not the one that redirects", () => {
    expect(CANONICAL_SITE_URL).toBe("https://www.dubgrid.com");
    expect(CANONICAL_SITE_URL).not.toMatch(/^https:\/\/dubgrid\.com/);
  });

  it("has no trailing slash, since callers append paths", () => {
    expect(CANONICAL_SITE_URL.endsWith("/")).toBe(false);
  });

  it("points crawlers at the sitemap on that same host", () => {
    expect(robotsTxt).toContain(`Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`);
  });
});
