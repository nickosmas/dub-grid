import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationPath(filename: string) {
  const rootPath = resolve(process.cwd(), "supabase/migrations", filename);
  return existsSync(rootPath)
    ? rootPath
    : resolve(process.cwd(), "../../supabase/migrations", filename);
}

describe("scheduler-staffed calloff publish contract", () => {
  const baseline = readFileSync(migrationPath("002_functions_triggers.sql"), "utf8");
  const forward = readFileSync(
    migrationPath("019_finalize_scheduler_staffed_calloffs.sql"),
    "utf8",
  );

  it.each([
    ["baseline", baseline],
    ["forward migration", forward],
  ])("installs the atomic trigger in the %s", (_label, sql) => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.finalize_scheduler_staffed_calloffs()",
    );
    expect(sql).toMatch(
      /CREATE TRIGGER trigger_finalize_scheduler_staffed_calloffs\s+AFTER INSERT ON public\.schedule_publish_changes/,
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.finalize_scheduler_staffed_calloffs() FROM PUBLIC, anon, authenticated;",
    );
  });

  it("considers only newly published worked segments with multiset semantics", () => {
    expect(forward).toContain("NEW.to_state->>'kind' IS DISTINCT FROM 'worked'");
    expect(forward).toContain(
      "FROM public.resolve_schedule_state_storage(NEW.org_id, NEW.to_state)",
    );
    expect(forward).toContain("PARTITION BY segment.shift_id, segment.job_id");
    expect(forward).toContain("added.occurrence > COALESCE(prior.segment_count, 0)");
    expect(forward).toContain("v_candidate_remaining := v_candidate_remaining - v_match_index");
  });

  it("matches only the active open calloff pickup in the same tenant, date, and focus area", () => {
    expect(forward).toContain("request.org_id = NEW.org_id");
    expect(forward).toContain("request.requester_shift_date = NEW.date");
    expect(forward).toContain("request.type = 'pickup'");
    expect(forward).toContain("request.status = 'open'");
    expect(forward).toContain("request.parent_request_id IS NOT NULL");
    expect(forward).toContain("parent.type = 'calloff'");
    expect(forward).toContain("parent.status = 'approved'");
    expect(forward).toContain("parent.absence_type_id IS NOT NULL");
    expect(forward).toContain("target.status = 'active'");
    expect(forward).toContain("target.archived_at IS NULL");
    expect(forward).toContain(
      "COALESCE(request_state.focus_area_id, requester.focus_area_ids[1]) = ANY(target.focus_area_ids)",
    );
  });

  it("attributes the resolution to the staffed employee and publishing actor", () => {
    expect(forward).toContain("SELECT history.published_by");
    expect(forward).toContain("target_emp_id = NEW.emp_id");
    expect(forward).toContain("target_shift_date = NEW.date");
    expect(forward).toContain("absence_type_id = v_request.absence_type_id");
    expect(forward).toContain("admin_user_id = v_actor_id");
    expect(forward).toContain("WHERE id = v_request.id");
    expect(forward).toContain("AND status = 'open'");
    expect(forward).not.toContain("pending_approval");
  });
});
