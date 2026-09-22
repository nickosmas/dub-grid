import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

const CONTACT_COLUMNS = ["phone", "email", "contact_notes", "status_note"];

describe("employee contact columns are server-owned (migration 036)", () => {
  const migration = readFileSync(
    migrationPath("036_employee_contact_columns_server_owned.sql"),
    "utf8",
  );
  const grant = migration.slice(
    migration.indexOf("GRANT SELECT ("),
    migration.indexOf("ON public.employees TO authenticated;"),
  );

  it("takes the table-level select away before regranting columns", () => {
    expect(migration).toContain("REVOKE SELECT ON public.employees FROM authenticated;");
    expect(migration.indexOf("REVOKE SELECT ON public.employees")).toBeLessThan(
      migration.indexOf("GRANT SELECT ("),
    );
  });

  it("regrants the roster columns without the contact ones", () => {
    for (const column of ["id", "org_id", "first_name", "last_name", "status", "user_id"]) {
      expect(grant).toMatch(new RegExp(`\\b${column},`));
    }
    for (const column of CONTACT_COLUMNS) {
      expect(grant).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it("leaves the row policies alone: they gate rows, the grant gates columns", () => {
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toContain("DROP POLICY");
  });
});
