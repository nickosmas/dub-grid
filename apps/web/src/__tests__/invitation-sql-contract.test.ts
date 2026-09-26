import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INVITATION_LIFETIME_HOURS } from "@dubgrid/domain";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

const migrations = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const files = readdirSync(migrations)
  .filter((file) => /^\d{3}_.*\.sql$/.test(file))
  .sort();
const read = (file: string) => readFileSync(join(migrations, file), "utf8");

// The app and SQL each carried their own copy of these (41d2).
describe("invitation SQL the app depends on", () => {
  it("expires an invitation after the same hours the app states", () => {
    const table = read("001_schema.sql").split("CREATE TABLE public.invitations (")[1] ?? "";
    const columns = table.slice(0, table.indexOf(");"));

    expect(columns).toMatch(
      new RegExp(
        `expires_at\\s+TIMESTAMPTZ NOT NULL DEFAULT now\\(\\) \\+ INTERVAL '${INVITATION_LIFETIME_HOURS} hours'`,
      ),
    );
    for (const file of files.filter((name) => name !== "001_schema.sql")) {
      expect(read(file), file).not.toMatch(/ALTER TABLE[^;]*invitations[^;]*expires_at/i);
    }
  });

  it("still raises each message the invitations route matches", () => {
    const body = latestFunctionDefinition("replace_pending_invitation_access").text.toLowerCase();

    for (const message of ["changed elsewhere", "no longer pending", "not found"]) {
      expect(body, message).toMatch(new RegExp(`raise exception '[^']*${message}`));
    }
  });
});
