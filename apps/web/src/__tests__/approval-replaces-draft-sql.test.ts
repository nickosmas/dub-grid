import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

/**
 * Migration 086 restates resolve_shift_request_checked so an approval can
 * discard the earlier drafts of the cells it publishes. This rebuilds the 086
 * body from 030's by adding exactly the two intended hunks, so any other drift
 * between the copies fails here.
 */
function functionBody(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  const bodyStart = sql.indexOf("AS $$\n", start) + "AS $$\n".length;
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

const HEADER = "CREATE OR REPLACE FUNCTION public.resolve_shift_request_checked(";
const RESOLVER_CALL =
  "  PERFORM public.resolve_shift_request_unchecked(p_request_id, p_approved, p_note, p_admin_user_id);\n";

const HUNK_DECLARE_OLD = "  v_reason TEXT;\n";
const HUNK_DECLARE_NEW = "  v_reason TEXT;\n  v_cell RECORD;\n";

const HUNK_DISCARD = `
  IF p_approved AND EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE id = p_request_id AND status = 'approved'
  ) THEN
    FOR v_cell IN
      SELECT * FROM public.shift_request_published_cells(p_request_id)
      ORDER BY emp_id, shift_date
    LOOP
      PERFORM public.discard_schedule_cell_draft_internal(
        v_cell.org_id, v_cell.emp_id, v_cell.shift_date, p_admin_user_id
      );
    END LOOP;
  END IF;
`;

const v030 = readFileSync(migrationPath("030_auto_approve_shift_requests.sql"), "utf8");
const v086 = readFileSync(migrationPath("086_approval_replaces_draft.sql"), "utf8");

describe("086 resolve_shift_request_checked", () => {
  it("is 030's body plus the draft discard and nothing else", () => {
    const original = functionBody(v030, HEADER);
    expect(original.split(HUNK_DECLARE_OLD)).toHaveLength(2);
    expect(original.split(RESOLVER_CALL)).toHaveLength(2);

    const expected = original
      .replace(HUNK_DECLARE_OLD, HUNK_DECLARE_NEW)
      .replace(RESOLVER_CALL, RESOLVER_CALL + HUNK_DISCARD);

    expect(functionBody(v086, HEADER)).toBe(expected);
  });

  it("keeps the resolver private and opens only the draft read to members", () => {
    expect(v086).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolve_shift_request_checked\(UUID, BOOLEAN, TEXT, UUID\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(v086).toMatch(
      /REVOKE ALL ON FUNCTION public\.shift_request_published_cells\(UUID\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(v086).toMatch(
      /REVOKE ALL ON FUNCTION public\.discard_schedule_cell_draft_internal\(UUID, UUID, DATE, UUID\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(v086).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.shift_request_draft_cells\(UUID\) TO authenticated;/,
    );
  });
});
