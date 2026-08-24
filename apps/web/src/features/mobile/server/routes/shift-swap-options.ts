import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  mobileShiftSwapOptionsQuerySchema,
  mobileShiftSwapOptionsResponseSchema,
  normalizeMobileScheduleRange,
  type MobileScheduleEntry,
} from "@dubgrid/contracts";
import { timesOverlap, type TimeRange } from "@dubgrid/schedule-core";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileScheduleEntries,
  requireMobileAuth,
} from "@/features/mobile/server";

export const dynamic = "force-dynamic";

function toTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): TimeRange | null {
  const normalizedStart = start?.slice(0, 5) ?? null;
  const normalizedEnd = end?.slice(0, 5) ?? null;

  if (!normalizedStart || !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

function getEntryTimeRanges(entry: MobileScheduleEntry): TimeRange[] {
  if (entry.state.kind !== "worked") {
    return [];
  }

  const segmentRanges = entry.presentation.segments.flatMap((segment) => {
    const range = toTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toTimeRange(entry.presentation.startTime, entry.presentation.endTime);

  return presentationRange ? [presentationRange] : [];
}

function getRequiredFocusAreaIds(entry: MobileScheduleEntry): number[] {
  const ids = new Set<number>();
  if (entry.presentation.focusAreaId != null) {
    ids.add(entry.presentation.focusAreaId);
  }
  for (const segment of entry.presentation.segments) {
    if (segment.focusAreaId != null) {
      ids.add(segment.focusAreaId);
    }
  }
  return [...ids];
}

function canWorkRequiredFocusAreas(
  employeeFocusAreaIds: readonly number[],
  requiredFocusAreaIds: readonly number[],
): boolean {
  return requiredFocusAreaIds.every((id) => employeeFocusAreaIds.includes(id));
}

function isWorkedShiftEntry(entry: MobileScheduleEntry): boolean {
  return (
    entry.state.kind === "worked" && entry.state.segments.some((segment) => segment.shiftId != null)
  );
}

function buildEntriesByEmployeeAndDate(entries: MobileScheduleEntry[]) {
  const byKey = new Map<string, MobileScheduleEntry>();
  for (const entry of entries) {
    byKey.set(`${entry.employeeId}:${entry.date}`, entry);
  }
  return byKey;
}

function getSwapOptions(input: {
  requesterEntry: MobileScheduleEntry;
  entries: MobileScheduleEntry[];
}): MobileScheduleEntry[] {
  const entriesByEmployeeDate = buildEntriesByEmployeeAndDate(input.entries);
  const requesterRanges = getEntryTimeRanges(input.requesterEntry);
  const requesterRequiredFocusAreaIds = getRequiredFocusAreaIds(input.requesterEntry);

  return input.entries.filter((entry) => {
    if (
      entry.employeeId === input.requesterEntry.employeeId ||
      !isWorkedShiftEntry(entry) ||
      !canWorkRequiredFocusAreas(
        input.requesterEntry.employeeFocusAreaIds,
        getRequiredFocusAreaIds(entry),
      ) ||
      !canWorkRequiredFocusAreas(entry.employeeFocusAreaIds, requesterRequiredFocusAreaIds)
    ) {
      return false;
    }

    const targetRanges = getEntryTimeRanges(entry);
    if (entry.date === input.requesterEntry.date) {
      return !timesOverlap(requesterRanges, targetRanges);
    }

    const requesterExistingTargetDateEntry =
      entriesByEmployeeDate.get(`${input.requesterEntry.employeeId}:${entry.date}`) ?? null;
    if (
      requesterExistingTargetDateEntry &&
      timesOverlap(getEntryTimeRanges(requesterExistingTargetDateEntry), targetRanges)
    ) {
      return false;
    }

    const targetExistingRequesterDateEntry =
      entriesByEmployeeDate.get(`${entry.employeeId}:${input.requesterEntry.date}`) ?? null;
    if (
      targetExistingRequesterDateEntry &&
      timesOverlap(getEntryTimeRanges(targetExistingRequesterDateEntry), requesterRanges)
    ) {
      return false;
    }

    return true;
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const queryResult = mobileShiftSwapOptionsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryResult.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  let range: { startDate: string; endDate: string };
  try {
    range = normalizeMobileScheduleRange(queryResult.data);
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  const linkedEmployee = await fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );
  const canCreateForEmployee =
    linkedEmployee?.id === queryResult.data.requesterEmpId ||
    auth.permissions.canEditShifts ||
    auth.permissions.canApproveShiftRequests ||
    auth.permissions.canManageEmployees;

  if (!canCreateForEmployee) {
    return NextResponse.json(
      { error: "You don't have permission to view those swap options." },
      { status: 403 },
    );
  }

  const entries = await fetchMobileScheduleEntries(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    ...range,
  });
  const requesterEntry =
    entries.find(
      (entry) =>
        entry.employeeId === queryResult.data.requesterEmpId &&
        entry.date === queryResult.data.requesterShiftDate,
    ) ?? null;

  const options = requesterEntry ? getSwapOptions({ requesterEntry, entries }) : [];

  return NextResponse.json(
    mobileShiftSwapOptionsResponseSchema.parse({
      range,
      entries: options,
    }),
  );
}
