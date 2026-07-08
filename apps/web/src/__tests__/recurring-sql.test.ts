import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveMigrationPath() {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, "supabase/migrations/002_functions_triggers.sql");

  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(cwd, "../../supabase/migrations/002_functions_triggers.sql");
}

function resolveSchemaPath() {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, "supabase/migrations/001_schema.sql");

  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(cwd, "../../supabase/migrations/001_schema.sql");
}

function tableBlock(sql: string, tableName: string): string {
  const match = sql.match(new RegExp(`CREATE TABLE public\\.${tableName} \\([\\s\\S]*?\\n\\);`));
  if (!match) throw new Error(`${tableName} block not found`);
  return match[0];
}

describe("recurring schedule database contract", () => {
  it("keeps recurring and series templates state-only in the schema", () => {
    const sql = readFileSync(resolveSchemaPath(), "utf8");
    const recurring = tableBlock(sql, "recurring_shifts");
    const series = tableBlock(sql, "shift_series");

    expect(recurring).toContain("state           JSONB NOT NULL");
    expect(series).toContain("state           JSONB NOT NULL");
    expect(recurring).not.toMatch(/\n\s+shift_id\s+BIGINT/);
    expect(recurring).not.toMatch(/\n\s+job_id\s+BIGINT/);
    expect(recurring).not.toMatch(/\n\s+absence_type_id\s+BIGINT/);
    expect(series).not.toMatch(/\n\s+shift_id\s+BIGINT/);
    expect(series).not.toMatch(/\n\s+job_id\s+BIGINT/);
    expect(series).not.toMatch(/\n\s+absence_type_id\s+BIGINT/);
    expect(sql).not.toContain("idx_recurring_shifts_shift_id");
    expect(sql).not.toContain("idx_shift_series_shift_id");
  });

  it("defines the upsert_recurring_shift RPC used by recurring saves", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.upsert_recurring_shift\s*\(/);
    expect(sql).toContain("canManageRecurringShifts");
    expect(sql).toContain("p_state JSONB");
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.upsert_recurring_shift\(UUID, UUID, SMALLINT, JSONB, DATE\) TO authenticated;/,
    );
  });

  it("does not write legacy recurring or series convenience columns", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE)\b[\s\S]{0,240}\brecurring_shifts\b[\s\S]{0,240}\b(?:shift_id|job_id|absence_type_id)\b/i,
    );
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE)\b[\s\S]{0,240}\bshift_series\b[\s\S]{0,240}\b(?:shift_id|job_id|absence_type_id)\b/i,
    );
  });

  it("does not define the dead SQL apply_recurring_schedules RPC", () => {
    // Recurring autofill is applied via the app's /api/schedule/manage route
    // (applyRecurringSchedules action), not this RPC — it was never called
    // from application code and has been removed to avoid drift between two
    // parallel implementations of the same fill algorithm.
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.apply_recurring_schedules\s*\(/);
  });

  it("updates series templates from canonical state only", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_series_all_shifts\s*\(\s*p_series_id UUID,\s*p_org_id UUID,\s*p_state JSONB/,
    );
    expect(sql).toContain("UPDATE public.shift_series");
    expect(sql).toContain("state = p_state");
    expect(sql).toContain("public.resolve_schedule_state_storage(p_org_id, p_state)");
    expect(sql).toContain("canManageShiftSeries");
    expect(sql).not.toContain("SET shift_id =");
    expect(sql).not.toContain("SET job_id =");
    expect(sql).not.toContain("SET absence_type_id =");
  });

  it("creates shift series atomically in SQL", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_shift_series\s*\(/);
    expect(sql).toContain("INSERT INTO public.shift_series");
    expect(sql).toContain("public.write_schedule_cell_snapshot_internal");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_shift_series");
  });

  it("checks target-cell optimistic state before moving or copying shifts", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toContain("p_target_expected_version BIGINT DEFAULT NULL");
    expect(sql).toContain("p_target_was_empty  BOOLEAN DEFAULT FALSE");
    expect(sql).toContain("expected empty target");
    expect(sql).toContain("v_target_write_expected_version");
  });
});
