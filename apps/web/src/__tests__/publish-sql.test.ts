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
});
