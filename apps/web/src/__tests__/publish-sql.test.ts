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

describe("publish schedule database contract", () => {
  it("supports an explicit actor fallback when auth.uid() is unavailable", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toContain("DROP FUNCTION IF EXISTS public.publish_schedule(UUID, DATE, DATE);");
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.publish_schedule[\s\S]*p_org_id\s+UUID,\s*p_start_date\s+DATE,\s*p_end_date\s+DATE,\s*p_actor_id\s+UUID DEFAULT NULL/,
    );
    expect(sql).toContain("v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);");
    expect(sql).toContain("RAISE EXCEPTION 'Unauthorized: missing actor identity';");
    expect(sql).toContain("VALUES (p_org_id, v_actor_id, p_start_date, p_end_date, v_change_count, v_changes)");
  });

  it("stores canonical fromState/toState payloads without compatibility arrays", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.build_schedule_cell_state_json(");
    expect(sql).toContain("'fromState'");
    expect(sql).toContain("'toState'");
    expect(sql).not.toContain("'fromShiftIds'");
    expect(sql).not.toContain("'toShiftIds'");
    expect(sql).not.toContain("'fromJobIds'");
    expect(sql).not.toContain("'toJobIds'");
    expect(sql).toContain("requester_state");
    expect(sql).toContain("target_state");
  });

  it("keeps shift requests state-only in the schema and RPCs", () => {
    const schema = readFileSync(resolveSchemaPath(), "utf8");
    const functions = readFileSync(resolveMigrationPath(), "utf8");
    const requests = tableBlock(schema, "shift_requests");
    const removedColumns = [
      "requester_shift_ids",
      "requester_job_ids",
      "requester_focus_area_id",
      "requester_custom_start_time",
      "requester_custom_end_time",
      "target_shift_ids",
      "target_job_ids",
      "target_focus_area_id",
      "target_custom_start_time",
      "target_custom_end_time",
    ];

    expect(requests).toMatch(/\brequester_state\s+JSONB NOT NULL\b/);
    expect(requests).toMatch(/\btarget_state\s+JSONB\b/);

    for (const column of removedColumns) {
      expect(requests).not.toContain(column);
      expect(functions).not.toContain(column);
    }

    expect(functions).toContain("public.resolve_schedule_state_storage");
    expect(functions).toContain("public.build_schedule_cell_state_json");
  });

  it("writes draft-delete snapshots with the current normalized snapshot signature", () => {
    const sql = readFileSync(resolveMigrationPath(), "utf8");

    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.sync_schedule_cell_snapshot(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[]);",
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.sync_schedule_cell_snapshot\(\s*p_cell_id UUID,\s*p_org_id UUID,\s*p_snapshot_kind TEXT,\s*p_state_kind TEXT,\s*p_absence_type_id BIGINT,\s*p_custom_start_time TEXT,\s*p_custom_end_time TEXT,\s*p_shift_ids BIGINT\[\],\s*p_job_ids BIGINT\[\]\s*\)/,
    );
    expect(sql).toMatch(
      /PERFORM public\.sync_schedule_cell_snapshot\(\s*v_cell\.id,\s*p_org_id,\s*'draft',\s*'deleted',\s*NULL,\s*NULL,\s*NULL,\s*'\{\}'::BIGINT\[\],\s*'\{\}'::BIGINT\[\]\s*\);/,
    );
  });
});
