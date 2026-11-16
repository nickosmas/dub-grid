import { formatScheduleTimeValue, type CoverageCategorySnapshot } from "@dubgrid/schedule-core";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import { getReadableTextColor } from "@/lib/colors";
import { formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import type {
  AssignmentDefinition,
  DraftKind,
  Employee,
  FocusArea,
  GridOpenShift,
  RequestWaitingOn,
  ShiftCategory,
} from "@/types";

const EPSILON = 1e-6;
/** A required shift nobody works yet, whose shift has no color of its own. */
const UNSTAFFED_SHIFT_COLOR = "#E5E7EB";

/** The month as calendar weeks, Sunday first; days outside it are null. */
export function buildMonthWeeks(monthStart: Date): (Date | null)[][] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(new Date(year, month, 1).getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A coverage count as the Schedule Builder states it: whole, or up to two decimals with mentored credit. */
export function formatCoverageCount(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** A shift's hours; one that ends at or before it starts names both days. */
export function formatShiftHours(
  start: string | null | undefined,
  end: string | null | undefined,
  date: Date,
): string | null {
  if (!start || !end) return null;
  const startText = formatScheduleTimeValue(start);
  const endText = formatScheduleTimeValue(end);
  if (end.slice(0, 5) > start.slice(0, 5)) return `${startText} - ${endText}`;
  const weekday = (offset: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).toLocaleDateString(
      "en-US",
      { weekday: "short" },
    );
  return `${weekday(0)} ${startText} - ${weekday(1)} ${endText}`;
}

export interface MonthRequest {
  waitingOn: RequestWaitingOn;
  status: string;
}

export interface MonthPersonRow {
  empId: string;
  name: string;
  /** The shift's label as the grid writes it. */
  label: string;
  style: AssignmentDefinition;
  draftKind: DraftKind;
  isHighlighted: boolean;
  marks: ScheduleNoteMark[];
  request: MonthRequest | null;
}

export interface MonthCoverageLine {
  label: string;
  actual: number;
  required: number;
  /** Required minus actual when short, else 0. */
  short: number;
}

export interface MonthShiftGroup {
  key: string;
  code: string;
  name: string;
  hours: string | null;
  color: string;
  text: string;
  people: MonthPersonRow[];
  coverage: MonthCoverageLine[];
  short: number;
}

export interface MonthArea {
  focusAreaId: number;
  name: string;
  groups: MonthShiftGroup[];
}

export interface MonthOpenShift {
  id: string;
  label: string;
  areaName: string;
  hours: string | null;
  detail: string | null;
}

export interface MonthOffRow {
  empId: string;
  name: string;
  absence: string;
  /** The organization's day off absence: a planned day off, not time missed. */
  isDayOff: boolean;
  isHighlighted: boolean;
}

export interface MonthAbsence {
  name: string;
  isDayOff: boolean;
}

export interface MonthDay {
  date: Date;
  dateKey: string;
  isToday: boolean;
  isPast: boolean;
  areas: MonthArea[];
  openShifts: MonthOpenShift[];
  off: MonthOffRow[];
  /** Absences other than the day off absence. */
  absent: number;
  /** People with a waiting request that day and no shift listed, so the panel still names them. */
  otherRequests: { empId: string; name: string; request: MonthRequest }[];
  working: number;
  short: number;
  hasDraft: boolean;
  waitingOn: RequestWaitingOn | null;
  hasHighlighted: boolean;
}

export interface MonthDayInput {
  date: Date;
  todayKey: string;
  employees: Employee[];
  focusAreas: FocusArea[];
  activeFocusArea: number | null;
  categoryById: Map<number, ShiftCategory>;
  assignmentById: Map<number, AssignmentDefinition>;
  highlightEmpIds?: Set<string>;
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  /** The day's whole-day absence in the schedule shown (the draft, for editors). */
  absenceForKey?: (empId: string, date: Date) => MonthAbsence | null;
  getShiftStyle: (label: string, focusAreaName?: string) => AssignmentDefinition;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  requestForKey?: (empId: string, date: Date) => MonthRequest | null;
  /** This day's open shifts the viewer may see. */
  openShifts: GridOpenShift[];
  /** This day's coverage, or null when the viewer doesn't see staffing. */
  coverage: CoverageCategorySnapshot[] | null;
  /** Each job's place from most senior down; people on a more senior job list first. */
  jobSeniority?: Map<number, number>;
}

/** Stable, so people on the same job keep the staff order they arrived in. */
function sortPeopleByJob(
  people: MonthPersonRow[],
  jobSeniority: Map<number, number> | undefined,
): MonthPersonRow[] {
  if (!jobSeniority) return people;
  const placeOf = (row: MonthPersonRow) =>
    (row.style.jobId != null ? jobSeniority.get(row.style.jobId) : undefined) ??
    Number.MAX_SAFE_INTEGER;
  return [...people].sort((a, b) => placeOf(a) - placeOf(b));
}

const shiftKeyOf = (style: AssignmentDefinition): number | null =>
  style.shiftId ?? style.categoryId ?? null;

interface GroupDraft extends MonthShiftGroup {
  sortOrder: number;
}

export function buildMonthDay(input: MonthDayInput): MonthDay {
  const { date, focusAreas, categoryById, activeFocusArea } = input;
  const dateKey = formatDateKey(date);
  const areaById = new Map(focusAreas.map((area) => [area.id, area]));
  const isAreaVisible = (id: number) => activeFocusArea === null || id === activeFocusArea;
  const groupsByArea = new Map<number, Map<string, GroupDraft>>();
  const off: MonthOffRow[] = [];
  const otherRequests: MonthDay["otherRequests"] = [];
  let hasDraft = false;
  let hasManagerRequest = false;
  let hasTeammateRequest = false;
  let hasHighlighted = false;

  const groupFor = (
    areaId: number,
    key: string,
    seed: () => Omit<GroupDraft, "people" | "coverage" | "short" | "key">,
  ) => {
    const groups = groupsByArea.get(areaId) ?? new Map<string, GroupDraft>();
    groupsByArea.set(areaId, groups);
    let group = groups.get(key);
    if (!group) {
      group = { key, people: [], coverage: [], short: 0, ...seed() };
      groups.set(key, group);
    }
    return group;
  };

  const groupSeed = (shiftId: number | null, label: string, style: AssignmentDefinition) => () => {
    const category = shiftId != null ? categoryById.get(shiftId) : undefined;
    return {
      code: category?.abbr || label,
      name: category?.name ?? style.name ?? label,
      hours: formatShiftHours(
        category?.startTime ?? style.defaultStartTime,
        category?.endTime ?? style.defaultEndTime,
        date,
      ),
      color: style.color,
      text: style.text,
      sortOrder: category?.sortOrder ?? 99,
    };
  };

  for (const emp of input.employees) {
    const isHighlighted = input.highlightEmpIds?.has(emp.id) ?? false;
    const draftKind = input.draftKindForKey?.(emp.id, date) ?? null;
    if (draftKind) hasDraft = true;
    const request = input.requestForKey?.(emp.id, date) ?? null;
    if (request?.waitingOn === "manager") hasManagerRequest = true;
    else if (request) hasTeammateRequest = true;

    const combined = input.shiftForKey(emp.id, date);
    const name = getEmployeeDisplayName(emp);
    if (!combined || combined === "OFF") {
      if (request) otherRequests.push({ empId: emp.id, name, request });
      continue;
    }
    const absence = input.absenceForKey?.(emp.id, date) ?? null;
    if (absence) {
      off.push({
        empId: emp.id,
        name,
        absence: absence.name,
        isDayOff: absence.isDayOff,
        isHighlighted,
      });
      if (isHighlighted) hasHighlighted = true;
      if (request) otherRequests.push({ empId: emp.id, name, request });
      continue;
    }

    const homeArea = focusAreas.find((area) => emp.focusAreaIds.includes(area.id));
    const ids = input.assignmentIdsForKey?.(emp.id, date) ?? [];
    let listed = false;
    combined.split("/").forEach((label, index) => {
      const style =
        (ids[index] != null ? input.assignmentById.get(ids[index]) : undefined) ??
        input.getShiftStyle(label, homeArea?.name);
      // A general code counts under the person's primary area only, so a
      // person in two areas isn't counted twice.
      const area = style.focusAreaId != null ? areaById.get(style.focusAreaId) : homeArea;
      if (!area || !isAreaVisible(area.id)) return;
      const shiftId = shiftKeyOf(style);
      const key = shiftId != null ? `shift:${shiftId}` : `label:${label}`;
      groupFor(area.id, key, groupSeed(shiftId, label, style)).people.push({
        empId: emp.id,
        name,
        label,
        style,
        draftKind,
        isHighlighted,
        marks: [],
        request,
      });
      listed = true;
      if (isHighlighted) hasHighlighted = true;
    });
    if (!listed && request) otherRequests.push({ empId: emp.id, name, request });
  }

  const isPast = dateKey < input.todayKey;
  // Past days are finished; a shortage there is history, not something to fix.
  if (input.coverage && !isPast) {
    for (const snapshot of input.coverage) {
      if (!snapshot.status.hasRequirement || !isAreaVisible(snapshot.focusAreaId)) continue;
      if (!areaById.has(snapshot.focusAreaId)) continue;
      const category = categoryById.get(snapshot.shiftCategoryId);
      const group = groupFor(snapshot.focusAreaId, `shift:${snapshot.shiftCategoryId}`, () => ({
        code: category?.abbr || snapshot.shiftCategoryName,
        name: snapshot.shiftCategoryName,
        hours: formatShiftHours(category?.startTime, category?.endTime, date),
        color: category?.color ?? UNSTAFFED_SHIFT_COLOR,
        text: getReadableTextColor(category?.color ?? UNSTAFFED_SHIFT_COLOR),
        sortOrder: category?.sortOrder ?? 99,
      }));
      const { actual, required } = snapshot.status;
      const short = actual < required - EPSILON ? required - actual : 0;
      group.coverage.push({ label: snapshot.rowLabel, actual, required, short });
      group.short += short;
    }
  }

  const areas: MonthArea[] = focusAreas.flatMap((area) => {
    const groups = groupsByArea.get(area.id);
    if (!groups) return [];
    const sorted = [...groups.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ sortOrder: _sortOrder, ...group }) => ({
        ...group,
        people: sortPeopleByJob(group.people, input.jobSeniority),
      }));
    return [{ focusAreaId: area.id, name: area.name, groups: sorted }];
  });

  if (input.noteMarksForKey) attachNoteMarks(areas, input, date);

  const working = new Set(
    areas.flatMap((area) => area.groups.flatMap((g) => g.people.map((p) => p.empId))),
  ).size;
  const short = areas.reduce(
    (sum, area) => sum + area.groups.reduce((total, g) => total + g.short, 0),
    0,
  );

  const openShifts = input.openShifts
    .filter((shift) => shift.date === dateKey && isAreaVisible(shift.focusAreaId))
    .map((shift) => openShiftRow(shift, input, date));

  return {
    date,
    dateKey,
    isToday: dateKey === input.todayKey,
    isPast,
    areas,
    openShifts,
    off,
    absent: off.filter((row) => !row.isDayOff).length,
    otherRequests,
    working,
    short,
    hasDraft,
    waitingOn: hasManagerRequest ? "manager" : hasTeammateRequest ? "teammate" : null,
    hasHighlighted,
  };
}

function openShiftRow(shift: GridOpenShift, input: MonthDayInput, date: Date): MonthOpenShift {
  const style =
    shift.assignmentIds[0] != null ? input.assignmentById.get(shift.assignmentIds[0]) : undefined;
  const shiftId = style ? shiftKeyOf(style) : null;
  const category = shiftId != null ? input.categoryById.get(shiftId) : undefined;
  const hours =
    formatShiftHours(shift.customStartTime, shift.customEndTime, date) ??
    formatShiftHours(
      category?.startTime ?? style?.defaultStartTime,
      category?.endTime ?? style?.defaultEndTime,
      date,
    );
  const detail = shift.claimedBy
    ? `Claimed by ${shift.claimedBy}`
    : shift.calledOffBy
      ? `Called off by ${shift.calledOffBy}`
      : null;
  return {
    id: shift.id,
    label: shift.assignmentFullName ?? shift.assignmentLabel,
    areaName: input.focusAreas.find((area) => area.id === shift.focusAreaId)?.name ?? "",
    hours,
    detail,
  };
}

/**
 * A person's notes belong to their day in a focus area, not to each shift
 * there, so they show on their first row in each area. A note filed under
 * another of their areas, where they have no row that day, or under none,
 * joins their first visible row, one mark per note type (F-82, F-106).
 */
function attachNoteMarks(areas: MonthArea[], input: MonthDayInput, date: Date) {
  const noteMarksForKey = input.noteMarksForKey!;
  const firstRowByEmp = new Map<string, MonthPersonRow>();
  const areasWithRowByEmp = new Map<string, Set<number>>();
  for (const area of areas) {
    const marked = new Set<string>();
    for (const row of area.groups.flatMap((group) => group.people)) {
      if (marked.has(row.empId)) continue;
      marked.add(row.empId);
      row.marks = noteMarksForKey(row.empId, date, area.focusAreaId);
      if (!firstRowByEmp.has(row.empId)) firstRowByEmp.set(row.empId, row);
      const seen = areasWithRowByEmp.get(row.empId) ?? new Set<number>();
      seen.add(area.focusAreaId);
      areasWithRowByEmp.set(row.empId, seen);
    }
  }
  const employeeById = new Map(input.employees.map((emp) => [emp.id, emp]));
  firstRowByEmp.forEach((row, empId) => {
    const withRow = areasWithRowByEmp.get(empId);
    const otherAreaIds: (number | undefined)[] = [
      ...(employeeById.get(empId)?.focusAreaIds ?? []).filter((id) => !withRow?.has(id)),
      undefined,
    ];
    const seen = new Set(row.marks.map((mark) => mark.indicatorTypeId));
    for (const areaId of otherAreaIds) {
      for (const mark of noteMarksForKey(empId, date, areaId)) {
        if (seen.has(mark.indicatorTypeId)) continue;
        seen.add(mark.indicatorTypeId);
        row.marks.push(mark);
      }
    }
  });
}
