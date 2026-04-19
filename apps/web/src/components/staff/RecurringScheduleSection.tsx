"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MaybeHint } from "@/components/ui/hint";
import CustomSelect, { type SelectOption } from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import ShiftPicker from "@/components/ShiftPicker";
import {
  BOX_SHADOW_CARD,
  DAY_LABELS,
} from "@/lib/constants";
import { borderColor, DESIGNATION_COLORS, DEFAULT_DESIG_COLOR } from "@/lib/colors";
import {
  deleteRecurringDraft,
  deleteRecurringShift,
  fetchRecurringShifts,
  getRecurringDraft,
  saveRecurringDraft,
  upsertRecurringShift,
} from "@/lib/db";
import * as Sentry from "@/lib/sentry";
import { getCertAbbr, getEmployeeDisplayName } from "@/lib/utils";
import { useMediaQuery, MOBILE } from "@/hooks";
import type {
  AbsenceType,
  Employee,
  FocusArea,
  NamedItem,
  ShiftCode,
  ShiftDisplayMode,
} from "@/types";

type ShiftCellPopoverProps = {
  anchorRef: HTMLElement | null;
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  currentLabel: string;
  onSelect: (label: string, shiftCodeIds: number[]) => void;
  onClose: () => void;
  empFocusAreaIds: number[];
  empCertificationId?: number | null;
  absenceTypes?: AbsenceType[];
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  currentAbsenceTypeId?: number | null;
  shiftDisplayMode?: ShiftDisplayMode;
};

function ShiftCellPopover({
  anchorRef,
  shiftCodes,
  focusAreas,
  currentLabel,
  onSelect,
  onClose,
  empFocusAreaIds,
  empCertificationId,
  absenceTypes,
  onAbsenceSelect,
  currentAbsenceTypeId,
  shiftDisplayMode,
}: ShiftCellPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [flippedUp, setFlippedUp] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const updatePosition = useCallback(() => {
    if (!anchorRef) return;

    const rect = anchorRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const shouldFlipUp = spaceBelow < 260;
    const isMobileView = window.innerWidth < 768;
    const gap = 8;
    const maxWidth = window.innerWidth - 16;
    const naturalWidth = menuRef.current
      ? Math.min(menuRef.current.scrollWidth, maxWidth)
      : Math.min(440, maxWidth);
    const popoverLeft = isMobileView
      ? 8
      : Math.max(
          8,
          Math.min(
            rect.left + window.scrollX - 40,
            window.innerWidth - naturalWidth - 8,
          ),
        );

    setFlippedUp(shouldFlipUp);
    setMenuStyle({
      position: "absolute",
      top: shouldFlipUp ? undefined : rect.bottom + window.scrollY + gap,
      bottom: shouldFlipUp
        ? window.innerHeight - rect.top - window.scrollY + gap
        : undefined,
      left: isMobileView ? 8 : popoverLeft,
      width: isMobileView ? undefined : "auto",
      minWidth: isMobileView ? undefined : 320,
      maxWidth,
      right: isMobileView ? 8 : undefined,
      maxHeight: shouldFlipUp ? rect.top - 12 : spaceBelow,
      zIndex: 9999,
    });

    const anchorCenterX = rect.left + window.scrollX + rect.width / 2;
    setArrowLeft(
      isMobileView
        ? anchorCenterX - 8
        : Math.max(
            16,
            Math.min(anchorCenterX - popoverLeft, naturalWidth - 16),
          ),
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [updatePosition]);

  useEffect(() => {
    if (!anchorRef) return;

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, updatePosition]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        anchorRef &&
        !anchorRef.contains(target)
      ) {
        onCloseRef.current();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [anchorRef]);

  const currentShiftCodeIds = useMemo(() => {
    if (!currentLabel || currentLabel === "OFF") return [];
    return currentLabel
      .split("/")
      .map(
        (label) =>
          shiftCodes.find(
            (shiftCode) =>
              shiftCode.label === label || shiftCode.name === label,
          )?.id,
      )
      .filter((id): id is number => id != null);
  }, [currentLabel, shiftCodes]);

  if (typeof document === "undefined" || !anchorRef) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        boxShadow: "var(--shadow-menu)",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: arrowLeft - 1,
          width: 0,
          height: 0,
          borderLeft: "9px solid transparent",
          borderRight: "9px solid transparent",
          ...(flippedUp
            ? { bottom: -8, borderTop: "8px solid var(--color-border)" }
            : { top: -8, borderBottom: "8px solid var(--color-border)" }),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: arrowLeft,
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          ...(flippedUp
            ? { bottom: -7, borderTop: "7px solid var(--color-surface)" }
            : { top: -7, borderBottom: "7px solid var(--color-surface)" }),
        }}
      />
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
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{ padding: 4, lineHeight: 0 }}
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <ShiftPicker
            shiftCodes={shiftCodes}
            focusAreas={focusAreas}
            absenceTypes={absenceTypes}
            currentShiftCodeIds={currentShiftCodeIds}
            currentAbsenceTypeId={currentAbsenceTypeId}
            onSelect={(label, shiftCodeIds) => {
              onSelect(label, shiftCodeIds);
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
            multiSelect={false}
            closeOnSelect={true}
            shiftDisplayMode={shiftDisplayMode}
          />
          {(currentLabel || currentAbsenceTypeId) && (
            <button
              onClick={() => {
                onSelect("", []);
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
    </div>,
    document.body,
  );
}

function encodeShift(id: number): string {
  return `s:${id}`;
}

function encodeAbsence(id: number): string {
  return `a:${id}`;
}

function parseRecurringValue(
  value: string,
): { type: "shift"; id: number } | { type: "absence"; id: number } | null {
  if (value.startsWith("s:")) {
    const id = Number(value.slice(2));
    return Number.isFinite(id) ? { type: "shift", id } : null;
  }
  if (value.startsWith("a:")) {
    const id = Number(value.slice(2));
    return Number.isFinite(id) ? { type: "absence", id } : null;
  }
  return null;
}

function migrateLegacyDraftValue(
  value: string,
  shiftCodes: ShiftCode[],
  absenceTypes: AbsenceType[],
): string {
  if (!value) return value;
  if (value.startsWith("s:") || value.startsWith("a:")) return value;

  if (value.startsWith("abs:")) {
    const absenceLabel = value.slice(4);
    const absenceType = absenceTypes.find(
      (candidate) => candidate.label === absenceLabel,
    );
    return absenceType ? encodeAbsence(absenceType.id) : "";
  }

  const shiftCode = shiftCodes.find((candidate) => candidate.label === value);
  return shiftCode ? encodeShift(shiftCode.id) : "";
}

export interface RecurringScheduleSectionProps {
  employees: Employee[];
  orgId: string;
  currentUserId: string | null;
  shiftCodes: ShiftCode[];
  shiftCodeMap: Map<number, string>;
  canManage: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  absenceTypes?: AbsenceType[];
  shiftDisplayMode?: ShiftDisplayMode;
}

export function RecurringScheduleSection({
  employees,
  orgId,
  currentUserId,
  shiftCodes,
  shiftCodeMap,
  canManage,
  focusAreas,
  certifications,
  absenceTypes = [],
  shiftDisplayMode = "code",
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
  const shiftCodeIdMap = useMemo(
    () => new Map(shiftCodes.map((shiftCode) => [shiftCode.id, shiftCode])),
    [shiftCodes],
  );
  const [allSchedules, setAllSchedules] = useState<
    Record<string, Record<number, string>>
  >({});
  const [loading, setLoading] = useState(true);
  const [dirtySchedules, setDirtySchedules] = useState<
    Record<string, Record<number, string>>
  >({});
  const [activeCell, setActiveCell] = useState<{
    empId: string;
    dayIndex: number;
  } | null>(null);
  const [activeCellEl, setActiveCellEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDraftTimestamp, setSavedDraftTimestamp] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFocusArea, setFilterFocusArea] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const rows = await fetchRecurringShifts(
          orgId,
          undefined,
          shiftCodeMap,
          false,
          absenceTypeMap,
        );
        if (cancelled) return;

        const schedules: Record<string, Record<number, string>> = {};
        for (const recurringShift of rows) {
          if (!schedules[recurringShift.empId]) {
            schedules[recurringShift.empId] = {};
          }
          if (!(recurringShift.dayOfWeek in schedules[recurringShift.empId])) {
            let encoded = "";
            if (recurringShift.shiftCodeId != null) {
              encoded = encodeShift(recurringShift.shiftCodeId);
            } else if (recurringShift.absenceTypeId != null) {
              encoded = encodeAbsence(recurringShift.absenceTypeId);
            }
            schedules[recurringShift.empId][recurringShift.dayOfWeek] = encoded;
          }
        }
        setAllSchedules(schedules);

        try {
          if (!canManage || !currentUserId) return;
          const draft = await getRecurringDraft(orgId, currentUserId);
          if (
            !cancelled &&
            draft?.draftData &&
            Object.keys(draft.draftData).length > 0
          ) {
            const migrated: Record<string, Record<number, string>> = {};
            for (const [employeeId, employeeDirty] of Object.entries(
              draft.draftData,
            )) {
              for (const [dayKey, value] of Object.entries(employeeDirty)) {
                const migratedValue = migrateLegacyDraftValue(
                  value as string,
                  shiftCodes,
                  absenceTypes,
                );
                if (migratedValue !== undefined) {
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
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    absenceTypeMap,
    absenceTypes,
    canManage,
    currentUserId,
    orgId,
    shiftCodeMap,
    shiftCodes,
  ]);

  const hasDirtyChanges = Object.keys(dirtySchedules).length > 0;
  const dirtyCount = Object.values(dirtySchedules).reduce(
    (sum, employeeDirty) => sum + Object.keys(employeeDirty).length,
    0,
  );

  function getEffectiveLabel(empId: string, dayIndex: number): string {
    if (dirtySchedules[empId] && dayIndex in dirtySchedules[empId]) {
      return dirtySchedules[empId][dayIndex];
    }
    return allSchedules[empId]?.[dayIndex] ?? "";
  }

  function handleCellChange(
    empId: string,
    dayIndex: number,
    newLabel: string,
  ) {
    const original = allSchedules[empId]?.[dayIndex] ?? "";
    setDirtySchedules((current) => {
      const employeeDirty = { ...(current[empId] ?? {}) };
      if (newLabel === original) {
        delete employeeDirty[dayIndex];
      } else {
        employeeDirty[dayIndex] = newLabel;
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

  function handleCellClick(
    empId: string,
    dayIndex: number,
    element: HTMLElement,
  ) {
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
    const skippedLabels: string[] = [];

    try {
      for (const [employeeId, employeeDirty] of Object.entries(snapshot)) {
        for (const [dayKey, newValue] of Object.entries(employeeDirty)) {
          const day = Number(dayKey);
          if (newValue) {
            const parsed = parseRecurringValue(newValue);
            if (!parsed) {
              skippedLabels.push(newValue);
              continue;
            }
            if (parsed.type === "absence") {
              await upsertRecurringShift(
                employeeId,
                orgId,
                day,
                null,
                todayKey,
                parsed.id,
              );
            } else {
              await upsertRecurringShift(employeeId, orgId, day, parsed.id, todayKey);
            }
          } else {
            await deleteRecurringShift(employeeId, day, orgId);
          }
          savedKeys.add(`${employeeId}:${dayKey}`);
        }
      }

      if (skippedLabels.length > 0) {
        const unique = [...new Set(skippedLabels)];
        toast.error(
          `Could not resolve ${unique.length} change${unique.length > 1 ? "s" : ""}`,
        );
      }

      const freshRows = await fetchRecurringShifts(
        orgId,
        undefined,
        shiftCodeMap,
        false,
        absenceTypeMap,
      );
      const freshSchedules: Record<string, Record<number, string>> = {};
      for (const recurringShift of freshRows) {
        if (!freshSchedules[recurringShift.empId]) {
          freshSchedules[recurringShift.empId] = {};
        }
        if (!(recurringShift.dayOfWeek in freshSchedules[recurringShift.empId])) {
          let encoded = "";
          if (recurringShift.shiftCodeId != null) {
            encoded = encodeShift(recurringShift.shiftCodeId);
          } else if (recurringShift.absenceTypeId != null) {
            encoded = encodeAbsence(recurringShift.absenceTypeId);
          }
          freshSchedules[recurringShift.empId][recurringShift.dayOfWeek] = encoded;
        }
      }
      setAllSchedules(freshSchedules);

      setDirtySchedules((current) => {
        const next: Record<string, Record<number, string>> = {};
        for (const [employeeId, employeeDirty] of Object.entries(current)) {
          for (const [dayKey, label] of Object.entries(employeeDirty)) {
            if (!savedKeys.has(`${employeeId}:${dayKey}`)) {
              if (!next[employeeId]) {
                next[employeeId] = {};
              }
              next[employeeId][Number(dayKey)] = label;
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
      setError(err instanceof Error ? err.message : "Save failed");
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
      toast.error(
        `Failed to save draft: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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
          getEmployeeDisplayName(employee)
            .toLowerCase()
            .includes(searchQuery.toLowerCase());
        const matchesFocusArea =
          !filterFocusArea || employee.focusAreaIds.includes(filterFocusArea);
        return matchesSearch && matchesFocusArea;
      }),
    [employees, filterFocusArea, searchQuery],
  );

  useEffect(() => {
    if (
      activeCell &&
      !filteredEmployees.some((employee) => employee.id === activeCell.empId)
    ) {
      setActiveCell(null);
      setActiveCellEl(null);
    }
  }, [activeCell, filteredEmployees]);

  const sortedEmployees = useMemo(
    () =>
      [...filteredEmployees].sort(
        (firstEmployee, secondEmployee) =>
          firstEmployee.seniority - secondEmployee.seniority,
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
    ? employees.find((employee) => employee.id === activeCell.empId) ?? null
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
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
              onClick={handleDiscardDraft}
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
              onClick={handleSaveAll}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ padding: "6px 18px", fontSize: "var(--dg-fs-caption)" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-heading)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Recurring Shifts
        </h2>
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
              padding: "7px 10px 7px 32px",
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
        </div>
      </div>

      {loading ? (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border)",
            padding: "48px 20px",
            textAlign: "center",
            color: "var(--color-text-subtle)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Loading recurring schedules...
        </div>
      ) : employees.length === 0 ? (
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
              borderBottom: "2px solid var(--color-dark)",
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
            const isCurrentUser =
              !!(employee.userId && currentUserId && employee.userId === currentUserId);
            const rowBg = isCurrentUser
              ? "var(--color-today-bg)"
              : "var(--color-surface)";
            const certAbbr =
              employee.certificationId != null
                ? getCertAbbr(employee.certificationId, certifications)
                : null;
            const designationColors = certAbbr
              ? DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR
              : null;

            return (
              <div
                key={employee.id}
                className="dg-table-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${isMobile ? 140 : 220}px repeat(7, minmax(${isMobile ? 44 : 72}px, 1fr))`,
                  minWidth: isMobile ? 448 : undefined,
                  borderTop:
                    index === 0 ? "none" : "1px solid var(--color-border-light)",
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
                  const rawValue = getEffectiveLabel(employee.id, dayIdx);
                  const parsed = rawValue ? parseRecurringValue(rawValue) : null;
                  const shiftCode =
                    parsed?.type === "shift"
                      ? shiftCodeIdMap.get(parsed.id) ?? null
                      : null;
                  const absenceType =
                    parsed?.type === "absence"
                      ? absenceTypeIdMap.get(parsed.id) ?? null
                      : null;
                  const isDirty =
                    !!(dirtySchedules[employee.id] && dayIdx in dirtySchedules[employee.id]);
                  const isActive =
                    activeCell?.empId === employee.id &&
                    activeCell?.dayIndex === dayIdx;
                  const shiftDisplay = shiftCode
                    ? isNameMode
                      ? shiftCode.name || shiftCode.label
                      : shiftCode.label
                    : null;
                  const absenceDisplay = absenceType
                    ? isNameMode
                      ? absenceType.name || absenceType.label
                      : absenceType.label
                    : null;
                  const cellLabel = shiftDisplay ?? absenceDisplay ?? null;
                  const nameModeFontSize = isMobile
                    ? "var(--dg-fs-micro)"
                    : "var(--dg-fs-caption)";
                  const codeModeFontSize = isMobile
                    ? "var(--dg-fs-label)"
                    : "var(--dg-fs-title)";

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
                      onClick={(event) =>
                        handleCellClick(employee.id, dayIdx, event.currentTarget)
                      }
                      onKeyDown={(event) => {
                        if (
                          canManage &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          handleCellClick(
                            employee.id,
                            dayIdx,
                            event.currentTarget as HTMLElement,
                          );
                        }
                      }}
                      style={{
                        height: "var(--dg-grid-cell-height)",
                        borderLeft: "1px solid var(--color-border-light)",
                        background: isActive ? "rgba(100,116,139,0.08)" : undefined,
                      }}
                    >
                      {shiftCode ? (
                        <MaybeHint content={isNameMode ? shiftDisplay ?? undefined : undefined} side="top">
                          <div
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              bottom: 4,
                              left: 4,
                              background: shiftCode.color,
                              border: isDirty
                                ? `2px dashed ${shiftCode.text}`
                                : `1px solid ${borderColor(shiftCode.text)}`,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: shiftCode.text,
                              fontSize: isNameMode ? nameModeFontSize : codeModeFontSize,
                              fontWeight: 800,
                              padding: "2px 4px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              transition: "box-shadow 150ms ease",
                              boxShadow: isActive
                                ? "0 0 0 2px rgba(100,116,139,0.3)"
                                : "none",
                            }}
                          >
                            {shiftDisplay}
                          </div>
                        </MaybeHint>
                      ) : absenceType ? (
                        <MaybeHint
                          content={isNameMode ? absenceDisplay ?? undefined : undefined}
                          side="top"
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              bottom: 4,
                              left: 4,
                              background: absenceType.color,
                              border: isDirty
                                ? `2px dashed ${absenceType.text}`
                                : `1px solid ${borderColor(absenceType.text)}`,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: absenceType.text,
                              fontSize: isNameMode ? nameModeFontSize : codeModeFontSize,
                              fontWeight: 800,
                              padding: "2px 4px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              transition: "box-shadow 150ms ease",
                              boxShadow: isActive
                                ? "0 0 0 2px rgba(100,116,139,0.3)"
                                : "none",
                            }}
                          >
                            {absenceDisplay}
                          </div>
                        </MaybeHint>
                      ) : (
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
                            transition: "box-shadow 150ms ease, background 80ms ease",
                            boxShadow: isActive
                              ? "0 0 0 2px rgba(100,116,139,0.3)"
                              : "none",
                          }}
                        >
                          --
                        </div>
                      )}
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

      {activeCell && activeCellEmp && (() => {
        const rawValue = getEffectiveLabel(activeCell.empId, activeCell.dayIndex);
        const parsed = rawValue ? parseRecurringValue(rawValue) : null;
        const shiftCode =
          parsed?.type === "shift" ? shiftCodeIdMap.get(parsed.id) : undefined;
        const currentShiftLabel = shiftCode
          ? isNameMode
            ? shiftCode.name || shiftCode.label
            : shiftCode.label
          : "";
        const currentAbsenceTypeId =
          parsed?.type === "absence" ? parsed.id : null;

        return (
          <ShiftCellPopover
            anchorRef={activeCellEl}
            shiftCodes={shiftCodes}
            focusAreas={focusAreas}
            absenceTypes={absenceTypes}
            currentLabel={currentShiftLabel}
            currentAbsenceTypeId={currentAbsenceTypeId}
            onSelect={(_label, shiftCodeIds) => {
              const encoded =
                shiftCodeIds.length > 0 ? encodeShift(shiftCodeIds[0]) : "";
              handleCellChange(activeCell.empId, activeCell.dayIndex, encoded);
            }}
            onAbsenceSelect={(absenceType) =>
              handleCellChange(
                activeCell.empId,
                activeCell.dayIndex,
                encodeAbsence(absenceType.id),
              )
            }
            onClose={() => {
              setActiveCell(null);
              setActiveCellEl(null);
            }}
            empFocusAreaIds={activeCellEmp.focusAreaIds}
            empCertificationId={activeCellEmp.certificationId}
            shiftDisplayMode={shiftDisplayMode}
          />
        );
      })()}
    </div>
  );
}
