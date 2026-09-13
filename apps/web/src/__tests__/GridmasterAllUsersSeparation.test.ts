import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "apps/web/src"))) return cwd;
  return resolve(cwd, "../..");
}

describe("Gridmaster AllUsersView account separation", () => {
  it("does not expose gridmaster as an organization-user role filter", () => {
    const source = readFileSync(
      resolve(resolveRepoRoot(), "apps/web/src/components/gridmaster/AllUsersView.tsx"),
      "utf-8",
    );

    expect(source).not.toContain('{ value: "gridmaster", label: "Gridmaster" }');
    expect(source).toContain('u.platformRole === "gridmaster"');
  });

  it("requires fresh proof before submitting force logout", () => {
    const source = readFileSync(
      resolve(resolveRepoRoot(), "apps/web/src/components/gridmaster/AllUsersView.tsx"),
      "utf-8",
    );

    const assurance = source.indexOf("await requireCredentialAssurance(accessToken)");
    const mutation = source.indexOf("await forceLogoutGridmasterUser(user.id, accessToken)");
    expect(assurance).toBeGreaterThan(-1);
    expect(mutation).toBeGreaterThan(assurance);
    expect(source).toContain("forceLogoutConfirm && !stepUp.dialog");
  });
});
