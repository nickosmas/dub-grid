// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readShiftRequestNote } from "@dubgrid/domain";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");

// The database writes these reasons into the manager-note column; each must read
// as what happened, never as a manager's words.
describe("shift request reasons the database records", () => {
  it("recognizes every note the migrations write", () => {
    const literals = new Set<string>();
    for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      for (const match of sql.matchAll(/admin_note\s*=\s*'([^']+)'/g)) literals.add(match[1]!);
      for (const match of sql.matchAll(/v_note\s*:=\s*format\(\s*'([^']+)'/g)) {
        literals.add(match[1]!.replace("%s", "Jane Doe"));
      }
    }
    expect(literals.size).toBeGreaterThanOrEqual(5);
    for (const literal of literals) {
      expect(readShiftRequestNote(literal)?.kind, literal).toBe("system");
    }
  });
});
