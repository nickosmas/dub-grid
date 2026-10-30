"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { capitalizeFirst, pluralLabelNoun, singularLabelNoun } from "@dubgrid/domain";
import { Department, FocusArea } from "@/types";
import { Button } from "@/components/Button";
import {
  checkDepartmentDependencies,
  checkFocusAreaDependencies,
  saveDepartments,
  saveFocusAreas,
} from "@/features/settings/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { SectionCard } from "./shared";
import { EmptyState } from "@/components/EmptyState";
import { useSmoothReorder } from "@/hooks/useSmoothReorder";
import { orderFocusAreasByDepartment } from "@/lib/focus-area-order";
import type { DependencyInfo } from "@/features/settings/client";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { useRegisterWizardEditor, useWizardMode } from "@/components/onboarding/WizardModeContext";
import { Banner } from "@/components/ui/Banner";

// ── Types ────────────────────────────────────────────────────────────────────

interface DepartmentsSettingsProps {
  departments: Department[];
  focusAreas: FocusArea[];
  orgId: string;
  focusAreaLabel: string;
  departmentLabel: string;
  canManageFocusAreas: boolean;
  onDepartmentsChange: (departments: Department[]) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
}

// ── Shared styles (matching StringListSettings) ─────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 500,
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-sm)",
  background: "var(--dg-color-surface)",
  color: "var(--dg-color-text-primary)",
  outline: "none",
  transition: "border-color 150ms ease, box-shadow 150ms ease",
};

const DragHandle = ({
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button
    type="button"
    {...props}
    aria-label={`${label}. Use Arrow Up or Arrow Down to move.`}
    className="dg-settings-reorder-handle"
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="3" y="2" width="2" height="2" rx="1" />
      <rect x="9" y="2" width="2" height="2" rx="1" />
      <rect x="3" y="6" width="2" height="2" rx="1" />
      <rect x="9" y="6" width="2" height="2" rx="1" />
      <rect x="3" y="10" width="2" height="2" rx="1" />
      <rect x="9" y="10" width="2" height="2" rx="1" />
    </svg>
  </button>
);

const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

function FocusAreaRows({
  deptId,
  focusAreas,
  isEditing,
  focusAreaLabel,
  onFocusAreasChange,
  onFocusAreaChange,
  onFocusAreaDeleteClick,
  focusAreaErrors,
}: {
  deptId: number;
  focusAreas: FocusArea[];
  isEditing: boolean;
  focusAreaLabel: string;
  onFocusAreasChange: React.Dispatch<React.SetStateAction<FocusArea[]>>;
  onFocusAreaChange: (faId: number, value: string) => void;
  onFocusAreaDeleteClick: (fa: FocusArea) => void;
  focusAreaErrors: Record<number, string | null>;
}) {
  const handleReorder = useCallback(
    (sourceIdx: number, dropIdx: number) => {
      if (sourceIdx === dropIdx) return;

      onFocusAreasChange((current) => {
        const deptFAs = current
          .filter((fa) => fa.departmentId === deptId && !fa.archivedAt)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        if (
          sourceIdx < 0 ||
          sourceIdx >= deptFAs.length ||
          dropIdx < 0 ||
          dropIdx > deptFAs.length
        ) {
          return current;
        }

        const list = [...deptFAs];
        const [item] = list.splice(sourceIdx, 1);
        if (!item) return current;

        list.splice(Math.min(dropIdx, list.length), 0, item);
        const reordered = list.map((fa, index) => ({ ...fa, sortOrder: index }));

        return [...current.filter((fa) => fa.departmentId !== deptId), ...reordered];
      });
    },
    [deptId, onFocusAreasChange],
  );

  const reorder = useSmoothReorder({
    items: focusAreas,
    enabled: isEditing,
    getId: useCallback((fa: FocusArea) => fa.id, []),
    onReorder: handleReorder,
  });

  return (
    <>
      {focusAreas.map((fa, fi) => {
        const motion = reorder.getItemMotion(fa);
        const isLastFA = fi === focusAreas.length - 1;

        return (
          <div
            key={fa.id}
            ref={(node) => reorder.setItemNode(fa, node)}
            className="dg-settings-reorder-subitem"
            data-dragging={motion.isDragging ? "true" : undefined}
            data-drag-phase={motion.dragPhase ?? undefined}
            data-moving={motion.isMoving ? "true" : undefined}
            style={
              {
                "--dg-settings-reorder-offset": `${motion.offsetY}px`,
                display: "flex",
                alignItems: "center",
                gap: isEditing ? 8 : 10,
                padding: isLastFA && !isEditing ? "8px 16px 16px 32px" : "8px 16px 8px 32px",
                userSelect: isEditing ? "none" : undefined,
              } as React.CSSProperties
            }
          >
            {isEditing ? (
              <DragHandle
                label={`Reorder ${fa.name || focusAreaLabel.replace(/s$/i, "")}`}
                {...reorder.getHandleProps(fi)}
              />
            ) : (
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
                <line
                  x1="4"
                  y1="0"
                  x2="4"
                  y2="16"
                  stroke="var(--dg-color-border)"
                  strokeWidth="1.5"
                />
                <line
                  x1="4"
                  y1="8"
                  x2="20"
                  y2="8"
                  stroke="var(--dg-color-border)"
                  strokeWidth="1.5"
                />
              </svg>
            )}
            {isEditing ? (
              <div style={{ flex: 1 }}>
                <input
                  value={fa.name}
                  onChange={(e) => onFocusAreaChange(fa.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  draggable={false}
                  placeholder={`${focusAreaLabel.replace(/s$/i, "")} name`}
                  style={{
                    ...fieldStyle,
                    flex: 1,
                    ...(focusAreaErrors[fa.id] ? { borderColor: "var(--dg-color-danger)" } : {}),
                  }}
                />
                {focusAreaErrors[fa.id] ? (
                  <div
                    role="alert"
                    style={{
                      marginTop: 4,
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-danger)",
                    }}
                  >
                    {focusAreaErrors[fa.id]}
                  </div>
                ) : null}
              </div>
            ) : (
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 500,
                  color: "var(--dg-color-text-secondary)",
                  flex: 1,
                }}
              >
                {fa.name || (
                  <span style={{ fontStyle: "italic", color: "var(--dg-color-text-faint)" }}>
                    Unnamed
                  </span>
                )}
              </span>
            )}
            {isEditing && (
              <Button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusAreaDeleteClick(fa);
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--dg-color-danger-border, #FECACA)",
                  borderRadius: "var(--dg-radius-md)",
                  cursor: "pointer",
                  color: "var(--dg-color-danger)",
                  padding: "5px 10px",
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "background 150ms, color 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--dg-color-danger-bg, #FEF2F2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                Delete
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Section component (reusable for Scheduled & Management) ─────────────────

function DepartmentSection({
  title,
  description,
  depts,
  allDepartments,
  focusAreas: allFocusAreas,
  orgId,
  type,
  canEdit,
  focusAreaLabel,
  departmentLabel,
  onDepartmentsChange,
  onFocusAreasChange,
}: {
  title: string;
  description: string;
  depts: Department[];
  allDepartments: Department[];
  focusAreas: FocusArea[];
  orgId: string;
  type: "scheduled" | "management";
  canEdit: boolean;
  focusAreaLabel: string;
  departmentLabel: string;
  onDepartmentsChange: (departments: Department[]) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
}) {
  const addLabel =
    type === "scheduled" ? departmentLabel.replace(/s$/i, "") : "Management Department";
  const emptyTitle =
    type === "scheduled"
      ? `No ${departmentLabel.toLowerCase()} defined yet`
      : "No management departments defined yet";

  const isWizardMode = useWizardMode();

  // ── Edit lifecycle state ────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(isWizardMode);
  const [localDepts, setLocalDepts] = useState<Department[]>(() =>
    isWizardMode ? [...depts] : [],
  );
  const [localFAs, setLocalFAs] = useState<FocusArea[]>(() => []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    idx: number;
    dept: Department;
    deps: DependencyInfo | null;
  } | null>(null);
  const [faDeleteConfirm, setFaDeleteConfirm] = useState<{
    faId: number;
    fa: FocusArea;
    deps: DependencyInfo | null;
  } | null>(null);
  const [pendingHardDeleteDeptIds, setPendingHardDeleteDeptIds] = useState<Set<number>>(new Set());
  const [pendingHardDeleteFaIds, setPendingHardDeleteFaIds] = useState<Set<number>>(new Set());

  const nextTmpId = useRef(-1);
  const nextTmpFaId = useRef(-1000);
  const nameRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // ── Focus area helpers ────────────────────────────────────────────────────
  const faByDept = useCallback(
    (deptId: number, source: FocusArea[]) =>
      source
        .filter((fa) => fa.departmentId === deptId && !fa.archivedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );

  const propFAs = useMemo(
    () => allFocusAreas.filter((fa) => depts.some((d) => d.id === fa.departmentId)),
    [allFocusAreas, depts],
  );

  // ── Dirty check ─────────────────────────────────────────────────────────────
  const nonEmpty = useCallback((list: Department[]) => list.filter((d) => d.name.trim()), []);
  const departmentErrors = useMemo(
    () =>
      localDepts.map((department) => ({
        name:
          department.name.trim().length > 0
            ? getLineTextError(department.name, {
                label: "Department name",
                maxLength: 80,
                required: true,
                disallowUrl: true,
              })
            : null,
        abbr:
          department.abbr.trim().length > 0
            ? getCodeError(department.abbr, {
                label: "Department abbreviation",
                maxLength: 20,
              })
            : null,
      })),
    [localDepts],
  );
  const focusAreaErrors = useMemo(
    () =>
      Object.fromEntries(
        localFAs.map((focusArea) => [
          focusArea.id,
          focusArea.name.trim().length > 0
            ? getLineTextError(focusArea.name, {
                label: `${capitalizeFirst(singularLabelNoun(focusAreaLabel))} name`,
                maxLength: 80,
                required: true,
                disallowUrl: true,
              })
            : null,
        ]),
      ) as Record<number, string | null>,
    [localFAs],
  );
  const duplicateDepartmentName = useMemo(() => {
    const normalizedNames = localDepts
      .map((department, index) =>
        departmentErrors[index]?.name
          ? ""
          : department.name.trim().replace(/\s+/g, " ").toLowerCase(),
      )
      .filter(Boolean);
    const duplicate = normalizedNames.find(
      (name, index) => normalizedNames.indexOf(name) !== index,
    );
    return duplicate ? `Duplicate name: "${duplicate}"` : null;
  }, [departmentErrors, localDepts]);
  const duplicateFocusAreaName = useMemo(() => {
    const duplicateByDepartment = new Map<number | null, string[]>();
    for (const focusArea of localFAs) {
      if (focusAreaErrors[focusArea.id]) continue;
      const normalizedName = focusArea.name.trim().replace(/\s+/g, " ").toLowerCase();
      if (!normalizedName) continue;
      const key = focusArea.departmentId ?? null;
      const names = duplicateByDepartment.get(key) ?? [];
      names.push(normalizedName);
      duplicateByDepartment.set(key, names);
    }
    for (const names of duplicateByDepartment.values()) {
      const duplicate = names.find((name, index) => names.indexOf(name) !== index);
      if (duplicate) {
        return `Two ${pluralLabelNoun(focusAreaLabel)} are named "${duplicate}". Give each a different name.`;
      }
    }
    return null;
  }, [focusAreaErrors, localFAs]);
  const hasValidationErrors =
    departmentErrors.some((department) => department.name || department.abbr) ||
    Object.values(focusAreaErrors).some(Boolean) ||
    Boolean(duplicateDepartmentName) ||
    Boolean(duplicateFocusAreaName);

  // Only meaningful while editing. Outside edit mode there is no draft to
  // compare: `localDepts`/`localFAs` stay empty until `handleEnterEdit` seeds
  // them from props, so an ungated comparison reports every populated page as
  // dirty and the navigation guard prompts on a page nobody has touched.
  const isDirty = useMemo(() => {
    if (!isEditing) return false;
    const deptsDirty = JSON.stringify(nonEmpty(localDepts)) !== JSON.stringify(depts);
    if (type === "management") return deptsDirty;
    const faDirty =
      JSON.stringify(localFAs.filter((fa) => fa.name.trim())) !== JSON.stringify(propFAs);
    return deptsDirty || faDirty;
  }, [isEditing, localDepts, depts, localFAs, propFAs, nonEmpty, type]);

  const displayList = isEditing ? localDepts : depts;

  const handleDepartmentReorder = useCallback((sourceIdx: number, dropIdx: number) => {
    if (sourceIdx === dropIdx) return;

    setLocalDepts((current) => {
      if (sourceIdx < 0 || sourceIdx >= current.length || dropIdx < 0 || dropIdx > current.length) {
        return current;
      }

      const list = [...current];
      const [item] = list.splice(sourceIdx, 1);
      if (!item) return current;
      list.splice(Math.min(dropIdx, list.length), 0, item);
      return list;
    });
  }, []);

  const departmentReorder = useSmoothReorder({
    items: localDepts,
    enabled: isEditing,
    getId: useCallback((dept: Department) => dept.id, []),
    onReorder: handleDepartmentReorder,
  });

  // ── Enter / Cancel / Save ───────────────────────────────────────────────────
  const syncDraftFromProps = useCallback(() => {
    setLocalDepts([...depts]);
    setLocalFAs([...propFAs]);
    setError(null);
    setDeleteConfirm(null);
    setFaDeleteConfirm(null);
    setPendingHardDeleteDeptIds(new Set());
    setPendingHardDeleteFaIds(new Set());
  }, [depts, faByDept, propFAs, type]);

  // Wizard mode: keep the editor open across saveAll iterations and resync the
  // draft whenever the persisted prop changes (typically because we just saved
  // this section). Without this, temp IDs in localDepts would still differ from
  // the server-assigned real IDs and isDirty would stay true — so a retry after
  // a later section's failure would re-run this save with a stale snapshot and
  // hard-delete the rows we just persisted. Initialized to null so the first
  // mount also hydrates localFAs (lazy useState only seeded localDepts).
  const lastDeptsRef = useRef<Department[] | null>(null);
  const lastPropFAsRef = useRef<FocusArea[] | null>(null);
  useEffect(() => {
    if (!isWizardMode) return;
    if (lastDeptsRef.current !== depts) {
      lastDeptsRef.current = depts;
      setLocalDepts([...depts]);
    }
    if (lastPropFAsRef.current !== propFAs) {
      lastPropFAsRef.current = propFAs;
      setLocalFAs([...propFAs]);
    }
  }, [isWizardMode, depts, propFAs]);

  const handleEnterEdit = () => {
    syncDraftFromProps();
    setIsEditing(true);
  };

  const handleDiscard = () => {
    syncDraftFromProps();
  };

  const handleClose = () => {
    syncDraftFromProps();
    setIsEditing(false);
  };

  const focusAreaFailureMessage = (failed: number, total: number): string => {
    const noun = pluralLabelNoun(focusAreaLabel);
    return failed >= total
      ? `${title} saved, but the ${noun} didn't update. Review and try again.`
      : `${title} saved, but ${failed} of ${total} ${noun} didn't update. Review and try again.`;
  };

  const lastSaveErrorRef = useRef<unknown>(null);

  const handleSave = async () => {
    lastSaveErrorRef.current = null;
    if (hasValidationErrors) {
      lastSaveErrorRef.current = new Error("Validation errors prevent save.");
      setError(
        departmentErrors.find((department) => department.name || department.abbr)?.name ??
          departmentErrors.find((department) => department.name || department.abbr)?.abbr ??
          Object.values(focusAreaErrors).find(Boolean) ??
          duplicateDepartmentName ??
          duplicateFocusAreaName ??
          "Fix the invalid items and try again.",
      );
      return;
    }

    const cleaned = nonEmpty(localDepts).map((department, index) => ({
      ...department,
      name: normalizeLineText(department.name, {
        label: "Department name",
        maxLength: 80,
        required: true,
        disallowUrl: true,
      }),
      abbr:
        normalizeCode(department.abbr, {
          label: "Department abbreviation",
          maxLength: 20,
        }) ||
        normalizeLineText(department.name, {
          label: "Department name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
      sortOrder: index,
    }));

    setSaving(true);
    setError(null);
    // Phase 1 (depts) and Phase 2 (focus areas, scheduled only) are two
    // requests and not atomic. If phase 2 fails, the saved depts are still
    // committed server-side, so we promote that state to local immediately so
    // a retry doesn't re-send the dept save against now-stale `updatedAt` values.
    let savedDepts: Department[] | null = null;
    let focusAreaWrites = 0;
    try {
      // Phase 1: Save departments
      const otherDepts = allDepartments.filter((d) => d.type !== type || !!d.archivedAt);
      savedDepts = await saveDepartments(
        orgId,
        [...otherDepts, ...cleaned],
        allDepartments,
        Array.from(pendingHardDeleteDeptIds),
      );

      let failedFocusAreaWrites = 0;
      // Phase 2: Save focus areas (scheduled only)
      if (type === "scheduled") {
        // Build temp→real ID map for new departments
        const tempToReal = new Map<number, number>();
        for (const c of cleaned) {
          if (c.id < 0) {
            const real = savedDepts.find(
              (sd) =>
                sd.type === "scheduled" &&
                sd.name === c.name &&
                !otherDepts.some((od) => od.id === sd.id),
            );
            if (real) tempToReal.set(c.id, real.id);
          }
        }

        // Determine deleted FAs. FAs whose parent dept is being hard-deleted are
        // cascade-deleted server-side and must not be sent here (the dept row no
        // longer exists at this point).
        const localFaIds = new Set(localFAs.filter((fa) => fa.id > 0).map((fa) => fa.id));
        const deletedFAs = propFAs.filter(
          (fa) =>
            fa.id > 0 &&
            !localFaIds.has(fa.id) &&
            !(fa.departmentId != null && pendingHardDeleteDeptIds.has(fa.departmentId)),
        );

        // Numbered in the order the departments now stand, so a focus area's
        // stored order matches the schedule and print everywhere it is read.
        const plannedFAs = orderFocusAreasByDepartment(
          localFAs,
          cleaned.map((department, index) => ({
            id: department.id,
            type: department.type,
            sortOrder: index,
          })),
        )
          .filter((focusArea) => focusArea.name.trim())
          .map((fa, sortOrder) => {
            const name = normalizeLineText(fa.name, {
              label: `${capitalizeFirst(singularLabelNoun(focusAreaLabel))} name`,
              maxLength: 80,
              required: true,
              disallowUrl: true,
            }).trim();
            const departmentId =
              fa.departmentId && fa.departmentId < 0
                ? (tempToReal.get(fa.departmentId) ?? fa.departmentId)
                : fa.departmentId;
            const orig = fa.id < 0 ? undefined : propFAs.find((p) => p.id === fa.id);
            const changed =
              fa.id < 0 ||
              (orig != null &&
                (orig.name !== name ||
                  orig.sortOrder !== sortOrder ||
                  orig.departmentId !== departmentId));
            return { fa, orig, changed, payload: { ...fa, name, departmentId, sortOrder } };
          });
        const toSave = plannedFAs.filter((planned) => planned.changed);
        focusAreaWrites = toSave.length + deletedFAs.length;

        const result =
          focusAreaWrites > 0
            ? await saveFocusAreas(
                orgId,
                toSave.map(({ fa, payload }) => ({
                  ...(fa.id < 0 ? {} : { id: fa.id }),
                  orgId,
                  departmentId: payload.departmentId,
                  name: payload.name,
                  color: fa.color ?? null,
                  sortOrder: payload.sortOrder,
                })),
                deletedFAs.map((fa) => ({
                  itemId: fa.id,
                  hard: pendingHardDeleteFaIds.has(fa.id),
                })),
              )
            : { upserts: [], deletes: [] };

        const savedByLocalId = new Map<number, FocusArea>();
        toSave.forEach(({ fa }, index) => {
          const outcome = result.upserts[index];
          if (outcome?.ok) savedByLocalId.set(fa.id, outcome.item);
        });
        const removedIds = new Set(
          result.deletes.filter((removal) => removal.ok).map((removal) => removal.itemId),
        );
        failedFocusAreaWrites =
          toSave.length - savedByLocalId.size + (deletedFAs.length - removedIds.size);

        // Only what the server kept: a focus area that failed stays as it was,
        // and a new one that failed isn't shown as saved.
        const savedFAsList: FocusArea[] = [
          ...plannedFAs.flatMap(({ fa, orig, changed, payload }): FocusArea[] => {
            if (!changed) return [{ ...fa, departmentId: payload.departmentId }];
            const saved = savedByLocalId.get(fa.id);
            if (saved) return [saved];
            return orig ? [orig] : [];
          }),
          ...deletedFAs.filter((fa) => !removedIds.has(fa.id)),
        ];

        // Merge saved FAs with unchanged FAs from other departments
        const otherFAs = allFocusAreas.filter(
          (fa) =>
            !depts.some((d) => d.id === fa.departmentId) &&
            !tempToReal.has(fa.departmentId ?? -999),
        );
        onFocusAreasChange([...otherFAs, ...savedFAsList]);

        if (failedFocusAreaWrites > 0 && !isWizardMode) {
          // Keep the draft open for a retry, pointed at what now exists, so
          // the retry doesn't add again what this save already added.
          const realDepts = new Map(savedDepts.map((department) => [department.id, department]));
          setLocalDepts((prev) =>
            prev.map((department) => {
              const realId = tempToReal.get(department.id);
              return (realId != null && realDepts.get(realId)) || department;
            }),
          );
          setLocalFAs((prev) =>
            prev.map((fa) => {
              const saved = savedByLocalId.get(fa.id);
              if (saved) return saved;
              const realDeptId = fa.departmentId != null ? tempToReal.get(fa.departmentId) : null;
              return realDeptId != null ? { ...fa, departmentId: realDeptId } : fa;
            }),
          );
        }
      }

      onDepartmentsChange(savedDepts);
      if (failedFocusAreaWrites > 0) {
        lastSaveErrorRef.current = new Error("Some focus areas did not save.");
        toast.error(focusAreaFailureMessage(failedFocusAreaWrites, focusAreaWrites));
        return;
      }
      // Wizard mode keeps the editor open so saveAll can retry after a later
      // section fails, and so the user can keep adding/editing rows. The local
      // draft is resynced from props via a useEffect below.
      if (!isWizardMode) {
        setIsEditing(false);
        setLocalDepts([]);
        setLocalFAs([]);
      }
      toast.success(`${title} saved`);
    } catch (err) {
      lastSaveErrorRef.current = err;
      // Partial-failure case: depts saved but focus-area phase failed. Promote
      // the saved dept state to the parent so a retry doesn't re-issue Phase 1
      // and trigger a stale-updatedAt conflict.
      if (savedDepts) {
        onDepartmentsChange(savedDepts);
        toast.error(focusAreaFailureMessage(focusAreaWrites, focusAreaWrites));
      } else {
        toast.error(formatClientErrorMessage(err, `We couldn't save ${title.toLowerCase()}.`));
      }
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  };

  // ── Row handlers ──────────────────────────────────────────────────────────
  const handleItemChange = (i: number, value: string) => {
    setLocalDepts((prev) => {
      const updated = prev.map((d, idx) => (idx === i ? { ...d, name: value, abbr: value } : d));
      // Single-FA departments: sync FA name to dept name
      if (type === "scheduled") {
        const dept = updated[i];
        const fas = faByDept(dept.id, localFAs);
        if (fas.length === 1) {
          setLocalFAs((prevFAs) =>
            prevFAs.map((fa) => (fa.id === fas[0].id ? { ...fa, name: value } : fa)),
          );
        }
      }
      return updated;
    });
  };

  const addRow = useCallback(() => {
    const id = nextTmpId.current--;
    const newDept: Department = {
      id,
      orgId,
      name: "",
      abbr: "",
      type,
      sortOrder: localDepts.length,
    };
    setLocalDepts((prev) => [...prev, newDept]);

    // Auto-create a default focus area for new scheduled departments
    if (type === "scheduled") {
      const faId = nextTmpFaId.current--;
      setLocalFAs((prev) => [
        ...prev,
        {
          id: faId,
          orgId,
          departmentId: id,
          name: "",
          sortOrder: 0,
        },
      ]);
    }

    requestAnimationFrame(() => {
      nameRefs.current.get(id)?.focus();
    });
  }, [localDepts.length, orgId, type]);

  const handleDeleteClick = async (i: number) => {
    const dept = (isEditing ? localDepts : depts)[i];
    if (dept.id <= 0) {
      // New unsaved — remove immediately
      setLocalDepts((prev) => prev.filter((_, idx) => idx !== i));
      if (type === "scheduled") {
        setLocalFAs((prev) => prev.filter((fa) => fa.departmentId !== dept.id));
      }
      return;
    }
    const deps = await checkDepartmentDependencies(dept.id, orgId);
    setDeleteConfirm({ idx: i, dept, deps });
  };

  const handleRemove = (i: number, hard: boolean) => {
    const dept = localDepts[i];
    setLocalDepts((prev) => prev.filter((_, idx) => idx !== i));
    if (type === "scheduled") {
      setLocalFAs((prev) => prev.filter((fa) => fa.departmentId !== dept.id));
    }
    if (hard) {
      setPendingHardDeleteDeptIds((prev) => {
        const next = new Set(prev);
        next.add(dept.id);
        return next;
      });
    }
  };

  // ── FA handlers (scheduled only) ──────────────────────────────────────────
  const handleFAChange = (faId: number, value: string) => {
    setLocalFAs((prev) => prev.map((fa) => (fa.id === faId ? { ...fa, name: value } : fa)));
  };

  const addFocusArea = (deptId: number) => {
    const id = nextTmpFaId.current--;
    const existing = faByDept(deptId, localFAs);
    setLocalFAs((prev) => [
      ...prev,
      {
        id,
        orgId,
        departmentId: deptId,
        name: "",
        sortOrder: existing.length,
      },
    ]);
  };

  const handleFADeleteClick = async (fa: FocusArea) => {
    if (fa.id < 0) {
      setLocalFAs((prev) => prev.filter((f) => f.id !== fa.id));
      return;
    }
    const deps = await checkFocusAreaDependencies(fa.id, orgId);
    setFaDeleteConfirm({ faId: fa.id, fa, deps });
  };

  const handleFARemove = (faId: number, hard: boolean) => {
    setLocalFAs((prev) => prev.filter((f) => f.id !== faId));
    if (hard) {
      setPendingHardDeleteFaIds((prev) => {
        const next = new Set(prev);
        next.add(faId);
        return next;
      });
    }
  };

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleNameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    dept: Department,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!dept.name.trim()) return;
      if (idx < localDepts.length - 1) {
        nameRefs.current.get(localDepts[idx + 1].id)?.focus();
      } else {
        addRow();
      }
    }
    if (e.key === "Backspace" && !dept.name && dept.id < 0) {
      e.preventDefault();
      handleRemove(idx, false);
      if (idx > 0) {
        const prevId = localDepts[idx - 1].id;
        requestAnimationFrame(() => {
          nameRefs.current.get(prevId)?.focus();
        });
      }
    }
  };

  // Register with wizard so Continue can save this section.
  useNavigationGuard(`departments:${type}`, { isDirty: () => isDirty });

  useRegisterWizardEditor(
    `departments:${type}`,
    {
      isDirty: () => isDirty,
      hasErrors: () => hasValidationErrors,
      save: async () => {
        await handleSave();
        if (lastSaveErrorRef.current) throw lastSaveErrorRef.current;
      },
    },
    isWizardMode && canEdit,
  );

  // ── Action buttons ────────────────────────────────────────────────────────
  const showReadOnlyEditAction = !isWizardMode && !isEditing && canEdit && displayList.length > 0;
  const footerActions = isWizardMode ? null : isEditing ? (
    <EditorActionRow
      secondaryAction={
        <Button
          onClick={isDirty ? handleDiscard : handleClose}
          className="dg-btn dg-btn-secondary dg-btn-sm"
        >
          {getEditorDismissLabel({ hasUnsavedChanges: isDirty })}
        </Button>
      }
      primaryAction={
        <Button
          onClick={handleSave}
          disabled={saving || !isDirty || hasValidationErrors}
          className="dg-btn dg-btn-primary dg-btn-sm"
        >
          <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
        </Button>
      }
      className="dg-footer-bar [--dg-footer-bar-px:16px]"
    />
  ) : null;

  return (
    <SectionCard noPadding>
      {/* Header: title, description, actions */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 16px 14px",
          borderBottom: "1px solid var(--dg-color-border-light)",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "var(--dg-fs-body)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
              margin: "4px 0 0",
            }}
          >
            {description}
          </p>
        </div>
        {showReadOnlyEditAction ? (
          <Button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary dg-btn-sm">
            Edit
          </Button>
        ) : null}
      </div>

      {/* Content */}
      {displayList.length === 0 && !isEditing ? (
        <EmptyState
          size="compact"
          title={emptyTitle}
          style={{ border: "none", borderRadius: 0 }}
          action={
            canEdit ? (
              <Button onClick={handleEnterEdit} className={addBtnClass} style={{ width: "100%" }}>
                + Add {addLabel}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div>
          {/* Department rows */}
          {displayList.map((dept, i) => {
            const motion = departmentReorder.getItemMotion(dept);
            const childFAs =
              type === "scheduled" ? faByDept(dept.id, isEditing ? localFAs : propFAs) : [];
            // Zero focus areas is a real state (a wizard save interrupted
            // between its two requests leaves it, F-92), and the row must
            // offer a way out of it, not only Delete.
            const hasMultipleFAs = childFAs.length > 1;
            const showFocusAreaRows = type === "scheduled" && childFAs.length !== 1;
            const isSingleFA = type === "scheduled" && childFAs.length === 1;

            return (
              <div
                key={dept.id}
                ref={(node) => departmentReorder.setItemNode(dept, node)}
                className="dg-settings-reorder-group"
                data-dragging={motion.isDragging ? "true" : undefined}
                data-drag-phase={motion.dragPhase ?? undefined}
                data-moving={motion.isMoving ? "true" : undefined}
                style={
                  {
                    "--dg-settings-reorder-offset": `${motion.offsetY}px`,
                  } as React.CSSProperties
                }
              >
                {/* Divider between scheduled department groups */}
                {type === "scheduled" && i > 0 && (
                  <div style={{ borderTop: "1px solid var(--dg-color-border-light)" }} />
                )}

                {/* Department row */}
                <div
                  className={!isEditing ? "dg-hover-row" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: isEditing ? "10px 16px" : "11px 16px",
                    borderBottom:
                      type === "management" && i < displayList.length - 1
                        ? "1px solid var(--dg-color-border-light)"
                        : "none",
                    cursor: isEditing ? "grab" : "default",
                    userSelect: isEditing ? "none" : undefined,
                  }}
                >
                  {isEditing && (
                    <DragHandle
                      label={`Reorder ${dept.name || departmentLabel.replace(/s$/i, "")}`}
                      {...departmentReorder.getHandleProps(i)}
                    />
                  )}

                  {/* Name */}
                  {isEditing ? (
                    <div style={{ flex: 1 }}>
                      <input
                        ref={(el) => {
                          if (el) nameRefs.current.set(dept.id, el);
                          else nameRefs.current.delete(dept.id);
                        }}
                        value={dept.name}
                        onChange={(e) => handleItemChange(i, e.target.value)}
                        onKeyDown={(e) => handleNameKeyDown(e, dept, i)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        draggable={false}
                        placeholder="Department name"
                        style={{
                          ...fieldStyle,
                          flex: 1,
                          ...(departmentErrors[i]?.name
                            ? { borderColor: "var(--dg-color-danger)" }
                            : {}),
                        }}
                      />
                      {departmentErrors[i]?.name ? (
                        <div
                          role="alert"
                          style={{
                            marginTop: 4,
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                          }}
                        >
                          {departmentErrors[i]?.name}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <span
                        style={{
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--dg-color-text-primary)",
                        }}
                      >
                        {dept.name || (
                          <span
                            style={{
                              color: "var(--dg-color-text-muted)",
                              fontStyle: "italic",
                              fontWeight: 400,
                            }}
                          >
                            Unnamed
                          </span>
                        )}
                      </span>

                      {/* Multi-FA count (next to name) */}
                      {hasMultipleFAs && (
                        <span
                          style={{
                            fontSize: "var(--dg-fs-caption)",
                            color: "var(--dg-color-text-muted)",
                          }}
                        >
                          {childFAs.length} {focusAreaLabel.toLowerCase()}
                        </span>
                      )}

                      {/* Spacer */}
                      <span style={{ flex: 1 }} />
                    </>
                  )}

                  {/* Delete button (edit mode) */}
                  {isEditing && (
                    <Button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        return handleDeleteClick(i);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid var(--dg-color-danger-border, #FECACA)",
                        borderRadius: "var(--dg-radius-md)",
                        cursor: "pointer",
                        color: "var(--dg-color-danger)",
                        padding: "5px 10px",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "background 150ms, color 150ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--dg-color-danger-bg, #FEF2F2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "none";
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>

                {/* ── Focus area sub-rows (scheduled only) ─────────────────── */}
                {showFocusAreaRows && (
                  <>
                    {childFAs.length === 0 && isEditing && (
                      <p className="dg-form-hint" style={{ margin: 0, padding: "6px 16px 0 60px" }}>
                        No {focusAreaLabel.toLowerCase()} yet. Add one so shifts can be scheduled
                        here.
                      </p>
                    )}
                    <FocusAreaRows
                      deptId={dept.id}
                      focusAreas={childFAs}
                      isEditing={isEditing}
                      focusAreaLabel={focusAreaLabel}
                      onFocusAreasChange={setLocalFAs}
                      onFocusAreaChange={handleFAChange}
                      onFocusAreaDeleteClick={handleFADeleteClick}
                      focusAreaErrors={focusAreaErrors}
                    />

                    {/* Add focus area button (edit mode) */}
                    {isEditing && (
                      <div style={{ padding: "8px 16px 8px 60px" }}>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            addFocusArea(dept.id);
                          }}
                          className={addBtnClass}
                          style={{ width: "100%" }}
                        >
                          + Add {focusAreaLabel.replace(/s$/i, "")}
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Single-FA: split option (edit mode only) */}
                {type === "scheduled" && isEditing && isSingleFA && (
                  <div style={{ padding: "6px 16px 10px 60px" }}>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        addFocusArea(dept.id);
                      }}
                      className="dg-btn dg-btn-secondary dg-btn-sm"
                      style={{ fontSize: "var(--dg-fs-caption)" }}
                    >
                      + Split into {focusAreaLabel}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Dashed add button (edit mode) */}
          {isEditing && (
            <div style={{ padding: "8px 16px 12px" }}>
              <Button onClick={addRow} className={addBtnClass} style={{ width: "100%" }}>
                + Add {addLabel}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Error banner */}
      {(duplicateDepartmentName || duplicateFocusAreaName || error) && (
        <Banner tone="danger" className="mx-4 mb-3">
          <span className="whitespace-pre-wrap break-words">
            <strong>
              {duplicateDepartmentName || duplicateFocusAreaName
                ? "Validation Error:"
                : "Save Error:"}
            </strong>{" "}
            {duplicateDepartmentName ?? duplicateFocusAreaName ?? error}
          </span>
        </Banner>
      )}

      {footerActions}

      {/* Delete confirmation dialogs */}
      {deleteConfirm &&
        (() => {
          const deps = deleteConfirm.deps;
          const hasActive = deps?.hasDependencies ?? false;
          const hasAny = deps?.hasAnyReferences ?? true;
          if (hasActive) {
            return (
              <ConfirmDialog
                title={`Archive "${deleteConfirm.dept.name}"?`}
                message={
                  <>
                    <strong>{deleteConfirm.dept.name}</strong> is currently{" "}
                    {deps!.summary.toLowerCase()}.{" "}
                    {"It stays on past schedules but can't be picked for anything new."}
                  </>
                }
                confirmLabel="Archive"
                variant="warning"
                onConfirm={() => {
                  handleRemove(deleteConfirm.idx, false);
                  setDeleteConfirm(null);
                }}
                onCancel={() => setDeleteConfirm(null)}
                secondaryConfirmLabel="Rename instead"
                onSecondaryConfirm={() => {
                  setDeleteConfirm(null);
                  requestAnimationFrame(() => {
                    nameRefs.current.get(deleteConfirm.dept.id)?.focus();
                    nameRefs.current.get(deleteConfirm.dept.id)?.select();
                  });
                }}
              />
            );
          }
          if (hasAny) {
            return (
              <ConfirmDialog
                title={`Archive "${deleteConfirm.dept.name}"?`}
                message="It stays on past schedules but can't be picked for anything new."
                confirmLabel="Archive"
                variant="warning"
                onConfirm={() => {
                  handleRemove(deleteConfirm.idx, false);
                  setDeleteConfirm(null);
                }}
                onCancel={() => setDeleteConfirm(null)}
              />
            );
          }
          return (
            <ConfirmDialog
              title={`Delete "${deleteConfirm.dept.name}"?`}
              message={`Nothing uses ${deleteConfirm.dept.name || "this department"}, so it's deleted permanently and no history is lost.`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={() => {
                handleRemove(deleteConfirm.idx, true);
                setDeleteConfirm(null);
              }}
              onCancel={() => setDeleteConfirm(null)}
            />
          );
        })()}

      {faDeleteConfirm &&
        (() => {
          const deps = faDeleteConfirm.deps;
          const hasActive = deps?.hasDependencies ?? false;
          const hasAny = deps?.hasAnyReferences ?? true;
          if (hasActive) {
            return (
              <ConfirmDialog
                title={`Archive "${faDeleteConfirm.fa.name}"?`}
                message={
                  <>
                    <strong>{faDeleteConfirm.fa.name}</strong> is currently{" "}
                    {deps!.summary.toLowerCase()}.{" "}
                    {"It stays on past schedules but can't be picked for anything new."}
                  </>
                }
                confirmLabel="Archive"
                variant="warning"
                onConfirm={() => {
                  handleFARemove(faDeleteConfirm.faId, false);
                  setFaDeleteConfirm(null);
                }}
                onCancel={() => setFaDeleteConfirm(null)}
              />
            );
          }
          if (hasAny) {
            return (
              <ConfirmDialog
                title={`Archive "${faDeleteConfirm.fa.name}"?`}
                message="It stays on past schedules but can't be picked for anything new."
                confirmLabel="Archive"
                variant="warning"
                onConfirm={() => {
                  handleFARemove(faDeleteConfirm.faId, false);
                  setFaDeleteConfirm(null);
                }}
                onCancel={() => setFaDeleteConfirm(null)}
              />
            );
          }
          return (
            <ConfirmDialog
              title={`Delete "${faDeleteConfirm.fa.name}"?`}
              message={`Nothing uses ${faDeleteConfirm.fa.name || `this ${singularLabelNoun(focusAreaLabel)}`}, so it's deleted permanently.`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={() => {
                handleFARemove(faDeleteConfirm.faId, true);
                setFaDeleteConfirm(null);
              }}
              onCancel={() => setFaDeleteConfirm(null)}
            />
          );
        })()}
    </SectionCard>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DepartmentsSettings({
  departments,
  focusAreas,
  orgId,
  focusAreaLabel,
  departmentLabel,
  canManageFocusAreas,
  onDepartmentsChange,
  onFocusAreasChange,
}: DepartmentsSettingsProps) {
  const canEdit = canManageFocusAreas;
  const scheduledDepartmentLabel = departmentLabel || "Scheduled Departments";
  const managementDepartmentLabel = "Management Departments";

  const scheduledDepts = departments
    .filter((d) => d.type === "scheduled" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const managementDepts = departments
    .filter((d) => d.type === "management" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <DepartmentSection
        title={scheduledDepartmentLabel}
        description={`${scheduledDepartmentLabel} appear on the grid. Each one has one or more ${focusAreaLabel.toLowerCase()} that define how staff are grouped on the schedule.`}
        depts={scheduledDepts}
        allDepartments={departments}
        focusAreas={focusAreas}
        orgId={orgId}
        type="scheduled"
        canEdit={canEdit}
        focusAreaLabel={focusAreaLabel}
        departmentLabel={scheduledDepartmentLabel}
        onDepartmentsChange={onDepartmentsChange}
        onFocusAreasChange={onFocusAreasChange}
      />

      <DepartmentSection
        title={managementDepartmentLabel}
        description="For people who use the app but don't appear on the schedule (e.g. HR, Reception, Finance)."
        depts={managementDepts}
        allDepartments={departments}
        focusAreas={focusAreas}
        orgId={orgId}
        type="management"
        canEdit={canEdit}
        focusAreaLabel={focusAreaLabel}
        departmentLabel={managementDepartmentLabel}
        onDepartmentsChange={onDepartmentsChange}
        onFocusAreasChange={onFocusAreasChange}
      />
    </div>
  );
}
