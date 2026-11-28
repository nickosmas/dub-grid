"use client";

import { describeApprovalDraftWarning } from "@dubgrid/domain";
import { describeApprovalWorkLimits } from "@dubgrid/schedule-core";
import { SectionNotice } from "@/components/ui/SectionNotice";
import {
  fetchShiftRequestDraftCells,
  fetchShiftRequestWorkLimits,
} from "@/features/schedule/client/api";
import type { ShiftRequest } from "@/types";

/**
 * The warning lines for approving `request`, read before the confirmation
 * opens so it can never be approved ahead of its warning. An approval
 * publishes at once and replaces the earlier drafts of the days it publishes,
 * and it may put the person who gets the shift over a work limit (60c), which
 * warns without blocking. A failed work-limit check adds nothing.
 */
export async function loadApprovalDraftWarning(
  orgId: string | null,
  request: Pick<
    ShiftRequest,
    "id" | "requesterEmpId" | "requesterName" | "targetEmpId" | "targetName"
  >,
): Promise<string[]> {
  if (!orgId) return describeApprovalDraftWarning(request, null);
  const [cells, workLimits] = await Promise.all([
    fetchShiftRequestDraftCells(request.id, orgId),
    fetchShiftRequestWorkLimits(request.id, orgId),
  ]);
  const people = workLimits ?? [];
  const names = new Map(people.map((person) => [person.employeeId, person.name]));
  return [
    ...describeApprovalDraftWarning(request, cells),
    ...describeApprovalWorkLimits(people, (id) => names.get(id) ?? "Someone"),
  ];
}

export function ApprovalDraftWarning({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 first:mt-0">
      <SectionNotice messages={lines} tone="warning" />
    </div>
  );
}
