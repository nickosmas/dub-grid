import { scheduleCellStateSchema, type ScheduleCellState } from "@dubgrid/contracts";
import {
  cellStateToChangeDay,
  describeShiftChange,
  type ShiftChange,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";

interface ShiftAuditRow {
  orgId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
}

function readState(value: unknown): ScheduleCellState | null | undefined {
  if (value == null) return null;
  const parsed = scheduleCellStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The cell's date, the part of `emp:date` after the employee id. */
function cellDate(resourceId: string | null): string | null {
  const date = resourceId?.split(":").at(-1) ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * The Before and After a schedule edit recorded (item 46h). A move shows the
 * day it landed on. Null for rows saved before the edit recorded its earlier
 * state, and for anything that is not a single-cell edit.
 */
export function shiftChangeForAuditRow(
  row: ShiftAuditRow,
  resolvers: ShiftChangeResolvers,
): ShiftChange | null {
  if (row.resourceType !== "shift" || !("before" in row.details)) return null;
  const moved = row.action === "shift.moved";
  const date = moved
    ? cellDate(`:${String(row.details.targetDate ?? "")}`)
    : cellDate(row.resourceId);
  const before = readState(moved ? row.details.targetBefore : row.details.before);
  const after = row.action === "shift.deleted" ? null : readState(row.details.input);
  if (!date || before === undefined || after === undefined) return null;
  return describeShiftChange(
    cellStateToChangeDay(before, resolvers),
    cellStateToChangeDay(after, resolvers),
    { date },
  );
}

/** Adds each schedule edit's Before and After, loading each organization's names once. */
export async function withShiftChanges<TEntry extends ShiftAuditRow>(
  entries: TEntry[],
  loadResolvers: (orgId: string) => Promise<ShiftChangeResolvers>,
): Promise<Array<TEntry & { shiftChange?: ShiftChange | null }>> {
  const byOrg = new Map<string, Promise<ShiftChangeResolvers>>();
  return Promise.all(
    entries.map(async (entry) => {
      if (!entry.orgId || entry.resourceType !== "shift" || !("before" in entry.details)) {
        return entry;
      }
      if (!byOrg.has(entry.orgId)) byOrg.set(entry.orgId, loadResolvers(entry.orgId));
      const resolvers = await byOrg.get(entry.orgId)!;
      return { ...entry, shiftChange: shiftChangeForAuditRow(entry, resolvers) };
    }),
  );
}
