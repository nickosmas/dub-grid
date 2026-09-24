import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appUiCss = readFileSync(resolve(process.cwd(), "src/app/app-ui.css"), "utf8");
const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("initial content paint", () => {
  it("does not animate route, card, or row mounts from a hidden state", () => {
    for (const selector of [".dg-page-enter", ".dg-card-enter", ".dg-row-enter", ".dg-card"]) {
      const rule = appUiCss.match(new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`));
      expect(rule?.[1]).toContain("animation: none;");
    }

    expect(globalsCss).not.toContain("@keyframes dg-enter");
    expect(globalsCss).not.toContain("@keyframes dg-enter-scale");
  });
});
