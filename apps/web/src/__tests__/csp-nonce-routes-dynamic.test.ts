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
  "goodbye",
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
  // Route groups — a directory in parentheses — are not URL segments, so the
  // real routes live one level down. Skipping them outright (as this did before
  // the (app) group existed) collected nothing at all, and a suite with no
  // cases passes by saying nothing. Descend instead, and carry the group's own
  // layout down as a source of dynamic-ness, since children inherit it.
  type Seg = { name: string; dir: string; inheritedDynamic: boolean };

  function collect(dir: string, inheritedDynamic: boolean): Seg[] {
    const out: Seg[] = [];
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory() || IGNORED.has(d.name)) continue;
      const child = join(dir, d.name);
      if (d.name.startsWith("(")) {
        out.push(...collect(child, inheritedDynamic || isDynamic(join(child, "layout.tsx"))));
        continue;
      }
      out.push({ name: d.name, dir: child, inheritedDynamic });
    }
    return out;
  }

  const segments = collect(APP_DIR, false).filter((s) => !PUBLIC_SEGMENTS.has(s.name));
  expect(segments.length, "collected no route segments — the traversal is broken").toBeGreaterThan(
    0,
  );

  for (const { name: seg, dir, inheritedDynamic } of segments) {
    const hasPage = existsSync(join(dir, "page.tsx"));
    if (!hasPage) continue; // not a routable leaf at this level

    it(`/${seg} is dynamically rendered`, () => {
      const dynamicHere =
        inheritedDynamic || isDynamic(join(dir, "layout.tsx")) || isDynamic(join(dir, "page.tsx"));
      expect(
        dynamicHere,
        `/${seg} is an authed route (gets the nonce CSP) but is not dynamic. ` +
          `Add \`export const dynamic = "force-dynamic"\` to its layout.tsx or page.tsx, ` +
          `or add it to PUBLIC_SEGMENTS if it is genuinely public+static.`,
      ).toBe(true);
    });
  }
});
