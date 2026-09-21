import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationPath(filename: string) {
  const rootPath = resolve(process.cwd(), "supabase/migrations", filename);
  return existsSync(rootPath)
    ? rootPath
    : resolve(process.cwd(), "../../supabase/migrations", filename);
}

describe("swap request conflict contract", () => {
  const sql = readFileSync(migrationPath("026_swap_request_conflicts_at_creation.sql"), "utf8");

  it("refuses a conflicting swap before the row exists", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trigger_refuse_conflicting_swap_request\s+BEFORE INSERT ON public\.shift_requests/,
    );
    expect(sql).toContain("WHEN (NEW.type = 'swap')");
    expect(sql).toContain("RAISE EXCEPTION '%', v_reason;");
  });

  it("names every conflict the approval path checks, plus time off", () => {
    expect(sql).toContain("These shifts overlap in time, so swapping them would change nothing");
    expect(sql).toContain("The requester has time off on the date they would take over");
    expect(sql).toContain("The other person has time off on the date they would take over");
    expect(sql).toContain(
      "The requester already works overlapping hours on the date they would take over",
    );
    expect(sql).toContain(
      "The other person already works overlapping hours on the date they would take over",
    );
  });

  it("keeps the helpers off the client roles", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.swap_request_conflict(UUID, UUID, DATE, JSONB, UUID, DATE, JSONB) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.refuse_conflicting_swap_request() FROM PUBLIC, anon, authenticated;",
    );
  });

  it("asks the same question again at approval, on the schedule as it is then", () => {
    const approval = readFileSync(
      migrationPath("028_swap_approval_rechecks_conflicts.sql"),
      "utf8",
    );
    expect(approval).toContain("RENAME TO resolve_shift_request_unchecked");
    expect(approval).toContain(
      "REVOKE ALL ON FUNCTION public.resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT)\n  FROM PUBLIC, anon, authenticated;",
    );
    expect(approval).toContain("v_reason := public.swap_request_conflict(");
    expect(approval).toContain("RAISE EXCEPTION 'Cannot approve: %', v_reason;");
    expect(approval).toContain(
      "PERFORM public.resolve_shift_request_unchecked(p_request_id, p_approved, p_note);",
    );
    expect(approval).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;",
    );
  });
});
