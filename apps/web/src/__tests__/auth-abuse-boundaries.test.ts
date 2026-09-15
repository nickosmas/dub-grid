import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_SECRET_QUERY_CONSUMERS,
  PUBLIC_IDENTITY_OPERATIONS,
} from "@/lib/auth/abuse-boundary-contract";

const repoRoot = path.resolve(process.cwd(), "..", "..");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("authentication abuse boundary inventory", () => {
  it("classifies every public identity operation with disclosure and limits", () => {
    for (const operation of Object.values(PUBLIC_IDENTITY_OPERATIONS)) {
      expect(operation.reason.length).toBeGreaterThan(10);
      expect(operation.limits.length).toBeGreaterThan(0);
      expect(source(operation.source).length).toBeGreaterThan(0);
    }
  });

  it("keeps generic identity operations free of account-existence copy", () => {
    for (const operation of Object.values(PUBLIC_IDENTITY_OPERATIONS)) {
      if (operation.disclosure !== "generic") continue;
      expect(source(operation.source)).not.toMatch(
        /no account (?:exists|found)|email is not registered/i,
      );
    }
  });

  it("classifies every browser secret query consumer", () => {
    for (const [file, queryKeys] of Object.entries(BROWSER_SECRET_QUERY_CONSUMERS)) {
      const contents = source(file);
      for (const key of queryKeys) {
        expect(contents, `${file} must consume ${key}`).toContain(key);
      }
      if (file.endsWith("page.tsx")) {
        expect(contents, `${file} must scrub captured browser secrets`).toContain(
          "scrubBrowserSecretQuery",
        );
      }
    }
  });
});
