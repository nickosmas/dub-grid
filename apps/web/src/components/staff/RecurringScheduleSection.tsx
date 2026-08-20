"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import { CloseButton } from "@/components/ui/CloseButton";
import { Popover, PopoverContent } from "@/components/ui/popover";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect, { type SelectOption } from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import ShiftPicker from "@/components/ShiftPicker";
import { BOX_SHADOW_CARD, DAY_LABELS } from "@/lib/constants";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import {
  borderColor,
  DESIGNATION_COLORS,
  DEFAULT_DESIG_COLOR,
  toDarkPillColors,
} from "@/lib/colors";
import {
  deleteRecurringDraft,
  deleteRecurringShift,
  fetchRecurringShifts,
  getRecurringDraft,
  saveRecurringDraft,
  upsertRecurringShift,
} from "@/features/schedule/client";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getCertAbbr, getEmployeeDisplayName } from "@/lib/utils";
import { useMediaQuery, MOBILE } from "@/hooks";
import { useCloseOnWindowResize, usePopupCornerAlign } from "@/hooks/useAnchoredPopup";
import type {
  AbsenceType,
  Employee,
  FocusArea,
  JobDefinition,
  NamedItem,
  RecurringScheduleDraft,
  ScheduleCellInput,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
  ShiftJobSegment,
} from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";

type ShiftCellPopoverProps = {
  anchorRef: HTMLElement | null;
  assignments: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  orgRoles?: NamedItem[];
  certifications?: NamedItem[];
  focusAreas: FocusArea[];
  currentSegments?: ShiftJobSegment[];
  onSelect: (input: ScheduleCellInput | null) => void;
  onClose: () => void;
  empFocusAreaIds: number[];
  empCertificationId?: number | null;
  empRoleIds?: number[];
  absenceTypes?: AbsenceType[];
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  currentAbsenceTypeId?: number | null;
  shiftDisplayMode?: ShiftDisplayMode;
  defaultShiftEnabled?: boolean;
};

function ShiftCellPopover({
  anchorRef,
  assignments,
  shiftCategories = [],
  jobs = [],
  orgRoles = [],
  certifications = [],
  focusAreas,
  currentSegments = [],
  onSelect,
  onClose,
  empFocusAreaIds,
  empCertificationId,
  empRoleIds,
  absenceTypes,
  onAbsenceSelect,
  currentAbsenceTypeId,
  shiftDisplayMode,
  defaultShiftEnabled = true,
}: ShiftCellPopoverProps) {
  const isMobileView = useMediaQuery(MOBILE);
  const {
    align: desktopAlign,
    alignOffset,
    sideOffset: desktopSideOffset,
    popupRef,
  } = usePopupCornerAlign(anchorRef, 560);
  const align = isMobileView ? "center" : desktopAlign;
  const sideOffset = isMobileView ? 6 : desktopSideOffset;

  useCloseOnWindowResize(onClose);

  if (!anchorRef) return null;

  return (
    <Popover
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <PopoverContent
        ref={popupRef}
        anchor={anchorRef}
        side="bottom"
        align={align}
        alignOffset={isMobileView ? 0 : alignOffset}
        sideOffset={sideOffset}
        collisionPadding={8}
        collisionAvoidance={{
          side: "flip",
          align: isMobileView ? "shift" : "none",
          fallbackAxisSide: "none",
        }}
        positionMethod="fixed"
        initialFocus={false}
        finalFocus={false}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--dg-radius-lg)",
          boxShadow: "var(--shadow-menu)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          width: isMobileView ? "calc(100vw - 16px)" : "max-content",
          minWidth: isMobileView ? undefined : 320,
          maxWidth: "calc(100vw - 16px)",
          maxHeight: "var(--available-height)",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--dg-radius-lg)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "inherit",
          }}
        >
          <div
            style={{
              padding: "12px 16px 8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Select Shift
            </span>
            <CloseButton size="md" onClick={onClose} aria-label="Close" />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <ShiftPicker
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              orgRoles={orgRoles}
              certifications={certifications}
              focusAreas={focusAreas}
              absenceTypes={absenceTypes}
              currentAssignmentDefinitionIds={currentSegments
                .map((segment) => segment.assignmentId ?? null)
                .filter((id): id is number => id != null)}
              currentSegments={currentSegments.map((segment, index) => ({
                shiftId: segment.shiftId,
                jobId: segment.jobId,
                position: segment.position ?? index,
              }))}
              currentAbsenceTypeId={currentAbsenceTypeId}
              defaultShiftEnabled={defaultShiftEnabled}
              onSelect={(segments) => {
                onSelect(
                  segments.length > 0
                    ? {
                        kind: "worked",
                        segments,
                        absenceTypeId: null,
                        customStartTime: null,
                        customEndTime: null,
                        seriesId: null,
                        fromRecurring: true,
                      }
                    : null,
                );
                onClose();
              }}
              onAbsenceSelect={
                onAbsenceSelect
                  ? (absenceType) => {
                      onAbsenceSelect(absenceType);
                      onClose();
                    }
                  : undefined
              }
              empFocusAreaIds={empFocusAreaIds}
              empCertificationId={empCertificationId}
              empRoleIds={empRoleIds}
              multiSelect={false}
              closeOnSelect={true}
            />
            {(currentSegments.length > 0 || currentAbsenceTypeId) && (
              <button
                onClick={() => {
                  onSelect(null);
                  onClose();
                }}
                className="dg-btn dg-btn-ghost"
                style={{
                  marginTop: 12,
                  width: "100%",
                  color: "var(--color-danger)",
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                }}
              >
                Clear Shift
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function migrateLegacyDraftValue(
  value: unknown,
  assignments: AssignmentDefinition[],
  absenceTypes: AbsenceType[],
): ScheduleCellInput | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "kind" in value) {
    return value as ScheduleCellInput;
  }
  if (typeof value !== "string") return null;

  if (value.startsWith("a:")) {
    const id = Number(value.slice(2));
    return Number.isFinite(id)
      ? {
          kind: "absence",
          segments: [],
          absenceTypeId: id,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: true,
        }
      : null;
  }

  if (value.startsWith("s:")) {
    const id = Number(value.slice(2));
    const assignment = Number.isFinite(id)
      ? assignments.find((candidate) => candidate.id === id)
      : null;
    if (!assignment?.jobId) return null;
    return {
      kind: "worked",
      segments: [
        {
          shiftId: assignment.shiftId ?? assignment.categoryId ?? null,
          jobId: assignment.jobId,
          position: 0,
        },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    };
  }

  if (value.startsWith("abs:")) {
    const absenceLabel = value.slice(4);
    const absenceType = absenceTypes.find((candidate) => candidate.label === absenceLabel);
    return absenceType
      ? {
          kind: "absence",
          segments: [],
          absenceTypeId: absenceType.id,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: true,
        }
      : null;
  }

  const assignment = assignments.find((candidate) => candidate.label === value);
  if (!assignment?.jobId) return null;
  return {
    kind: "worked",
    segments: [
      {
        shiftId: assignment.shiftId ?? assignment.categoryId ?? null,
        jobId: assignment.jobId,
        position: 0,
      },
    ],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: true,
  };
}

type RecurringShiftPillProps = {
  assignment: AssignmentDefinition | null;
  shiftCategory: ShiftCategory | null;
  job: JobDefinition | null;
  absenceType: AbsenceType | null;
  isDirty: boolean;
  shiftDisplayMode: ShiftDisplayMode;
};

function RecurringShiftPill({
  assignment,
  shiftCategory,
  job,
  absenceType,
  isDirty,
  shiftDisplayMode,
}: RecurringShiftPillProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  if (!assignment && !absenceType) {
    return (
      <div
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          bottom: 4,
          left: 4,
          background: "transparent",
          border: isDirty
            ? "2px dashed var(--color-text-subtle)"
            : "1px dashed var(--color-border-light)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-faint)",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 500,
        }}
      >
        --
      </div>
    );
  }

  const isNameMode = shiftDisplayMode === "name";
  const rawPillBackground = assignment?.color ?? absenceType!.color;
  const rawPillText = assignment?.text ?? absenceType!.text;
  const darkPill = isDarkTheme ? toDarkPillColors(rawPillBackground) : null;
  const pillBackground = darkPill?.bg ?? rawPillBackground;
  const pillText = darkPill?.text ?? rawPillText;
  const fallbackBorder = darkPill
    ? `1px solid ${borderColor(pillText)}`
    : absenceType
      ? `1px solid ${absenceType.border}`
      : `1px solid ${borderColor(pillText)}`;
  const displayParts = assignment
    ? buildShiftDisplayParts({
        shift: shiftCategory,
        job,
        assignment,
        shiftDisplayMode,
      })
    : {
        primaryLabel: isNameMode ? absenceType!.name || absenceType!.label : absenceType!.label,
        secondaryLabel: null,
      };

  return (
    <div
      data-shift-pill="single"
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        bottom: 4,
        left: 4,
        background: pillBackground,
        border: isDirty ? `2px dashed ${pillText}` : fallbackBorder,
        borderRadius: 8,
        color: pillText,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isNameMode ? "2px 6px" : "2px 3px",
        paddingTop: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: displayParts.secondaryLabel ? 1 : 0,
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <span
          style={
            isNameMode
              ? {
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 800,
                  lineHeight: 1.2,
                  textAlign: "center" as const,
                  maxWidth: "100%",
                  overflowWrap: "break-word" as const,
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical" as const,
                  WebkitLineClamp: displayParts.secondaryLabel ? 1 : 2,
                  overflow: "hidden",
                }
              : {
                  fontSize: "var(--dg-fs-title)",
                  fontWeight: 800,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }
          }
        >
          {displayParts.primaryLabel}
        </span>
        {displayParts.secondaryLabel ? (
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 700,
              lineHeight: 1.3,
              opacity: 0.78,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {displayParts.secondaryLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface RecurringScheduleSectionProps {
  employees: Employee[];
  orgId: string;
  currentUserId: string | null;
  assignments: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  orgRoles?: NamedItem[];
  assignmentMap: Map<number, string>;
  canManage: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  absenceTypes?: AbsenceType[];
  shiftDisplayMode?: ShiftDisplayMode;
  defaultShiftEnabled?: boolean;
}

export function RecurringScheduleSection({
  employees,
  orgId,
  currentUserId,
  assignments,
  shiftCategories = [],
  jobs = [],
  orgRoles = [],
  assignmentMap,
  canManage,
  focusAreas,
  certifications,
  absenceTypes = [],
  shiftDisplayMode = "code",
  defaultShiftEnabled = true,
}: RecurringScheduleSectionProps) {
  const isMobile = useMediaQuery(MOBILE);
  const isNameMode = shiftDisplayMode === "name";
  const absenceTypeMap = useMemo(
    () =>
      new Map(
        absenceTypes.map((absenceType) => [
          absenceType.id,
          isNameMode ? absenceType.name || absenceType.label : absenceType.label,
        ]),
      ),
    [absenceTypes, isNameMode],
  );
  const absenceTypeIdMap = useMemo(
    () => new Map(absenceTypes.map((absenceType) => [absenceType.id, absenceType])),
    [absenceTypes],
  );
  const shiftCategoryById = useMemo(
    () => new Map(shiftCategories.map((shiftCategory) => [shiftCategory.id, shiftCategory])),
    [shiftCategories],
  );
  const assignmentBySegmentKey = useMemo(
    () =>
      new Map(
        assignments
          .filter((assignment) => !assignment.archivedAt && assignment.jobId != null)
          .map((assignment) => [
            `${assignment.shiftId ?? assignment.categoryId ?? "null"}:${assignment.jobId}`,
            assignment,
          ]),
      ),
    [assignments],
  );
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const queryClient = useQueryClient();
  const recurringShiftsQuery = useQuery({
    queryKey: queryKeys.recurringShifts.all(orgId),
    queryFn: () => fetchRecurringShifts(orgId, undefined, assignmentMap, false, absenceTypeMap),
  });
  const allSchedules = useMemo<RecurringScheduleDraft>(() => {
    const schedules: RecurringScheduleDraft = {};
    for (const recurringShift of recurringShiftsQuery.data ?? []) {
      if (!schedules[recurringShift.empId]) {
        schedules[recurringShift.empId] = {};
      }
      if (!(recurringShift.dayOfWeek in schedules[recurringShift.empId])) {
        schedules[recurringShift.empId][recurringShift.dayOfWeek] = recurringShift.input;
      }
    }
    return schedules;
  }, [recurringShiftsQuery.data]);
  const loading = recurringShiftsQuery.isPending;
  const [dirtySchedules, setDirtySchedules] = useState<RecurringScheduleDraft>({});
  const [activeCell, setActiveCell] = useState<{
    empId: string;
    dayIndex: number;
  } | null>(null);
  const [activeCellEl, setActiveCellEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDraftTimestamp, setSavedDraftTimestamp] = useState<string | null>(null);
  const [pendingRecurringAction, setPendingRecurringAction] = useState<"save" | "discard" | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFocusArea, setFilterFocusArea] = useState<number | "">("");

  useEffect(() => {
    if (recurringShiftsQuery.isError) {
      setError(
        formatClientErrorMessage(
          recurringShiftsQuery.error,
          "We couldn't load recurring schedules right now.",
        ),
      );
    }
  }, [recurringShiftsQuery.isError, recurringShiftsQuery.error]);

  // Draft recovery: fetch the saved local draft for the current user and merge.
  // Only run once per (org, user) after the server data has resolved.
  const draftLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (recurringShiftsQuery.isPending || !canManage || !currentUserId) return;
    const key = `${orgId}:${currentUserId}`;
    if (draftLoadedRef.current === key) return;
    draftLoadedRef.current = key;

    let cancelled = false;
    void (async () => {
      try {
        const draft = await getRecurringDraft(orgId, currentUserId);
        if (!cancelled && draft?.draftData && Object.keys(draft.draftData).length > 0) {
          const migrated: RecurringScheduleDraft = {};
          for (const [employeeId, employeeDirty] of Object.entries(draft.draftData)) {
            for (const [dayKey, value] of Object.entries(employeeDirty)) {
              const migratedValue = migrateLegacyDraftValue(value, assignments, absenceTypes);
              if (migratedValue !== null) {
                if (!migrated[employeeId]) {
                  migrated[employeeId] = {};
                }
                migrated[employeeId][Number(dayKey)] = migratedValue;
              }
            }
          }
          if (Object.keys(migrated).length > 0) {
            setDirtySchedules(migrated);
            setSavedDraftTimestamp(draft.savedAt);
          }
        }
      } catch {
        // Draft recovery is non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [absenceTypes, assignments, canManage, currentUserId, orgId, recurringShiftsQuery.isPending]);

  const hasDirtyChanges = Object.keys(dirtySchedules).length > 0;
  const dirtyCount = Object.values(dirtySchedules).reduce(
    (sum, employeeDirty) => sum + Object.keys(employeeDirty).length,
    0,
  );

  function getEffectiveInput(empId: string, dayIndex: number): ScheduleCellInput | null {
    if (dirtySchedules[empId] && dayIndex in dirtySchedules[empId]) {
      return dirtySchedules[empId][dayIndex];
    }
    return allSchedules[empId]?.[dayIndex] ?? null;
  }

  function resolveRecurringDisplay(input: ScheduleCellInput | null): {
    assignment: AssignmentDefinition | null;
    shiftCategory: ShiftCategory | null;
    job: JobDefinition | null;
    absenceType: AbsenceType | null;
    label: string | null;
    segments: ShiftJobSegment[];
  } {
    if (!input) {
      return {
        assignment: null,
        shiftCategory: null,
        job: null,
        absenceType: null,
        label: null,
        segments: [],
      };
    }

    if (input.kind === "absence") {
      const absenceType =
        input.absenceTypeId != null ? (absenceTypeIdMap.get(input.absenceTypeId) ?? null) : null;
      return {
        assignment: null,
        shiftCategory: null,
        job: null,
        absenceType,
        label: absenceType
          ? isNameMode
            ? absenceType.name || absenceType.label
            : absenceType.label
          : null,
        segments: [],
      };
    }

    const segment = input.segments[0];
    if (!segment) {
      return {
        assignment: null,
        shiftCategory: null,
        job: null,
        absenceType: null,
        label: null,
        segments: [],
      };
    }

    const assignment =
      assignmentBySegmentKey.get(`${segment.shiftId ?? "null"}:${segment.jobId}`) ?? null;
    const shiftCategoryId =
      segment.shiftId ?? assignment?.shiftId ?? assignment?.categoryId ?? null;
    const shiftCategory =
      shiftCategoryId != null ? (shiftCategoryById.get(shiftCategoryId) ?? null) : null;
    const job = jobById.get(segment.jobId) ?? null;
    const displayParts = assignment
      ? buildShiftDisplayParts({
          shift: shiftCategory,
          job,
          assignment,
          shiftDisplayMode,
        })
      : {
          primaryLabel: isNameMode ? (job?.name ?? "?") : (job?.abbr ?? "?"),
          secondaryLabel: null,
        };

    return {
      assignment,
      shiftCategory,
      job,
      absenceType: null,
      label: displayParts.secondaryLabel
        ? `${displayParts.primaryLabel} / ${displayParts.secondaryLabel}`
        : displayParts.primaryLabel,
      segments: [
        {
          shiftId: segment.shiftId,
          jobId: segment.jobId,
          position: segment.position ?? 0,
          assignmentId: assignment?.id ?? null,
          label: assignment?.label ?? displayParts.primaryLabel,
          shiftName: shiftCategory?.name ?? null,
          shiftAbbr: shiftCategory?.abbr ?? null,
          jobName: job?.name ?? null,
          jobAbbr: job?.abbr ?? null,
          focusAreaId: shiftCategory?.focusAreaId ?? assignment?.focusAreaId ?? null,
          showJobOnGrid: job?.showOnGrid ?? true,
          isShiftless: segment.shiftId == null,
          startTime: assignment?.defaultStartTime ?? null,
          endTime: assignment?.defaultEndTime ?? null,
        },
      ],
    };
  }

  function handleCellChange(empId: string, dayIndex: number, newValue: ScheduleCellInput | null) {
    const original = allSchedules[empId]?.[dayIndex] ?? null;
    setDirtySchedules((current) => {
      const employeeDirty = { ...(current[empId] ?? {}) };
      if (JSON.stringify(newValue) === JSON.stringify(original)) {
        delete employeeDirty[dayIndex];
      } else {
        employeeDirty[dayIndex] = newValue;
      }

      const next = { ...current };
      if (Object.keys(employeeDirty).length === 0) {
        delete next[empId];
      } else {
        next[empId] = employeeDirty;
      }
      return next;
    });
    setActiveCell(null);
    setActiveCellEl(null);
  }

  function handleCellClick(empId: string, dayIndex: number, element: HTMLElement) {
    if (!canManage) return;
    if (activeCell?.empId === empId && activeCell?.dayIndex === dayIndex) {
      setActiveCell(null);
      setActiveCellEl(null);
    } else {
      setActiveCell({ empId, dayIndex });
      setActiveCellEl(element);
    }
  }

  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  async function handleSaveAll() {
    setSaving(true);
    setError(null);
    const todayKey = getTodayKey();
    const snapshot = dirtySchedules;
    const savedKeys = new Set<string>();

    try {
      for (const [employeeId, employeeDirty] of Object.entries(snapshot)) {
        for (const [dayKey, newValue] of Object.entries(employeeDirty)) {
          const day = Number(dayKey);
          if (newValue) {
            await upsertRecurringShift(employeeId, orgId, day, newValue, todayKey);
          } else {
            await deleteRecurringShift(employeeId, day, orgId);
          }
          savedKeys.add(`${employeeId}:${dayKey}`);
        }
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.recurringShifts.all(orgId),
      });

      setDirtySchedules((current) => {
        const next: RecurringScheduleDraft = {};
        for (const [employeeId, employeeDirty] of Object.entries(current)) {
          for (const [dayKey, value] of Object.entries(employeeDirty)) {
            if (!savedKeys.has(`${employeeId}:${dayKey}`)) {
              if (!next[employeeId]) {
                next[employeeId] = {};
              }
              next[employeeId][Number(dayKey)] = value;
            }
          }
        }
        return next;
      });
      setSavedDraftTimestamp(null);
      if (currentUserId) {
        await deleteRecurringDraft(orgId, currentUserId).catch(() => {});
      }
      toast.success("Recurring schedules saved");
    } catch (err: unknown) {
      toast.error("Failed to save recurring schedules");
      setError(formatClientErrorMessage(err, "We couldn't save recurring schedules."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    try {
      if (!currentUserId) {
        toast.error("Not authenticated");
        return;
      }
      await saveRecurringDraft(orgId, currentUserId, dirtySchedules);
      setSavedDraftTimestamp(new Date().toISOString());
      toast.success("Draft saved");
    } catch (err: unknown) {
      Sentry.captureException(err);
      toast.error(formatClientErrorMessage(err, "We couldn't save that draft."));
    }
  }

  async function handleDiscardDraft() {
    setDirtySchedules({});
    setSavedDraftTimestamp(null);
    if (currentUserId) {
      await deleteRecurringDraft(orgId, currentUserId).catch(() => {});
    }
  }

  const filteredEmployees = useMemo(
    () =>
      employees.filter((employee) => {
        const matchesSearch =
          !searchQuery ||
          getEmployeeDisplayName(employee).toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFocusArea =
          !filterFocusArea || employee.focusAreaIds.includes(filterFocusArea);
        return matchesSearch && matchesFocusArea;
      }),
    [employees, filterFocusArea, searchQuery],
  );

  useEffect(() => {
    if (activeCell && !filteredEmployees.some((employee) => employee.id === activeCell.empId)) {
      setActiveCell(null);
      setActiveCellEl(null);
    }
  }, [activeCell, filteredEmployees]);

  const sortedEmployees = useMemo(
    () =>
      [...filteredEmployees].sort(
        (firstEmployee, secondEmployee) => firstEmployee.seniority - secondEmployee.seniority,
      ),
    [filteredEmployees],
  );

  const focusAreaOptions: SelectOption<number | "">[] = useMemo(
    () => [
      { value: "" as const, label: "All Focus Areas" },
      ...focusAreas.map((focusArea) => ({
        value: focusArea.id,
        label: focusArea.name,
      })),
    ],
    [focusAreas],
  );

  const activeCellEmp = activeCell
    ? (employees.find((employee) => employee.id === activeCell.empId) ?? null)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <ProgressBar loading={loading} />
      {hasDirtyChanges && canManage && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "var(--color-info-bg)",
            border: "1px solid var(--color-info-border)",
            borderRadius: "var(--dg-radius-lg)",
            padding: isMobile ? "10px 12px" : "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="dg-draft-banner-dot" />
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  color: "var(--color-info-text)",
                }}
              >
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {savedDraftTimestamp && (
                <span
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-info)",
                    opacity: 0.75,
                  }}
                >
                  Draft saved {new Date(savedDraftTimestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveDraft}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}
            >
              Save Draft
            </button>
            <button
              onClick={() => setPendingRecurringAction("discard")}
              className="dg-btn dg-btn-ghost"
              style={{
                padding: "6px 14px",
                fontSize: "var(--dg-fs-caption)",
                color: "var(--color-danger)",
              }}
            >
              Discard
            </button>
            <button
              onClick={() => setPendingRecurringAction("save")}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ padding: "6px 18px", fontSize: "var(--dg-fs-caption)" }}
            >
              <ButtonLoading loading={saving} loadingLabel="Saving">
                Save Changes
              </ButtonLoading>
            </button>
          </div>
        </div>
      )}

      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Recurring Shifts
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-muted)",
          }}
        >
          Set recurring shift patterns for each staff member. Click any cell to assign a shift.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: isMobile ? 8 : 12,
        }}
      >
        {focusAreas.length > 0 && (
          <CustomSelect
            value={filterFocusArea}
            options={focusAreaOptions}
            onChange={setFilterFocusArea}
            fontSize={12}
            style={{ minWidth: isMobile ? 120 : 160 }}
          />
        )}
        <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0 }} />
        <div style={{ position: "relative", width: isMobile ? "100%" : undefined }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-faint)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{
              padding: `7px ${searchQuery ? 30 : 10}px 7px 32px`,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--dg-btn-radius)",
              fontSize: "var(--dg-fs-caption)",
              outline: "none",
              width: isMobile ? "100%" : 180,
              background: "var(--color-surface)",
              fontFamily: "inherit",
              transition: "border-color 150ms ease",
            }}
            onFocus={(event) => {
              event.currentTarget.style.borderColor = "var(--color-border-focus)";
            }}
            onBlur={(event) => {
              event.currentTarget.style.borderColor = "var(--color-border)";
            }}
          />
          {searchQuery && (
            <CloseButton
              size="sm"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
            />
          )}
        </div>
      </div>

      {loading ? null : employees.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="No staff members"
          description="Add employees in the Members section to set up recurring shifts."
        />
      ) : sortedEmployees.length === 0 ? (
        <EmptyState
          title="No results found"
          description="Try adjusting your search or filter."
          action={
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterFocusArea("");
              }}
              className="dg-btn dg-btn-secondary"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border)",
            overflowX: "auto",
            boxShadow: BOX_SHADOW_CARD,
            position: "relative",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            style={{
              display: "grid",
              minWidth: isMobile ? 448 : undefined,
              gridTemplateColumns: `${isMobile ? 140 : 220}px repeat(7, minmax(${isMobile ? 44 : 72}px, 1fr))`,
              background: "var(--color-bg)",
              borderBottom: "1px solid var(--color-table-divider-strong)",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 600,
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                position: isMobile ? undefined : "sticky",
                left: isMobile ? undefined : 0,
                zIndex: isMobile ? undefined : 4,
                background: "var(--color-bg)",
                borderRight: "1px solid var(--color-border-light)",
                boxShadow: isMobile ? undefined : "2px 0 4px rgba(0,0,0,0.02)",
              }}
            >
              Staff
            </div>
            {DAY_LABELS.map((day) => (
              <div
                key={day}
                style={{
                  padding: "10px 4px",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  textAlign: "center",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {sortedEmployees.map((employee, index) => {
            const isCurrentUser = !!(
              employee.userId &&
              currentUserId &&
              employee.userId === currentUserId
            );
            const rowBg = isCurrentUser ? "var(--color-today-bg)" : "var(--color-surface)";
            const certAbbr =
              employee.certificationId != null
                ? getCertAbbr(employee.certificationId, certifications)
                : null;
            const designationColors = certAbbr
              ? (DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR)
              : null;

            return (
              <div
                key={employee.id}
                className="dg-table-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${isMobile ? 140 : 220}px repeat(7, minmax(${isMobile ? 44 : 72}px, 1fr))`,
                  minWidth: isMobile ? 448 : undefined,
                  borderTop: index === 0 ? "none" : "1px solid var(--color-border-light)",
                  background: rowBg,
                  transition: "background 150ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    borderRight: "1px solid var(--color-border-light)",
                    position: isMobile ? undefined : "sticky",
                    left: isMobile ? undefined : 0,
                    zIndex: isMobile ? undefined : 3,
                    background: rowBg,
                    boxShadow: isMobile ? undefined : "2px 0 4px rgba(0,0,0,0.02)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "var(--dg-fs-label)",
                        color: "var(--color-text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {getEmployeeDisplayName(employee)}
                      {isCurrentUser && (
                        <span
                          style={{
                            fontSize: "var(--dg-fs-micro)",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 10,
                            background: "var(--color-brand-bg)",
                            color: "var(--color-brand)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  {certAbbr && designationColors && (
                    <span
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 700,
                        background: designationColors.bg,
                        color: designationColors.text,
                        padding: "2px 7px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        letterSpacing: "0.01em",
                        marginLeft: 6,
                      }}
                    >
                      {certAbbr}
                    </span>
                  )}
                </div>

                {DAY_LABELS.map((_, dayIdx) => {
                  const cellInput = getEffectiveInput(employee.id, dayIdx);
                  const {
                    assignment,
                    shiftCategory,
                    job,
                    absenceType,
                    label: cellLabel,
                  } = resolveRecurringDisplay(cellInput);
                  const isDirty = !!(
                    dirtySchedules[employee.id] && dayIdx in dirtySchedules[employee.id]
                  );

                  return (
                    <div
                      key={dayIdx}
                      className="dg-grid-cell"
                      data-interactive={canManage ? "true" : "false"}
                      tabIndex={canManage ? 0 : -1}
                      role="gridcell"
                      aria-label={
                        cellLabel
                          ? `${getEmployeeDisplayName(employee)}, ${DAY_LABELS[dayIdx]}: ${cellLabel}`
                          : `${getEmployeeDisplayName(employee)}, ${DAY_LABELS[dayIdx]}: empty`
                      }
                      onClick={(event) => handleCellClick(employee.id, dayIdx, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (canManage && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          handleCellClick(employee.id, dayIdx, event.currentTarget as HTMLElement);
                        }
                      }}
                      style={{
                        height: "var(--dg-grid-cell-height)",
                        borderLeft: "1px solid var(--color-border-light)",
                      }}
                    >
                      <div className="dg-grid-cell__content">
                        <RecurringShiftPill
                          assignment={assignment}
                          shiftCategory={shiftCategory}
                          job={job}
                          absenceType={absenceType}
                          isDirty={isDirty}
                          shiftDisplayMode={shiftDisplayMode}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {error && (
            <div
              style={{
                padding: "10px 20px",
                background: "var(--color-danger-bg)",
                borderTop: "1px solid var(--color-danger-border)",
                fontSize: "var(--dg-fs-caption)",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {activeCell &&
        activeCellEmp &&
        (() => {
          const activeInput = getEffectiveInput(activeCell.empId, activeCell.dayIndex);
          const activeDisplay = resolveRecurringDisplay(activeInput);
          const currentAbsenceTypeId =
            activeInput?.kind === "absence" ? (activeInput.absenceTypeId ?? null) : null;

          return (
            <ShiftCellPopover
              anchorRef={activeCellEl}
              assignments={assignments}
              shiftCategories={shiftCategories}
              jobs={jobs}
              orgRoles={orgRoles}
              certifications={certifications}
              focusAreas={focusAreas}
              absenceTypes={absenceTypes}
              currentSegments={activeDisplay.segments}
              currentAbsenceTypeId={currentAbsenceTypeId}
              onSelect={(input) => handleCellChange(activeCell.empId, activeCell.dayIndex, input)}
              onAbsenceSelect={(absenceType) =>
                handleCellChange(activeCell.empId, activeCell.dayIndex, {
                  kind: "absence",
                  segments: [],
                  absenceTypeId: absenceType.id,
                  customStartTime: null,
                  customEndTime: null,
                  seriesId: null,
                  fromRecurring: true,
                })
              }
              onClose={() => {
                setActiveCell(null);
                setActiveCellEl(null);
              }}
              empFocusAreaIds={activeCellEmp.focusAreaIds}
              empCertificationId={activeCellEmp.certificationId}
              empRoleIds={activeCellEmp.roleIds}
              shiftDisplayMode={shiftDisplayMode}
              defaultShiftEnabled={defaultShiftEnabled}
            />
          );
        })()}

      {pendingRecurringAction ? (
        <ConfirmDialog
          title={
            pendingRecurringAction === "save"
              ? "Save Recurring Schedule Changes?"
              : "Discard Recurring Schedule Draft?"
          }
          message={
            pendingRecurringAction === "save"
              ? `Save ${dirtyCount} recurring schedule change${dirtyCount === 1 ? "" : "s"}? These templates affect future schedule generation.`
              : `Discard ${dirtyCount} recurring schedule draft change${dirtyCount === 1 ? "" : "s"}? This cannot be undone.`
          }
          confirmLabel={pendingRecurringAction === "save" ? "Save Changes" : "Discard"}
          confirmPendingLabel={pendingRecurringAction === "save" ? "Saving" : "Discarding"}
          variant={pendingRecurringAction === "save" ? "warning" : "danger"}
          isLoading={saving}
          onConfirm={() => {
            const action = pendingRecurringAction;
            setPendingRecurringAction(null);
            if (action === "save") {
              void handleSaveAll();
            } else {
              void handleDiscardDraft();
            }
          }}
          onCancel={() => setPendingRecurringAction(null)}
        />
      ) : null}
    </div>
  );
}
