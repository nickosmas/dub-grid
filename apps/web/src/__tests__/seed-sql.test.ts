import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveSeedPath(fileName: string) {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, "supabase", fileName);

  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(cwd, "../../supabase", fileName);
}

describe("seed schedule definition contracts", () => {
  it.each(["seed_arden_wood.sql", "seed_calm_haven.sql"])(
    "uses the hidden default shift job instead of generic Nurse or Staff jobs in %s",
    (fileName) => {
      const sql = readFileSync(resolveSeedPath(fileName), "utf8");

      expect(sql).toContain("'Default shift job', 'SHIFT', false, 'with_shift'");
      expect(sql).toContain("'default_shift_job'");
      expect(sql).not.toContain("'Nurse', 'Nurse', true, 'with_shift'");
      expect(sql).not.toContain("'Staff', 'Staff', true, 'with_shift'");
      expect(sql).not.toContain("'Staff', 'STA'");
      expect(sql).not.toContain("'Christian Science Nurse', 'CN', true, 'with_shift'");
    },
  );

  it("uses standard seed colors for focus areas, shifts, and jobs", () => {
    const calmHavenSql = readFileSync(resolveSeedPath("seed_calm_haven.sql"), "utf8");

    const focusAreaColors = ["#BFDBFE", "#C7D2FE", "#A5F3FC", "#A7F3D0"];
    const shiftColors = ["#A5F3FC", "#FDE68A", "#C7D2FE", "#DDD6FE", "#FECDD3", "#A7F3D0"];
    const shiftlessJobColors = ["#E2E8F0", "#FDE68A"];

    for (const color of focusAreaColors) {
      expect(calmHavenSql).toContain(color);
    }

    for (const color of shiftlessJobColors) {
      expect(calmHavenSql).toContain(color);
    }

    for (const color of shiftColors) {
      expect(calmHavenSql).toContain(color);
    }

    for (const color of [
      "#2F7D6D",
      "#6F5FA8",
      "#4968A6",
      "#2D7F96",
      "#6B7280",
      "#A16207",
      "#B4533C",
      "#8A5A44",
      "#B35C7A",
      "#7C6A2F",
      "#4A8F8A",
      "#8A78B8",
      "#5E6FB0",
      "#3F91A8",
      "#7A8FA6",
      "#A47C48",
      "#4B9A77",
      "#8B7AAE",
      "#B6736A",
      "#658DCA",
    ]) {
      expect(calmHavenSql).not.toContain(color);
    }

    expect(calmHavenSql).toContain(
      "INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)",
    );
    for (const jobName of ["Default shift job", "Supervisor", "Mentor"]) {
      const blockStart = calmHavenSql.indexOf(`org, '${jobName}'`);
      expect(blockStart).toBeGreaterThanOrEqual(0);
      const nextTupleEnd = calmHavenSql.indexOf("),", blockStart);
      const insertEnd = calmHavenSql.indexOf(");", blockStart);
      const blockEnd = nextTupleEnd === -1 ? insertEnd : nextTupleEnd;
      expect(blockEnd).toBeGreaterThan(blockStart);
      const jobBlock = calmHavenSql.slice(blockStart, blockEnd);
      expect(jobBlock).toContain("'#E2E8F0', 'transparent', '#1E293B'");
    }
    expect(calmHavenSql).not.toContain("'#F8FAFC', '#CBD5E1', '#64748B'");
  });
});
