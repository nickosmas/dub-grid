import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

/**
 * Migration 030 restates the 1,300-line shift-request resolver so that the
 * approver can be a parameter. This test rebuilds the 030 body from the 002
 * text by applying exactly the three intended hunks, so any other drift
 * between the two copies fails here rather than in production.
 */
function functionBody(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  const bodyStart = sql.indexOf("AS $$\n", start) + "AS $$\n".length;
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const HUNK_A_OLD = "  v_admin_user_id UUID := auth.uid();\n";
const HUNK_A_NEW = "  v_admin_user_id UUID := p_admin_user_id;\n";

const HUNK_B_REMOVED = `  -- Validate admin permissions
  IF NOT (
    public.is_gridmaster()
    OR public.caller_org_role()::TEXT = 'super_admin'
  ) THEN
    -- Check canApproveShiftRequests for admins
    IF public.caller_org_role()::TEXT = 'admin' THEN
      IF NOT COALESCE(
        (SELECT (cm.admin_permissions->>'canApproveShiftRequests')::BOOLEAN
         FROM public.organization_memberships cm
         WHERE cm.user_id = v_admin_user_id AND cm.org_id = public.caller_org_id()),
        FALSE
      ) THEN
        RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: insufficient permissions';
    END IF;
  END IF;

`;

const HUNK_C_ANCHOR = `    RAISE EXCEPTION 'Unauthorized: request belongs to a different organization';
  END IF;
`;

const HUNK_C_INSERT = `
  -- Authority and attribution come from p_admin_user_id, not the JWT:
  -- auto-approval acts for the approver who is party to the request, who
  -- is not always the caller. The org check above still ties the caller's
  -- session to this org, and only the two wrappers below can reach here.
  IF NOT public.user_can_approve_shift_requests(p_admin_user_id, v_request.org_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
  END IF;
`;

describe("auto-approval resolver restatement", () => {
  const original = readFileSync(migrationPath("002_functions_triggers.sql"), "utf8");
  const migration = readFileSync(migrationPath("030_auto_approve_shift_requests.sql"), "utf8");

  const body002 = functionBody(
    original,
    "CREATE OR REPLACE FUNCTION public.resolve_shift_request(\n",
  );
  const body030 = functionBody(
    migration,
    "CREATE OR REPLACE FUNCTION public.resolve_shift_request_unchecked(\n",
  );

  it("equals the 002 resolver except for the three intended hunks", () => {
    expect(occurrences(body002, HUNK_A_OLD)).toBe(1);
    expect(occurrences(body002, HUNK_B_REMOVED)).toBe(1);
    expect(occurrences(body002, HUNK_C_ANCHOR)).toBe(1);

    const rebuilt = body002
      .replace(HUNK_A_OLD, HUNK_A_NEW)
      .replace(HUNK_B_REMOVED, "")
      .replace(HUNK_C_ANCHOR, HUNK_C_ANCHOR + HUNK_C_INSERT);

    expect(body030).toBe(rebuilt);
  });

  it("takes its identity from the parameter and keeps the session-bound org check", () => {
    expect(body030).not.toContain("auth.uid()");
    expect(body030).not.toContain("caller_org_role()");
    expect(occurrences(body030, "caller_org_id()")).toBe(1);
  });

  it("keeps the resolver private and exposes only the two entry points", () => {
    for (const signature of [
      "user_can_approve_shift_requests(UUID, UUID)",
      "resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT, UUID)",
      "resolve_shift_request_checked(UUID, BOOLEAN, TEXT, UUID)",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${signature}\n  FROM PUBLIC, anon, authenticated;`,
      );
    }
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.auto_approve_shift_request(UUID) TO authenticated;",
    );
    expect(migration).toContain(
      "DROP FUNCTION public.resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT);",
    );
  });

  it("routes both approval paths through the shared conflict recheck", () => {
    const manual = functionBody(
      migration,
      "CREATE OR REPLACE FUNCTION public.resolve_shift_request(\n",
    );
    expect(manual).toContain(
      "PERFORM public.resolve_shift_request_checked(p_request_id, p_approved, p_note, auth.uid());",
    );

    const auto = functionBody(
      migration,
      "CREATE OR REPLACE FUNCTION public.auto_approve_shift_request(\n",
    );
    expect(auto).toContain(
      "resolve_shift_request_checked(p_request_id, TRUE, v_note, v_approver_user_id)",
    );
    expect(auto).not.toContain("resolve_shift_request_unchecked(");
    expect(auto).toContain("'Auto-approved: %s can approve shift requests'");
    expect(auto).toContain("IF public.is_gridmaster() THEN\n    RETURN NULL;");
    expect(auto).toContain("v_request.parent_request_id IS NULL");
  });
});
