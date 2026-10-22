"use client";

import { describeApprovalDraftWarning } from "@dubgrid/domain";
import { SectionNotice } from "@/components/ui/SectionNotice";
import { fetchShiftRequestDraftCells } from "@/features/schedule/client/api";
import type { ShiftRequest } from "@/types";

/**
 * The warning lines for approving `request`, read before the confirmation
 * opens so it can never be approved ahead of its warning. An approval
 * publishes at once and replaces the earlier drafts of the days it publishes.
 */
export async function loadApprovalDraftWarning(
  orgId: string | null,
  request: Pick<
    ShiftRequest,
    "id" | "requesterEmpId" | "requesterName" | "targetEmpId" | "targetName"
  >,
): Promise<string[]> {
  const cells = orgId ? await fetchShiftRequestDraftCells(request.id, orgId) : null;
  return describeApprovalDraftWarning(request, cells);
}

export function ApprovalDraftWarning({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3">
      <SectionNotice messages={lines} tone="warning" />
    </div>
  );
}
