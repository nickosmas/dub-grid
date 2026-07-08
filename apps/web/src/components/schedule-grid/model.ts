"use client";

import type React from "react";

import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  CoverageRequirement,
  Department,
  DraftKind,
  Employee,
  FocusArea,
  GridCellId,
  GridColumnMeta,
  GridOpenShift,
  IndicatorType,
  JobDefinition,
  NamedItem,
  PublishChange,
  ScheduleCellInput,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
  ShiftJobSegment,
} from "@/types";

export interface ScheduleGridAccessors {
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  segmentsForKey?: (empId: string, date: Date) => ScheduleCellInput["segments"];
  publishedSegmentsForKey?: (
    empId: string,
    date: Date,
  ) => Array<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => {
    start: string;
    end: string;
    perPill?: { start: string; end: string }[];
  } | null;
  getPublishedCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => {
    start: string;
    end: string;
    perPill?: { start: string; end: string }[];
  } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  fromRecurringForKey?: (empId: string, date: Date) => boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  hasTimeChangesForKey?: (empId: string, date: Date) => boolean;
  publishDiffForKey?: (
    empId: string,
    date: Date,
  ) => (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
}

export interface ScheduleGridOptions {
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  isCellInteractive: boolean;
  canDragShifts: boolean;
  shiftDisplayMode: ShiftDisplayMode;
  showDiffOverlay: boolean;
  showPublishDiffOverlay: boolean;
  showAudit: boolean;
}

export interface ScheduleGridSectionModel {
  sectionId: number;
  sectionName: string;
  departmentId: number;
  exclusiveCodeIds: Set<number>;
  employees: Employee[];
  openShifts: GridOpenShift[];
}

export interface ScheduleGridDepartmentModel {
  department: Department;
  sections: ScheduleGridSectionModel[];
}

export interface ScheduleGridModel {
  spanWeeks: 1 | 2;
  activeFocusArea: number | null;
  today: Date;
  todayKey: string;
  columns: GridColumnMeta[];
  week1: Date[];
  week2: Date[];
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  departments: ScheduleGridDepartmentModel[];
  focusAreas: FocusArea[];
  departmentsById: Map<number, Department>;
  focusAreasById: Map<number, FocusArea>;
  assignments: AssignmentDefinition[];
  historicalAssignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  openShifts: GridOpenShift[];
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  recentlyPublishedKeys?: Set<string>;
  cellLocks?: Map<string, { userName: string }>;
  resolvePublisherName?: (userId: string) => string | null;
  accessors: ScheduleGridAccessors;
  options: ScheduleGridOptions;
  hasOpenShifts: boolean;
  hasStackedCellContent: boolean;
}

export interface ScheduleGridInteractionState {
  activeCellId: GridCellId | null;
  contextMenuCellId: GridCellId | null;
  hasClipboard: boolean;
  bulkDeleteMode?: boolean;
  bulkSelectedCellKeys?: Set<string>;
  bulkSelectableCellKeys?: Set<string>;
}

export interface ScheduleGridActivateArgs {
  cellId: GridCellId;
  emp: Employee;
  date: Date;
  trigger: "click" | "keyboard";
}

export interface ScheduleGridOpenMenuArgs {
  event: React.MouseEvent | React.KeyboardEvent;
  anchorEl: HTMLElement;
  cellId: GridCellId;
  emp: Employee;
  date: Date;
  trigger: "contextmenu" | "keyboard";
}

export interface ScheduleGridMoveEntryArgs {
  sourceCellId: GridCellId;
  targetCellId: GridCellId;
  payload: ScheduleCellInput;
  mode: "move" | "copy";
}

export interface ScheduleGridHandlers {
  onActivateCell: (args: ScheduleGridActivateArgs) => void;
  onOpenCellMenu?: (args: ScheduleGridOpenMenuArgs) => void;
  onMoveEntry?: (args: ScheduleGridMoveEntryArgs) => void;
  onCopyCell?: (cellId: GridCellId) => void;
  onPasteCell?: (cellId: GridCellId) => void;
  onClearCell?: (cellId: GridCellId) => void;
  onToggleBulkDeleteCell?: (cellId: GridCellId) => void;
  onClaimOpenShift?: (openShift: GridOpenShift) => void;
}

export interface BuildScheduleGridModelInput {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  week1: Date[];
  week2: Date[];
  spanWeeks: 1 | 2;
  today: Date;
  focusAreas: FocusArea[];
  departments: Department[];
  assignments: AssignmentDefinition[];
  historicalAssignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs?: JobDefinition[];
  indicatorTypes?: IndicatorType[];
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  recentlyPublishedKeys?: Set<string>;
  cellLocks?: Map<string, { userName: string }>;
  resolvePublisherName?: (userId: string) => string | null;
  openShifts?: GridOpenShift[];
  activeFocusArea?: number | null;
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  isCellInteractive?: boolean;
  canDragShifts?: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
  showDiffOverlay?: boolean;
  showPublishDiffOverlay?: boolean;
  showAudit?: boolean;
  accessors: ScheduleGridAccessors;
}

function cellNeedsLayoutStack(args: { draftKind: DraftKind; showDiffOverlay: boolean }): boolean {
  const { draftKind, showDiffOverlay } = args;
  return showDiffOverlay && !!draftKind && draftKind !== "deleted";
}

export function buildScheduleGridModel({
  filteredEmployees,
  allEmployees,
  week1,
  week2,
  spanWeeks,
  today,
  focusAreas,
  departments,
  assignments,
  shiftCategories,
  jobs = [],
  historicalAssignments = [],
  indicatorTypes = [],
  certifications = [],
  orgRoles = [],
  coverageRequirements,
  absenceTypeMap,
  recentlyPublishedKeys,
  cellLocks,
  resolvePublisherName,
  openShifts = [],
  activeFocusArea = null,
  highlightEmpIds,
  highlightScrollKey,
  isCellInteractive = true,
  canDragShifts = isCellInteractive,
  shiftDisplayMode = "code",
  showDiffOverlay = false,
  showPublishDiffOverlay,
  showAudit = false,
  accessors,
}: BuildScheduleGridModelInput): ScheduleGridModel {
  const allDates = spanWeeks === 2 ? [...week1, ...week2] : week1;
  const todayKey = formatDateKey(today);
  const columns = allDates.map((date, columnIndex): GridColumnMeta => ({
    columnIndex,
    date,
    dateKey: formatDateKey(date),
    isToday: formatDateKey(date) === todayKey,
    isWeekSplitStart: spanWeeks === 2 && columnIndex === 7,
  }));

  const departmentsById = new Map(departments.map((dept) => [dept.id, dept]));
  const focusAreasById = new Map(focusAreas.map((fa) => [fa.id, fa]));
  const openShiftSectionIds = new Set(openShifts.map((shift) => shift.focusAreaId));
  const assignmentLookupById = new Map<number, AssignmentDefinition>();
  for (const assignment of historicalAssignments) {
    assignmentLookupById.set(assignment.id, assignment);
  }
  for (const assignment of assignments) {
    assignmentLookupById.set(assignment.id, assignment);
  }

  const scheduledDepartments = departments
    .filter((dept) => dept.type === "scheduled")
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const departmentGroups = scheduledDepartments.map((department) => ({
    department,
    focusAreas: focusAreas
      .filter((focusArea) => focusArea.departmentId === department.id)
      .sort((left, right) => left.sortOrder - right.sortOrder),
  }));

  const orphanedFocusAreas = focusAreas.filter((focusArea) => !focusArea.departmentId);
  if (orphanedFocusAreas.length > 0) {
    departmentGroups.push({
      department: {
        id: -1,
        orgId: "",
        name: "Ungrouped",
        abbr: "",
        type: "scheduled",
        sortOrder: 999,
      },
      focusAreas: orphanedFocusAreas.sort((left, right) => left.sortOrder - right.sortOrder),
    });
  }

  const filteredDepartmentGroups =
    activeFocusArea == null
      ? departmentGroups
      : departmentGroups
          .map(({ department, focusAreas: departmentFocusAreas }) => ({
            department,
            focusAreas: departmentFocusAreas.filter(
              (focusArea) => focusArea.id === activeFocusArea,
            ),
          }))
          .filter(({ focusAreas: departmentFocusAreas }) => departmentFocusAreas.length > 0);

  const exclusiveCodeIdsBySection = new Map<number, Set<number>>();
  for (const focusArea of focusAreas) {
    exclusiveCodeIdsBySection.set(
      focusArea.id,
      new Set(
        assignments
          .filter((assignment) => assignment.focusAreaId === focusArea.id)
          .map((assignment) => assignment.id),
      ),
    );
  }

  const sectionHasVisibleContent = (focusArea: FocusArea, exclusiveCodeIds: Set<number>) => {
    if (openShiftSectionIds.has(focusArea.id)) {
      return true;
    }

    const rawHomeEmployees = filteredEmployees.filter((employee) =>
      employee.focusAreaIds.includes(focusArea.id),
    );
    const homeEmployees = isCellInteractive
      ? rawHomeEmployees
      : rawHomeEmployees.filter((employee) =>
          allDates.some((date) => {
            const codeIds = accessors.assignmentIdsForKey?.(employee.id, date) ?? [];
            return codeIds.some((codeId) => {
              if (exclusiveCodeIds.has(codeId)) return true;
              return assignmentLookupById.get(codeId)?.focusAreaId == null;
            });
          }),
        );

    const guestEmployees = allEmployees.filter(
      (employee) =>
        employee.focusAreaIds.length > 0 &&
        !employee.focusAreaIds.includes(focusArea.id) &&
        allDates.some((date) => {
          const codeIds = accessors.assignmentIdsForKey?.(employee.id, date) ?? [];
          return codeIds.some((codeId) => exclusiveCodeIds.has(codeId));
        }),
    );

    return homeEmployees.length > 0 || guestEmployees.length > 0;
  };

  const departmentsModel: ScheduleGridDepartmentModel[] = filteredDepartmentGroups
    .map(({ department, focusAreas: departmentFocusAreas }) => ({
      department,
      sections: departmentFocusAreas
        .filter((focusArea) =>
          sectionHasVisibleContent(
            focusArea,
            exclusiveCodeIdsBySection.get(focusArea.id) ?? new Set<number>(),
          ),
        )
        .map((focusArea) => {
          const exclusiveCodeIds = exclusiveCodeIdsBySection.get(focusArea.id) ?? new Set<number>();
          const rawHomeEmployees = filteredEmployees.filter((employee) =>
            employee.focusAreaIds.includes(focusArea.id),
          );
          const homeEmployees = isCellInteractive
            ? rawHomeEmployees
            : rawHomeEmployees.filter((employee) =>
                allDates.some((date) => {
                  const codeIds = accessors.assignmentIdsForKey?.(employee.id, date) ?? [];
                  return codeIds.some((codeId) => {
                    if (exclusiveCodeIds.has(codeId)) return true;
                    return assignmentLookupById.get(codeId)?.focusAreaId == null;
                  });
                }),
              );
          const guestEmployees = allEmployees.filter(
            (employee) =>
              employee.focusAreaIds.length > 0 &&
              !employee.focusAreaIds.includes(focusArea.id) &&
              allDates.some((date) => {
                const codeIds = accessors.assignmentIdsForKey?.(employee.id, date) ?? [];
                return codeIds.some((codeId) => exclusiveCodeIds.has(codeId));
              }),
          );

          return {
            sectionId: focusArea.id,
            sectionName: focusArea.name,
            departmentId: department.id,
            exclusiveCodeIds,
            employees: [...homeEmployees, ...guestEmployees],
            openShifts: openShifts.filter((openShift) => openShift.focusAreaId === focusArea.id),
          };
        }),
    }))
    .filter(({ sections }) => sections.length > 0);

  const hasStackedCellContent =
    spanWeeks === 2 &&
    departmentsModel.some(({ sections }) =>
      sections.some(({ employees }) =>
        employees.some((employee) =>
          allDates.some((date) =>
            cellNeedsLayoutStack({
              draftKind: accessors.draftKindForKey?.(employee.id, date) ?? null,
              showDiffOverlay,
            }),
          ),
        ),
      ),
    );

  return {
    spanWeeks,
    activeFocusArea,
    today,
    todayKey,
    columns,
    week1,
    week2,
    filteredEmployees,
    allEmployees,
    departments: departmentsModel,
    focusAreas,
    departmentsById,
    focusAreasById,
    assignments,
    historicalAssignments,
    shiftCategories,
    jobs,
    indicatorTypes,
    certifications,
    orgRoles,
    openShifts,
    coverageRequirements,
    absenceTypeMap,
    recentlyPublishedKeys,
    cellLocks,
    resolvePublisherName,
    accessors,
    options: {
      highlightEmpIds,
      highlightScrollKey,
      isCellInteractive,
      canDragShifts,
      shiftDisplayMode,
      showDiffOverlay,
      showPublishDiffOverlay: showPublishDiffOverlay ?? showDiffOverlay,
      showAudit,
    },
    hasOpenShifts: openShifts.length > 0,
    hasStackedCellContent,
  };
}
