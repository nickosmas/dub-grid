import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

/**
 * Migration 085 restates four shift-request functions. Each body must equal
 * its latest copy except for the lines 45e meant to change, so any other drift
 * fails here rather than in production.
 */
function functionBody(sql: string, header: string): string[] {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  const bodyStart = sql.indexOf("AS $$\n", start) + "AS $$\n".length;
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd).split("\n");
}

/** Lines only in `before` and lines only in `after`, by longest common subsequence. */
function lineDiff(before: string[], after: string[]): { removed: string[]; added: string[] } {
  const rows = before.length + 1;
  const cols = after.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        before[i] === after[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      removed.push(before[i++].trim());
    } else {
      added.push(after[j++].trim());
    }
  }
  removed.push(...before.slice(i).map((line) => line.trim()));
  added.push(...after.slice(j).map((line) => line.trim()));
  return {
    removed: removed.filter(Boolean),
    added: added.filter(Boolean),
  };
}

const original002 = readFileSync(migrationPath("002_functions_triggers.sql"), "utf8");
const original030 = readFileSync(migrationPath("030_auto_approve_shift_requests.sql"), "utf8");
const migration = readFileSync(migrationPath("085_requests_keep_rest_of_day_absence.sql"), "utf8");

const header = (name: string) => `CREATE OR REPLACE FUNCTION public.${name}(\n`;

const unavailable = (variable: string, message: string) => [
  `IF FOUND AND ${variable}.state_kind = 'worked' AND ${variable}.absence_type_id IS NOT NULL THEN`,
  `RAISE EXCEPTION '${message}';`,
  "END IF;",
];

const absentOn = (emp: string, date: string, message: string) => [
  "IF EXISTS (",
  "SELECT 1",
  `FROM public.get_schedule_cell_snapshot_payload(p_org_id, ${emp}, ${date}, 'published') AS cell`,
  "WHERE cell.state_kind = 'worked' AND cell.absence_type_id IS NOT NULL",
  ") THEN",
  `RAISE EXCEPTION '${message}';`,
  "END IF;",
];

describe("migration 085 restatements", () => {
  it("narrows create_shift_request's refusals and refuses a swap onto an absent day", () => {
    const diff = lineDiff(
      functionBody(original002, header("create_shift_request")),
      functionBody(migration, header("create_shift_request_unguarded")),
    );
    expect(diff.removed).toEqual([
      "-- Check not an absence (can't avail an off day)",
      "IF v_requester_shift.absence_type_id IS NOT NULL THEN",
      "RAISE EXCEPTION 'Cannot create a request for an off-day shift';",
      "-- Check target shift is not an absence",
      "IF v_target_shift.absence_type_id IS NOT NULL THEN",
      "RAISE EXCEPTION 'Cannot swap with an off-day shift';",
    ]);
    expect(diff.added).toEqual([
      "-- A worked cell may carry an absence after its shifts; only a whole-day",
      "-- absence has no shift to request",
      "IF v_requester_shift.state_kind = 'absence' THEN",
      "RAISE EXCEPTION 'Cannot create a request for an absence';",
      "-- Check target shift is not a whole-day absence",
      "IF v_target_shift.state_kind = 'absence' THEN",
      "RAISE EXCEPTION 'Cannot swap with an absence';",
      "-- Each side takes a shift on the other's date, which nobody absent for",
      "-- the rest of that day can do",
      ...absentOn(
        "p_target_emp_id",
        "p_requester_shift_date",
        "Cannot swap: they are absent for the rest of that day",
      ),
      ...absentOn(
        "p_requester_emp_id",
        "p_target_shift_date",
        "Cannot swap: you are absent for the rest of that day",
      ),
    ]);
  });

  it.each([["claim_shift_request"], ["volunteer_for_open_shift"]])(
    "adds only the absent-for-the-day refusal to %s",
    (name) => {
      const diff = lineDiff(
        functionBody(original002, header(name)),
        functionBody(migration, header(`${name}_unguarded`)),
      );
      expect(diff.removed).toEqual([]);
      expect(diff.added).toEqual(
        unavailable("v_existing_shift", "You are absent for the rest of this day"),
      );
    },
  );

  it("changes only the resolver's absence handling", () => {
    const diff = lineDiff(
      functionBody(original030, header("resolve_shift_request_unchecked")),
      functionBody(migration, header("resolve_shift_request_unchecked")),
    );
    const keeps = (variable: string) => `${variable}.absence_type_id,`;
    const deletedOrAbsence = (variable: string) =>
      `CASE WHEN ${variable}.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,`;

    expect(diff.removed.sort()).toEqual(
      [...Array(7).fill("NULL,"), ...Array(3).fill("'deleted',")].sort(),
    );
    expect(diff.added.sort()).toEqual(
      [
        keeps("v_req_shift"),
        keeps("v_req_shift"),
        keeps("v_req_shift"),
        keeps("v_tgt_shift"),
        deletedOrAbsence("v_req_shift"),
        keeps("v_req_shift"),
        deletedOrAbsence("v_req_shift"),
        keeps("v_req_shift"),
        deletedOrAbsence("v_tgt_shift"),
        keeps("v_tgt_shift"),
        ...unavailable(
          "v_tgt_shift",
          "The volunteer is absent for the rest of this day. Cannot approve.",
        ),
        ...unavailable(
          "v_tgt_shift",
          "The target employee is absent for the rest of this day. Cannot approve.",
        ),
        "IF v_req_shift.absence_type_id IS NOT NULL OR v_tgt_shift.absence_type_id IS NOT NULL THEN",
        "RAISE EXCEPTION 'Cannot approve: someone in this swap is absent for the rest of the day';",
        "END IF;",
        ...unavailable(
          "v_req_shift",
          "Cannot approve: requester is absent for the rest of the target''s date",
        ),
        ...unavailable(
          "v_tgt_shift",
          "Cannot approve: target is absent for the rest of the requester''s date",
        ),
      ].sort(),
    );
  });
});
