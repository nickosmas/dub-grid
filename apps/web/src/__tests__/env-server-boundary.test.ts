import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * lib/env.server.ts must not be reachable from the browser.
 *
 * The server and client schemas used to share one module, and lib/supabase.ts
 * — the browser client behind AuthProvider — imports the client half. So every
 * server variable name, SUPABASE_SECRET_KEY and CRON_SECRET among them, was
 * bundled into client chunks. No values leaked, since Next only inlines
 * NEXT_PUBLIC_*, but the names have no business in a browser bundle and the
 * arrangement invited someone to reach for serverEnv from a client component
 * and only discover the problem at runtime.
 *
 * The runtime `typeof window` guard inside the module never prevented this;
 * only the file split did. This test is what keeps the split honest.
 */
const SRC = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const files = walk(SRC).filter((f) => !f.includes("__tests__") && !/\.test\.tsx?$/.test(f));

describe("env.server is server-only", () => {
  it("is never imported by a client component", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!/from "@\/lib\/env\.server"|import "@\/lib\/env\.server"/.test(src)) return false;
      return /^\s*["']use client["']/m.test(src);
    });

    expect(
      offenders.map((f) => f.replace(SRC, "src")),
      'These are client components importing "@/lib/env.server". Use clientEnv ' +
        "from @/lib/env, or move the work to a route handler.",
    ).toEqual([]);
  });

  it("keeps every server-only variable out of the client schema", () => {
    const clientSrc = readFileSync(join(SRC, "lib", "env.ts"), "utf8");
    const leaked = [
      "SUPABASE_SECRET_KEY",
      "CRON_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "VERCEL_API_TOKEN",
      "UPSTASH_REDIS_REST_TOKEN",
    ].filter((v) => clientSrc.includes(v));

    expect(leaked, "server-only variables named in the client-reachable env module").toEqual([]);
  });
});
