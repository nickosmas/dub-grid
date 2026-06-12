import type { ImportPreviousScheduleOutcome } from "@/features/schedule/client";

export type { ScheduleCellInput } from "@/types";

export type ScheduleOperation = {
  kind: "autofill" | "import_previous" | "repeat_series";
  title: string;
  detail?: string;
  progress: number;
};

/**
 * Batch size used for the schedule bulk-delete API. The import-previous flow
 * no longer needs client batching — the server's `import_previous_schedule`
 * RPC does the entire copy in one transaction.
 */
export const SCHEDULE_DELETE_BATCH_SIZE = 20;

export const DRAFT_CHANGED_BROADCAST_KEY = "draft_changed";
export const OPERATION_MODAL_DISMISS_MS = 450;
export const PUBLISH_WINDOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

/**
 * Unions a default fetch window `[defaultStart, defaultEnd]` (both YYYY-MM-DD)
 * with optional `ensureStart` / `ensureEnd` bounds the caller knows must be
 * covered. Used to widen `refetchScheduleData` past its default ±90-day band
 * when an action just wrote into a far-out period (e.g. import-previous).
 *
 * Returns the wider of each side. Strings are compared lexicographically,
 * which is correct for ISO YYYY-MM-DD.
 */
export function widenFetchWindow(
  defaultStart: string,
  defaultEnd: string,
  opts?: { ensureStart?: string; ensureEnd?: string },
): { start: string; end: string } {
  const start =
    opts?.ensureStart && opts.ensureStart < defaultStart
      ? opts.ensureStart
      : defaultStart;
  const end =
    opts?.ensureEnd && opts.ensureEnd > defaultEnd
      ? opts.ensureEnd
      : defaultEnd;
  return { start, end };
}

// ── Import Previous Schedule outcome aggregation ────────────────────────────
//
// The server's `import_previous_schedule` RPC returns one outcome row per
// effective source cell. The client aggregates those rows into the counts the
// modal + toast need. Keeping the aggregator pure and exported lets us test it
// in isolation and reuse it for both dry-run preview and real execute.

export type ImportPreviousBreakdown = {
  imported: number;
  skippedTargetHasData: number;
  skippedEmployeeInactive: number;
  skippedSourceEmpty: number;
  disqualifiedFocusArea: number;
  disqualifiedRole: number;
  disqualifiedCert: number;
  /** Catch-all for any reason code we don't already model. Keeps the total
   * equal to outcomes.length even if the server grows a new reason. */
  skippedOther: number;
  totalSource: number;
  totalSkipped: number;
};

export function summarizeImportPreviousOutcomes(
  outcomes: ImportPreviousScheduleOutcome[],
): ImportPreviousBreakdown {
  const breakdown: ImportPreviousBreakdown = {
    imported: 0,
    skippedTargetHasData: 0,
    skippedEmployeeInactive: 0,
    skippedSourceEmpty: 0,
    disqualifiedFocusArea: 0,
    disqualifiedRole: 0,
    disqualifiedCert: 0,
    skippedOther: 0,
    totalSource: outcomes.length,
    totalSkipped: 0,
  };

  for (const row of outcomes) {
    if (row.outcome === "imported") {
      breakdown.imported += 1;
      continue;
    }
    breakdown.totalSkipped += 1;
    switch (row.reason) {
      case "target_has_data":
        breakdown.skippedTargetHasData += 1;
        break;
      case "employee_inactive":
        breakdown.skippedEmployeeInactive += 1;
        break;
      case "source_has_no_content":
        breakdown.skippedSourceEmpty += 1;
        break;
      case "disqualified:focus_area":
        breakdown.disqualifiedFocusArea += 1;
        break;
      case "disqualified:role":
        breakdown.disqualifiedRole += 1;
        break;
      case "disqualified:cert":
        breakdown.disqualifiedCert += 1;
        break;
      default:
        breakdown.skippedOther += 1;
    }
  }

  return breakdown;
}

/**
 * Builds the human-facing fragment used in the modal + toast describing why
 * shifts were skipped. Returns the empty string when nothing was skipped.
 *
 * `nameByEmpId` is used to put a real name next to dates in the example list;
 * unknown employee ids fall back to "an employee".
 */
export function formatImportPreviousSkipDescription(
  outcomes: ImportPreviousScheduleOutcome[],
  breakdown: ImportPreviousBreakdown,
  nameByEmpId: Map<string, string>,
): string {
  if (breakdown.totalSkipped === 0) return "";

  const reasons: string[] = [];
  if (breakdown.skippedTargetHasData > 0) {
    reasons.push(
      `${breakdown.skippedTargetHasData} target already had data`,
    );
  }
  if (breakdown.skippedEmployeeInactive > 0) {
    reasons.push(
      `${breakdown.skippedEmployeeInactive} employee${
        breakdown.skippedEmployeeInactive === 1 ? "" : "s"
      } no longer active`,
    );
  }
  const disqTotal =
    breakdown.disqualifiedFocusArea +
    breakdown.disqualifiedRole +
    breakdown.disqualifiedCert;
  if (disqTotal > 0) {
    reasons.push(`${disqTotal} qualification change${disqTotal === 1 ? "" : "s"}`);
  }
  if (breakdown.skippedSourceEmpty > 0) {
    reasons.push(`${breakdown.skippedSourceEmpty} source cell${breakdown.skippedSourceEmpty === 1 ? "" : "s"} had no usable content`);
  }
  if (breakdown.skippedOther > 0) {
    reasons.push(`${breakdown.skippedOther} skipped for other reasons`);
  }

  const skippedRows = outcomes.filter((r) => r.outcome === "skipped");
  const sample = skippedRows.slice(0, 3).map((r) => {
    const name = nameByEmpId.get(r.employeeId) ?? "an employee";
    return `${name} on ${formatShortDate(r.targetDate)}`;
  });
  const sampleSuffix =
    skippedRows.length > sample.length
      ? ` and ${skippedRows.length - sample.length} more`
      : "";

  return `${reasons.join(", ")}${sample.length > 0 ? ` (e.g. ${sample.join(", ")}${sampleSuffix})` : ""}`;
}

function formatShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
}
