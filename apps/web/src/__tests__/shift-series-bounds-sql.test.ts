import { describe, expect, it } from "vitest";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

describe("shift series server bounds", () => {
  const { text } = latestFunctionDefinition("create_shift_series");

  it("keeps the database cap aligned with the application limit", () => {
    expect(text).toContain(
      `v_cap INTEGER := LEAST(COALESCE(p_max_occurrences, ${MAX_SERIES_OCCURRENCES}), ${MAX_SERIES_OCCURRENCES})`,
    );
    expect(text).toContain("v_occurrence_count < v_cap");
  });

  it("bounds date scanning even when no weekday matches", () => {
    expect(text).toMatch(/v_end_date DATE := LEAST\(/);
    expect(text).toContain(`p_start_date + ${MAX_SERIES_OCCURRENCES} * 14`);
    expect(text).toContain("v_current_date <= v_end_date");
  });

  it("preserves authorization and positive-count checks", () => {
    expect(text).toContain("check_admin_permission_for_org('canManageShiftSeries', p_org_id)");
    expect(text).toContain("public.is_authorized_org(p_org_id)");
    expect(text).toContain("IF v_cap <= 0 THEN");
  });
});
