// Canonical shift-duration-hours calculation — the exact algorithm web's
// dashboard has always used (3-level fallback: per-assignment override time
// → shift-category default time → duration-only fields; plus pipe-delimited
// per-segment custom-time parsing for split shifts). Mobile's own copy of
// this (packages/mobile-api-core/src/dashboard.ts's old computeStaffHoursForPeriod)
// only ever read shift-category times directly — no assignment-level
// override, no duration-only fallback, no multi-segment custom-time parsing
// — so it silently computed lower hours than web for any org using those,
// undercounting who crossed the overtime threshold. Both platforms now call
// this one function instead of maintaining that logic twice.

export type HoursAssignmentLike = {
  id: number;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  defaultDurationHours?: number | null;
  defaultDurationMinutes?: number | null;
  categoryId?: number | null;
};

export type HoursShiftCategoryLike = {
  id: number;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
};

/**
 * Canonical (shiftId, jobId) pair key, matching web's
 * apps/web/src/lib/shift-job-segments.ts buildShiftJobPairKey — used to
 * resolve a raw schedule segment to the assignment definition that carries
 * its default hours/duration when only shiftId+jobId are stored (mobile's
 * schedule_cell_segments), not an assignmentId directly.
 */
export function buildShiftJobPairKey(shiftId: number | null, jobId: number): string {
  return `${shiftId ?? "null"}:${jobId}`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function durationHoursFromTimes(startTime: string, endTime: string): number {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  const mins = e > s ? e - s : 1440 - s + e; // handles overnight shifts
  return mins / 60;
}

function resolveBreakMinutes<A extends HoursAssignmentLike>(
  assignment: A,
  categoryById: Map<number, HoursShiftCategoryLike>,
): number {
  if (assignment.categoryId != null) {
    const cat = categoryById.get(assignment.categoryId);
    if (cat?.breakMinutes != null) return cat.breakMinutes;
  }
  return 0;
}

/**
 * Computes worked hours for one day's assignment IDs, honoring custom
 * (per-segment, pipe-delimited) time overrides when present, otherwise
 * falling back per assignment: its own default start/end time, then its
 * shift category's default start/end time, then a flat duration field.
 */
export function computeShiftSegmentHours<A extends HoursAssignmentLike>(
  assignmentIds: number[],
  assignmentById: Map<number, A>,
  customStartTime: string | null | undefined,
  customEndTime: string | null | undefined,
  categoryById: Map<number, HoursShiftCategoryLike>,
): number {
  if (customStartTime && customEndTime) {
    // Pipe-delimited per-segment custom times (e.g. "07:00|09:00" for a
    // split shift) — each pipe-position pairs with the assignment at the
    // same index.
    const starts = customStartTime.split("|");
    const ends = customEndTime.split("|");
    if (starts.length > 1 || ends.length > 1) {
      let total = 0;
      for (let i = 0; i < Math.max(starts.length, ends.length); i++) {
        const s = starts[i] || "";
        const e = ends[i] || "";
        const assignment =
          assignmentIds[i] != null ? assignmentById.get(assignmentIds[i]) : undefined;
        if (s && e) {
          let h = durationHoursFromTimes(s, e);
          if (assignment) h = Math.max(0, h - resolveBreakMinutes(assignment, categoryById) / 60);
          total += h;
        } else if (assignment?.defaultStartTime && assignment.defaultEndTime) {
          let h = durationHoursFromTimes(assignment.defaultStartTime, assignment.defaultEndTime);
          h = Math.max(0, h - resolveBreakMinutes(assignment, categoryById) / 60);
          total += h;
        }
      }
      return total;
    }

    let hours = durationHoursFromTimes(customStartTime, customEndTime);
    for (const assignmentId of assignmentIds) {
      const assignment = assignmentById.get(assignmentId);
      if (assignment) {
        hours = Math.max(0, hours - resolveBreakMinutes(assignment, categoryById) / 60);
        break;
      }
    }
    return hours;
  }

  let total = 0;
  for (const assignmentId of assignmentIds) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;

    if (assignment.defaultStartTime && assignment.defaultEndTime) {
      // Level 2: assignment-level override time.
      let hours = durationHoursFromTimes(assignment.defaultStartTime, assignment.defaultEndTime);
      hours = Math.max(0, hours - resolveBreakMinutes(assignment, categoryById) / 60);
      total += hours;
    } else if (assignment.categoryId != null) {
      // Level 1: fall back to the shift category's default time.
      const cat = categoryById.get(assignment.categoryId);
      if (cat?.startTime && cat?.endTime) {
        let hours = durationHoursFromTimes(cat.startTime, cat.endTime);
        hours = Math.max(0, hours - resolveBreakMinutes(assignment, categoryById) / 60);
        total += hours;
      }
    } else if (
      assignment.defaultDurationHours != null ||
      assignment.defaultDurationMinutes != null
    ) {
      // Level 3: duration-only codes with no start/end time at all.
      let hours =
        (assignment.defaultDurationHours ?? 0) + (assignment.defaultDurationMinutes ?? 0) / 60;
      hours = Math.max(0, hours - resolveBreakMinutes(assignment, categoryById) / 60);
      total += hours;
    }
  }
  return total;
}
