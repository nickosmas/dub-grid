import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";
import { functionBody, lineDiff } from "./helpers/sql-line-diff";

/**
 * Migration 088 restates the claim and the resolver from 085, and the list of
 * days an approval publishes from 086. Each body must equal its source except
 * for the lines the fix meant to change.
 */
const previous = readFileSync(migrationPath("085_requests_keep_rest_of_day_absence.sql"), "utf8");
const approvalReplacesDraft = readFileSync(
  migrationPath("086_approval_replaces_draft.sql"),
  "utf8",
);
const migration = readFileSync(migrationPath("088_open_pickup_claims.sql"), "utf8");

const header = (name: string) => `CREATE OR REPLACE FUNCTION public.${name}(\n`;

const diffOf = (name: string) =>
  lineDiff(functionBody(previous, header(name)), functionBody(migration, header(name)));

describe("migration 088 restatements", () => {
  it("records the claim's date and changes nothing else in the claim", () => {
    expect(diffOf("claim_shift_request_unguarded")).toEqual({
      removed: [],
      added: ["target_shift_date = v_request.requester_shift_date,"],
    });
  });

  it("changes only the call-off cancel and the claimed call-off pickup in the resolver", () => {
    expect(diffOf("resolve_shift_request_unchecked")).toEqual({
      removed: [
        "IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL) THEN",
        "v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);",
        "IF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN",
      ],
      added: [
        "AND parent_request_id IS DISTINCT FROM p_request_id",
        "-- (Skip for a call-off's own open pickup: the call-off already took the shift)",
        "IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL)",
        "AND v_request.parent_request_id IS NULL THEN",
        "IF v_request.parent_request_id IS NULL THEN",
        "v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);",
        "END IF;",
        "IF v_request.parent_request_id IS NOT NULL THEN",
        "-- A call-off's own open pickup: the requester's cell already shows",
        "-- the call-off, so it stays as it is.",
        "NULL;",
        "ELSIF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN",
      ],
    });
  });

  it("lets a claim through the check while a named pickup still needs its absence in create_shift_request", () => {
    expect(migration).toContain(
      "(target_emp_id IS NOT NULL AND target_shift_date IS NOT NULL)\n        OR (target_emp_id IS NULL AND target_shift_date IS NULL AND absence_type_id IS NULL)",
    );
    expect(previous).toContain("RAISE EXCEPTION 'Targeted pickup requests require");
  });

  it("leaves the requester's day out of what a claimed call-off pickup publishes", () => {
    expect(
      lineDiff(
        functionBody(
          approvalReplacesDraft,
          "CREATE OR REPLACE FUNCTION public.shift_request_published_cells(p_request_id UUID)\n",
        ),
        functionBody(
          migration,
          "CREATE OR REPLACE FUNCTION public.shift_request_published_cells(p_request_id UUID)\n",
        ),
      ),
    ).toEqual({
      removed: ["(request.org_id, request.requester_emp_id, request.requester_shift_date),"],
      // The diff pairs the new row's opening line with the next row's identical one.
      added: [
        "CASE WHEN NOT (request.type = 'pickup' AND request.parent_request_id IS NOT NULL)",
        "THEN request.requester_emp_id END,",
        "request.requester_shift_date),",
        "(request.org_id,",
      ],
    });
  });
});
