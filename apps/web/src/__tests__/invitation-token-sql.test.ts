import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

describe("an invitation's token and writes are server-only (migration 049)", () => {
  const migration = readFileSync(migrationPath("049_invitation_token_server_only.sql"), "utf8");
  const grant = migration.slice(
    migration.indexOf("GRANT SELECT ("),
    migration.indexOf("ON public.invitations TO authenticated;"),
  );

  it("takes every table privilege away before regranting columns", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.invitations FROM authenticated;");
    expect(migration.indexOf("REVOKE ALL ON TABLE public.invitations")).toBeLessThan(
      migration.indexOf("GRANT SELECT ("),
    );
  });

  it("regrants reading every column but the token, and no write", () => {
    for (const column of ["id", "org_id", "email", "role_to_assign", "expires_at", "revoked_at"]) {
      expect(grant).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(grant).not.toMatch(/\btoken\b/);
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\b[^;]*invitations/i);
  });

  it("leaves the row policies alone", () => {
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("DROP POLICY");
  });
});
