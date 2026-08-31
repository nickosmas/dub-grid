import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const workspaceRoot = existsSync(resolve(process.cwd(), "apps/web/src"))
  ? resolve(process.cwd(), "apps/web")
  : process.cwd();
const source = readFileSync(resolve(workspaceRoot, "src/components/ThemeProvider.tsx"), "utf-8");

describe("ThemeProvider", () => {
  it("defaults new web visitors to light mode while retaining system support", () => {
    expect(source).toContain('defaultTheme="light"');
    expect(source).toContain("enableSystem");
  });
});
