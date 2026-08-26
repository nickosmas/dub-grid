"use client";

import Modal from "@/components/Modal";
import {
  formatShortDate,
  getSkipReasonLabel,
  type ImportPreviousBreakdown,
} from "@/app/(app)/schedule/_lib/operations";
import type { ImportPreviousScheduleOutcome } from "@/features/schedule/client";

interface ImportResultsModalProps {
  sourceRange: string;
  targetRange: string;
  outcomes: ImportPreviousScheduleOutcome[];
  breakdown: ImportPreviousBreakdown;
  nameByEmpId: Map<string, string>;
  onClose: () => void;
}

/**
 * Full, reviewable breakdown of an "Import Previous Schedule" run — every
 * skipped cell with its employee, date, and reason. The toast that fires
 * right after import only shows totals + up to 3 examples and disappears
 * after 12s; this is the persistent place to see the whole list.
 */
export default function ImportResultsModal({
  sourceRange,
  targetRange,
  outcomes,
  breakdown,
  nameByEmpId,
  onClose,
}: ImportResultsModalProps) {
  const skippedByReason = new Map<string, ImportPreviousScheduleOutcome[]>();
  for (const row of outcomes) {
    if (row.outcome !== "skipped") continue;
    const label = getSkipReasonLabel(row.reason);
    const group = skippedByReason.get(label) ?? [];
    group.push(row);
    skippedByReason.set(label, group);
  }

  return (
    <Modal title="Import Results" onClose={onClose}>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-fs-body-sm)",
          color: "var(--dg-color-text-secondary)",
        }}
      >
        Imported {breakdown.imported} of {breakdown.totalSource} shift
        {breakdown.totalSource === 1 ? "" : "s"} from {sourceRange} into {targetRange}.
      </p>

      {breakdown.totalSkipped === 0 ? null : (
        <div
          style={{
            display: "grid",
            gap: 16,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          {Array.from(skippedByReason.entries()).map(([label, rows]) => (
            <section key={label}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {label} ({rows.length})
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 0,
                  borderTop: "1px solid var(--dg-color-border-light)",
                }}
              >
                {rows.map((row, index) => (
                  <li
                    key={`${row.employeeId}_${row.targetDate}_${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--dg-color-border-light)",
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-text-secondary)",
                    }}
                  >
                    <span>{nameByEmpId.get(row.employeeId) ?? "an employee"}</span>
                    <span>{formatShortDate(row.targetDate)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
