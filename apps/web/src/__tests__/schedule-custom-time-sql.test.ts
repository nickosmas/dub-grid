import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationPath(filename: string) {
  const rootPath = resolve(process.cwd(), "supabase/migrations", filename);
  return existsSync(rootPath)
    ? rootPath
    : resolve(process.cwd(), "../../supabase/migrations", filename);
}

describe("default custom time guard contract", () => {
  const forward = readFileSync(migrationPath("027_drop_default_custom_times.sql"), "utf8");

  it("compares each slot with the segment default and blanks only a full match", () => {
    expect(forward).toContain("CREATE OR REPLACE FUNCTION public.normalize_schedule_custom_times(");
    expect(forward).toContain(
      "FROM public.resolve_work_assignment_time_ranges(p_shift_ids, p_job_ids, NULL, NULL) AS range",
    );
    expect(forward).toContain("WHERE range.segment_position = v_idx");
    expect(forward).toContain("AND v_start::TIME = v_default_start");
    expect(forward).toContain("AND v_end::TIME = v_default_end");
    expect(forward).toContain(
      "IF v_idx > v_segment_count OR v_start IS NULL OR v_end IS NULL THEN",
    );
    expect(forward).toContain(
      "REVOKE ALL ON FUNCTION public.normalize_schedule_custom_times(BIGINT[], BIGINT[], TEXT, TEXT)",
    );
  });

  it("normalizes inside the single snapshot write for worked cells only", () => {
    expect(forward).toContain("CREATE OR REPLACE FUNCTION public.sync_schedule_cell_snapshot(");
    expect(forward).toContain("IF p_state_kind = 'worked' THEN");
    expect(forward).toContain("FROM public.normalize_schedule_custom_times(");
    expect(forward).toContain(
      "    v_custom_start_time,\n    v_custom_end_time\n  )\n  ON CONFLICT",
    );
  });

  it("repairs draft and published rows idempotently", () => {
    expect(forward).toContain("UPDATE public.schedule_cell_snapshots AS snapshot");
    expect(forward).toContain("WHERE snapshot.state_kind = 'worked'");
    expect(forward).not.toContain("snapshot.snapshot_kind =");
    expect(forward).toContain("snapshot.custom_start_time IS DISTINCT FROM resolved.custom_start");
    expect(forward).toContain("snapshot.custom_end_time IS DISTINCT FROM resolved.custom_end");
  });
});
