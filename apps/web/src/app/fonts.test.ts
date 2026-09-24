import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const css = readFileSync(resolve(webRoot, "src/app/fonts.css"), "utf8");
const layout = readFileSync(resolve(webRoot, "src/app/layout.tsx"), "utf8");
const manifest: Record<string, string> = JSON.parse(
  readFileSync(resolve(webRoot, "public/fonts/manifest.json"), "utf8"),
);

describe("pinned self-hosted fonts", () => {
  it("ships the original font bytes with no external CSS fetches", () => {
    expect(layout).not.toContain("next/font/google");
    expect(css).not.toMatch(/https?:\/\//);
    const references = [...css.matchAll(/url\(["']?\/fonts\/([^\s)"']+)/g)].map((m) => m[1]);
    expect([...new Set(references)].sort()).toEqual(Object.keys(manifest).sort());
    expect(Object.keys(manifest)).toHaveLength(13);
    for (const [file, hash] of Object.entries(manifest)) {
      const bytes = readFileSync(resolve(webRoot, "public/fonts", file));
      expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    }
  });

  it("preserves all subsets, variable weights, and metric-adjusted fallbacks", () => {
    expect(css.match(/@font-face/g)).toHaveLength(18);
    expect(css.match(/unicode-range:/g)).toHaveLength(15);
    expect(css.match(/font-display:\s*swap/g)).toHaveLength(15);
    expect(css).toMatch(/font-weight:\s*100 900/);
    for (const adjustment of ["104.53%", "107.12%", "134.59%"]) expect(css).toContain(adjustment);
    expect(css).toContain('--font-inter: "Inter", "Inter Fallback"');
    expect(css).toContain('--font-dm-sans: "DM Sans", "DM Sans Fallback"');
    expect(css).toContain('--font-dm-mono: "DM Mono", "DM Mono Fallback"');
  });

  it("preloads exactly the original Latin faces and includes upstream licenses", () => {
    const preloads = Object.keys(manifest).filter((file) => layout.includes(file));
    expect(preloads).toHaveLength(4);
    expect(preloads.every((file) => file.includes("-s.p."))).toBe(true);
    expect(layout).toContain('crossOrigin="anonymous"');
    for (const family of ["dmsans", "inter", "dmmono"])
      expect(readFileSync(resolve(webRoot, `public/fonts/${family}-OFL.txt`), "utf8")).toContain(
        "SIL OPEN FONT LICENSE Version 1.1",
      );
  });
});
