import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for the F-4 / H-2 bug class: the authenticated app receives a
 * per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`) from
 * middleware. A statically prerendered page can't carry that nonce, so its
 * scripts get blocked and hydration breaks. Every authed route MUST therefore
 * render dynamically (force-dynamic, or read a dynamic API like cookies()).
 *
 * This test fails if someone adds an authed top-level route segment without
 * making it dynamic — which is exactly how /billing-required and the others
 * slipped through. Keep PUBLIC_SEGMENTS in sync with the public-route branch in
 * apps/web/middleware.ts (those keep 'unsafe-inline' and are allowed to stay
 * static).
 */

const APP_DIR = join(__dirname, "..", "app");

// Top-level segments that the middleware serves with the static 'unsafe-inline'
// CSP (its public-route list) — these are allowed to be statically prerendered.
const PUBLIC_SEGMENTS = new Set([
  "login",
  "privacy",
  "terms",
  "cookie-policy",
  "accept-invite",
  "request-demo",
  "forgot-password",
  "reset-password",
  "verify-email",
  "auth", // /auth/* is public
]);

// Non-route dirs and the root page (the marketing "/" is public + static).
const IGNORED = new Set(["api", "auth"]);

function isDynamic(file: string): boolean {
  if (!existsSync(file)) return false;
  const src = readFileSync(file, "utf8");
  return (
    /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(src) ||
    /\bcookies\s*\(\s*\)/.test(src) ||
    /\bheaders\s*\(\s*\)/.test(src) ||
    /export\s+const\s+revalidate\s*=\s*0\b/.test(src)
  );
}

describe("authed routes receive the nonce CSP and must render dynamically (F-4/H-2)", () => {
  const segments = readdirSync(APP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("(") && !IGNORED.has(d.name))
    .map((d) => d.name)
    .filter((name) => !PUBLIC_SEGMENTS.has(name));

  for (const seg of segments) {
    const dir = join(APP_DIR, seg);
    const hasPage = existsSync(join(dir, "page.tsx"));
    if (!hasPage) continue; // not a routable leaf at this level

    it(`/${seg} is dynamically rendered`, () => {
      const dynamicHere =
        isDynamic(join(dir, "layout.tsx")) || isDynamic(join(dir, "page.tsx"));
      expect(
        dynamicHere,
        `/${seg} is an authed route (gets the nonce CSP) but is not dynamic. ` +
          `Add \`export const dynamic = "force-dynamic"\` to its layout.tsx or page.tsx, ` +
          `or add it to PUBLIC_SEGMENTS if it is genuinely public+static.`,
      ).toBe(true);
    });
  }
});
