import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const landingPage = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf-8");

describe("landing content visibility", () => {
  it("does not make marketing sections depend on scroll-observer delivery", () => {
    expect(landingPage).not.toContain("IntersectionObserver");
    expect(landingPage).not.toContain('"opacity-0 translate-y-8"');
    expect(landingPage).toContain("className={`scroll-mt-14 ${className}`}");
  });
});
