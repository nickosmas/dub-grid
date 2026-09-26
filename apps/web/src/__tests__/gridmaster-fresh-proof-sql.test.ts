import { describe, expect, it } from "vitest";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

// A later redefinition that dropped the guard would re-open F-60 silently.
const GRANT_FUNCTIONS = [
  "change_user_role",
  "assign_org_role_by_email",
  "promote_gridmaster_by_email",
  "demote_gridmaster_account",
  "set_gridmaster_account_deactivated",
];

describe("a Gridmaster's grant needs fresh proof in the database (migration 051)", () => {
  it.each(GRANT_FUNCTIONS)("%s refuses a Gridmaster without fresh proof first", (name) => {
    const { text } = latestFunctionDefinition(name);
    const body = text.slice(text.indexOf("BEGIN"));
    expect(body).toMatch(
      /^BEGIN\s*(?:--[^\n]*\n\s*)*IF public\.is_gridmaster\(\) AND NOT public\.caller_has_fresh_proof\(\) THEN\s*RAISE EXCEPTION 'STEP_UP_REQUIRED'/,
    );
  });

  it("keeps the proof check itself away from signed-in callers", () => {
    const { file, text } = latestFunctionDefinition("caller_has_fresh_proof");
    expect(text).toMatch(/SECURITY DEFINER/);
    expect(text).toMatch(/v_now - v_at <= 300/);
    expect(text).toMatch(/v_at <= v_now \+ 30/);
    expect(file).toBe("051_gridmaster_grants_need_fresh_proof.sql");
  });
});
