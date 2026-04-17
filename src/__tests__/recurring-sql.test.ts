import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("recurring schedule database contract", () => {
  it("defines the upsert_recurring_shift RPC used by recurring saves", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/002_functions_triggers.sql"),
      "utf8",
    );

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.upsert_recurring_shift\s*\(/);
    expect(sql).toContain("canManageRecurringShifts");
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.upsert_recurring_shift\(UUID, UUID, SMALLINT, BIGINT, BIGINT, DATE\) TO authenticated;/,
    );
  });

  it("lets recurring autofill update draft-deleted rows instead of only inserting new rows", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/002_functions_triggers.sql"),
      "utf8",
    );

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_recurring_schedules\s*\(/);
    expect(sql).toMatch(/ON CONFLICT \(emp_id, date\) DO UPDATE/);
    expect(sql).toContain("draft_is_delete = FALSE");
  });
});
