"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect } from "react";
import { NamedItem, Department } from "@/types";
import { Button } from "@/components/Button";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { Hint, MaybeHint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { StatusPill } from "@/components/ui/status-pill";
import { SectionCard } from "./shared";
import { getAdaptiveSettingsTableLayout } from "./settings-table-layout";
import { useSmoothReorder } from "./useSmoothReorder";
import type { DependencyInfo } from "@/features/settings/client";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getCompactNamedItemLabel } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { useRegisterWizardEditor, useWizardMode } from "@/components/onboarding/WizardModeContext";

export default function StringListSettings({
  label,
  items,
  onSave,
  placeholder,
  canEdit = true,
  hideAbbr = false,
  departments,
  initialEditing,
  onEditingChange,
  onCheckDependencies,
  sectionTitle,
  showScheduleRoleToggle = false,
  scheduleEligibilityHelpText,
  certifications,
  showRequiredCertifications = false,
  maxWidth,
}: {
  label: string;
  items: NamedItem[];
  /**
   * Persist the edited list. `hardDeleteIds` lists IDs the user confirmed for
   * permanent deletion (no archived row left behind). The server always
   * re-verifies before performing a hard delete.
   */
  onSave: (items: NamedItem[], hardDeleteIds: number[]) => Promise<void>;
  placeholder: string;
  canEdit?: boolean;
  hideAbbr?: boolean;
  departments?: Department[];
  /** Start in edit mode immediately (e.g. during onboarding). */
  initialEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  /** Check if an item has dependencies before deletion. If provided, shows a warning dialog. */
  onCheckDependencies?: (itemId: number) => Promise<DependencyInfo>;
  /** When provided, wraps content in a SectionCard. */
  sectionTitle?: string;
  /** Shows an extra toggle used to mark which roles affect schedule job eligibility. */
  showScheduleRoleToggle?: boolean;
  /** Optional visible helper copy for the schedule-eligibility header. */
  scheduleEligibilityHelpText?: string;
  /** Certifications selectable as a role's requirement. Roles list only. */
  certifications?: NamedItem[];
  /** Shows the per-role picker for which certifications qualify someone for a role. */
  showRequiredCertifications?: boolean;
  /** Optional max width for the card wrapper when this list is shown as a settings section. */
  maxWidth?: number;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isWizardMode = useWizardMode();
  const [isEditing, setIsEditing] = useState(isWizardMode ? true : (initialEditing ?? false));

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    idx: number;
    item: NamedItem;
    deps: DependencyInfo | null;
  } | null>(null);
  const [pendingHardDeleteIds, setPendingHardDeleteIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompactLabelControls, setShowCompactLabelControls] = useState(false);
  const hideAbbrFields = hideAbbr && !showCompactLabelControls;

  // Wizard mode: when the persisted `items` prop changes (typically because we
  // just saved this list), resync the local draft so its IDs match the server.
  // Without this, the next saveAll would see negative temp IDs vs real IDs and
  // report isDirty=true, causing a retry-after-failure to re-run the save with
  // a stale snapshot that hard-deletes the rows we just created.
  const itemsRef = useRef(items);
  useEffect(() => {
    if (!isWizardMode) return;
    if (itemsRef.current === items) return;
    itemsRef.current = items;
    setLocal(items);
  }, [isWizardMode, items]);
  const nextTmpId = useRef(-1);
  const nameRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const abbrRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Clean comparison: ignore empty uncommitted rows
  const nonEmpty = useCallback((list: NamedItem[]) => list.filter((it) => it.name.trim()), []);
  const rowErrors = useMemo(
    () =>
      local.map((item) => ({
        name:
          item.name.trim().length > 0
            ? getLineTextError(item.name, {
                label: "Name",
                maxLength: 80,
                required: true,
                disallowUrl: true,
              })
            : null,
        abbr:
          !hideAbbrFields && item.abbr.trim().length > 0
            ? getCodeError(item.abbr, {
                label: "Abbreviation",
                maxLength: 20,
              })
            : null,
      })),
    [hideAbbrFields, local],
  );
  const duplicateName = useMemo(() => {
    const normalizedNames = local
      .map((item, index) => {
        if (rowErrors[index]?.name) {
          return "";
        }
        return item.name.trim().replace(/\s+/g, " ").toLowerCase();
      })
      .filter(Boolean);
    const duplicate = normalizedNames.find(
      (name, index) => normalizedNames.indexOf(name) !== index,
    );
    return duplicate ? `Duplicate name: "${duplicate}"` : null;
  }, [local, rowErrors]);
  const hasValidationErrors =
    rowErrors.some((row) => row.name || row.abbr) || Boolean(duplicateName);
  // Only meaningful while editing: the draft is reseeded from `items` on entry
  // and on close, so outside edit mode a stale draft would report dirty and the
  // navigation guard would prompt on a page nobody has touched.
  const isDirty = useMemo(
    () => isEditing && JSON.stringify(nonEmpty(local)) !== JSON.stringify(items),
    [isEditing, local, items, nonEmpty],
  );

  const displayList = isEditing ? local : items;

  const handleReorder = useCallback((sourceIdx: number, dropIdx: number) => {
    if (sourceIdx === dropIdx) return;

    setLocal((current) => {
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

  const reorder = useSmoothReorder({
    items: local,
    enabled: isEditing,
    getId: useCallback((item: NamedItem) => item.id, []),
    onReorder: handleReorder,
    fallbackHeight: 54,
  });

  const handleEnterEdit = () => {
    setLocal([...items]);
    setIsEditing(true);
    setShowCompactLabelControls(false);
    setError(null);
  };

  const resetDraft = useCallback(() => {
    setLocal([...items]);
    setError(null);
    setDeleteConfirm(null);
    setPendingHardDeleteIds(new Set());
  }, [items]);

  const handleDiscard = () => {
    resetDraft();
  };

  const handleClose = () => {
    resetDraft();
    setIsEditing(false);
    setShowCompactLabelControls(false);
  };

  const lastSaveErrorRef = useRef<unknown>(null);

  const handleSave = async () => {
    lastSaveErrorRef.current = null;
    if (hasValidationErrors) {
      lastSaveErrorRef.current = new Error("Validation errors prevent save.");
      setError(
        rowErrors.find((row) => row.name || row.abbr)?.name ??
          rowErrors.find((row) => row.name || row.abbr)?.abbr ??
          duplicateName ??
          "Fix the invalid items and try again.",
      );
      return;
    }

    const cleaned = nonEmpty(local).map((it, i) => ({
      ...it,
      name: normalizeLineText(it.name, {
        label: "Name",
        maxLength: 80,
        required: true,
        disallowUrl: true,
      }),
      abbr:
        normalizeCode(it.abbr, {
          label: "Abbreviation",
          maxLength: 20,
        }) || getCompactNamedItemLabel(it),
      isScheduleRole: showScheduleRoleToggle ? (it.isScheduleRole ?? true) : it.isScheduleRole,
      departmentIds: it.departmentIds ?? [],
      requiredCertificationIds: showRequiredCertifications
        ? (it.requiredCertificationIds ?? [])
        : it.requiredCertificationIds,
      sortOrder: i,
    }));

    // A name no longer needs duplicating per department now that one item can
    // list several, so uniqueness is by name alone (matching the DB index).
    const keys = cleaned.map((it) => it.name.toLowerCase());
    const dupes = keys.filter((k, i) => k && keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      const dupeName = dupes[0];
      lastSaveErrorRef.current = new Error(`Duplicate name: "${dupeName}"`);
      setError(`Duplicate name: "${dupeName}"`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(cleaned, Array.from(pendingHardDeleteIds));
      setPendingHardDeleteIds(new Set());
      // Wizard mode stays editable so the user can keep refining if the broader
      // saveAll fails on a later section. Non-wizard usage collapses back to
      // read-only after a successful save.
      if (!isWizardMode) setIsEditing(false);
    } catch (err) {
      lastSaveErrorRef.current = err;
      toast.error(formatClientErrorMessage(err, `We couldn't save ${label.toLowerCase()}.`));
    } finally {
      setSaving(false);
    }
  };

  useNavigationGuard(`string-list:${label}`, { isDirty: () => isDirty });

  useRegisterWizardEditor(
    `string-list:${label}`,
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

  const addRow = useCallback(() => {
    const id = nextTmpId.current--;
    setLocal((prev) => [
      ...prev,
      {
        id,
        orgId: "",
        name: "",
        abbr: "",
        isScheduleRole: showScheduleRoleToggle ? true : undefined,
        sortOrder: prev.length,
        departmentId: null,
      },
    ]);
    requestAnimationFrame(() => {
      nameRefs.current.get(id)?.focus();
    });
  }, [showScheduleRoleToggle]);

  const handleRemove = (i: number, hard: boolean) => {
    const item = local[i];
    setLocal((prev) => prev.filter((_, idx) => idx !== i));
    if (hard && item && item.id > 0) {
      setPendingHardDeleteIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    }
  };

  const handleDeleteClick = async (i: number) => {
    const item = local[i];
    // New unsaved items (negative ID) — remove immediately without confirmation
    if (item.id <= 0) {
      handleRemove(i, false);
      return;
    }
    // Existing items — check dependencies
    if (onCheckDependencies) {
      const deps = await onCheckDependencies(item.id);
      setDeleteConfirm({ idx: i, item, deps });
    } else {
      // No dependency checker provided — fall back to archive on save
      handleRemove(i, false);
    }
  };

  const activeDepts = useMemo(
    () => (departments ?? []).filter((d) => !d.archivedAt && d.type === "scheduled"),
    [departments],
  );
  const deptMap = useMemo(() => new Map(activeDepts.map((d) => [d.id, d])), [activeDepts]);
  const showDept = activeDepts.length > 0;

  const handleItemChange = (i: number, field: "name" | "abbr", value: string) => {
    setLocal((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const handleDeptToggle = (i: number, departmentId: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        const current = item.departmentIds ?? [];
        const next = current.includes(departmentId)
          ? current.filter((id) => id !== departmentId)
          : [...current, departmentId];
        return { ...item, departmentIds: next };
      }),
    );
  };

  /** Clearing every department is what "org-wide" means. */
  const handleDeptClear = (i: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, departmentIds: [] } : item)),
    );
  };

  const activeCerts = useMemo(
    () => (certifications ?? []).filter((c) => !c.archivedAt),
    [certifications],
  );
  const certMap = useMemo(() => new Map(activeCerts.map((c) => [c.id, c])), [activeCerts]);
  const showCerts = showRequiredCertifications && activeCerts.length > 0;

  const handleCertToggle = (i: number, certificationId: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        const current = item.requiredCertificationIds ?? [];
        const next = current.includes(certificationId)
          ? current.filter((id) => id !== certificationId)
          : [...current, certificationId];
        return { ...item, requiredCertificationIds: next };
      }),
    );
  };

  /** Clearing every certification is what "assignable to anyone" means. */
  const handleCertClear = (i: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, requiredCertificationIds: [] } : item)),
    );
  };

  const handleNameKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hideAbbrFields) {
        if (!item.name.trim()) return;
        if (idx < local.length - 1) {
          nameRefs.current.get(local[idx + 1].id)?.focus();
        } else {
          addRow();
        }
      } else {
        abbrRefs.current.get(item.id)?.focus();
      }
    }
  };

  const handleAbbrKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!item.name.trim() && !item.abbr.trim()) return;
      if (idx < local.length - 1) {
        nameRefs.current.get(local[idx + 1].id)?.focus();
      } else {
        addRow();
      }
    }
  };

  const handleNameBackspace = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Backspace" && !item.name && !item.abbr && item.id < 0) {
      e.preventDefault();
      handleRemove(idx, false);
      if (idx > 0) {
        const prevId = local[idx - 1].id;
        requestAnimationFrame(() => {
          if (hideAbbrFields) {
            nameRefs.current.get(prevId)?.focus();
          } else {
            abbrRefs.current.get(prevId)?.focus();
          }
        });
      }
    }
  };

  // ── Input style ────────────────────────────────────────────────────────────
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

  const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

  const useCompactRoleColumns = showScheduleRoleToggle;
  const tableColumns = useMemo(() => {
    const columns = [
      {
        header: hideAbbrFields ? "Name" : "Full name",
        values: displayList.map((item) => item.name),
        minWidth: 220,
        maxWidth: 360,
      },
    ];

    if (!hideAbbrFields) {
      columns.push({
        header: "Abbreviation",
        values: displayList.map((item) => item.abbr),
        minWidth: 120,
        maxWidth: 180,
      });
    }
    if (showScheduleRoleToggle) {
      columns.push({
        header: "Schedule eligibility",
        values: ["Yes", "No"],
        minWidth: 170,
        maxWidth: 200,
      });
    }
    if (showDept) {
      columns.push({
        header: "Department",
        values: activeDepts.map((department) => department.name),
        minWidth: 150,
        maxWidth: isEditing ? 300 : 260,
      });
    }
    if (showCerts) {
      columns.push({
        header: "Requires",
        values: activeCerts.map((certification) => certification.name),
        minWidth: 220,
        maxWidth: isEditing ? 420 : 380,
      });
    }

    return columns;
  }, [
    activeCerts,
    activeDepts,
    displayList,
    hideAbbrFields,
    isEditing,
    showCerts,
    showDept,
    showScheduleRoleToggle,
  ]);
  const tableLayout = useMemo(
    () =>
      getAdaptiveSettingsTableLayout({
        columns: tableColumns,
        isEditing,
        availableWidth: maxWidth ?? 1120,
      }),
    [isEditing, maxWidth, tableColumns],
  );
  const gridCols = tableLayout.gridTemplateColumns;

  useLayoutEffect(() => {
    if (!isEditing) return;

    for (const field of nameRefs.current.values()) {
      const borderHeight = field.offsetHeight - field.clientHeight;
      field.style.height = "0px";
      field.style.height = `${Math.max(36, field.scrollHeight + borderHeight)}px`;
    }
  }, [gridCols, isEditing, local]);

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
      style={{
        marginTop: 12,
        padding: sectionTitle ? "12px 16px" : undefined,
        borderTop: sectionTitle ? "1px solid var(--dg-color-border-light)" : undefined,
      }}
    />
  ) : null;

  const content = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {showReadOnlyEditAction ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 16px",
            borderBottom: "1px solid var(--dg-color-border-light)",
          }}
        >
          <Button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary dg-btn-sm">
            Edit
          </Button>
        </div>
      ) : null}
      {hideAbbr && isEditing && canEdit ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid var(--dg-color-border-light)",
          }}
        >
          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
            Compact labels are used only where space is limited, such as the schedule grid.
          </span>
          <Button
            type="button"
            aria-expanded={showCompactLabelControls}
            onClick={() => setShowCompactLabelControls((current) => !current)}
            className="dg-btn dg-btn-secondary dg-btn-sm"
          >
            {showCompactLabelControls ? "Hide compact labels" : "Customize compact labels"}
          </Button>
        </div>
      ) : null}
      {/* Table */}
      {displayList.length === 0 && !isEditing ? (
        <EmptyState
          size="compact"
          title={`No ${label.toLowerCase()} defined yet`}
          action={
            canEdit ? (
              <Button onClick={handleEnterEdit} className={addBtnClass} style={{ width: "100%" }}>
                + Add {label.replace(/s$/, "")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          data-compact-role-table={useCompactRoleColumns ? "true" : undefined}
          data-settings-table-layout="adaptive"
          data-settings-table-mode={isEditing ? "edit" : "read"}
          style={{ width: "100%", maxWidth: tableLayout.maxWidth }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              padding: "8px 16px",
              gap: 16,
              alignItems: "start",
              borderBottom: "1px solid var(--dg-color-border-light)",
            }}
          >
            {(isEditing
              ? hideAbbrFields
                ? [
                    "",
                    "Name",
                    ...(showScheduleRoleToggle ? ["Schedule eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    ...(showCerts ? ["Requires"] : []),
                    "",
                  ]
                : [
                    "",
                    "Full name",
                    "Abbreviation",
                    ...(showScheduleRoleToggle ? ["Schedule eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    ...(showCerts ? ["Requires"] : []),
                    "",
                  ]
              : hideAbbrFields
                ? [
                    "Name",
                    ...(showScheduleRoleToggle ? ["Schedule eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    ...(showCerts ? ["Requires"] : []),
                  ]
                : [
                    "Full name",
                    "Abbreviation",
                    ...(showScheduleRoleToggle ? ["Schedule eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    ...(showCerts ? ["Requires"] : []),
                  ]
            ).map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: "var(--dg-type-table-heading-size)",
                  fontWeight: "var(--dg-type-table-heading-weight)",
                  color: "var(--dg-type-table-heading-color)",
                  letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
                  lineHeight: "var(--dg-type-table-heading-line-height)",
                }}
              >
                {h === "Schedule eligibility" && scheduleEligibilityHelpText ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{h}</span>
                    <span
                      style={{
                        fontSize: "var(--dg-type-metadata-size)",
                        fontWeight: "var(--dg-type-metadata-weight)",
                        letterSpacing: "normal",
                        textTransform: "none",
                        color: "var(--dg-color-text-muted)",
                        lineHeight: 1.35,
                      }}
                    >
                      {scheduleEligibilityHelpText}
                    </span>
                  </span>
                ) : (
                  h
                )}
              </div>
            ))}
          </div>

          {/* Item rows */}
          {displayList.map((item, i) => {
            const motion = reorder.getItemMotion(item);
            const currentErrors = rowErrors[i] ?? { name: null, abbr: null };
            return (
              <div
                key={item.id}
                ref={(node) => reorder.setItemNode(item, node)}
                className="dg-settings-reorder-item"
                data-dragging={motion.isDragging ? "true" : undefined}
                data-drag-phase={motion.dragPhase ?? undefined}
                data-moving={motion.isMoving ? "true" : undefined}
                style={
                  {
                    "--dg-settings-reorder-offset": `${motion.offsetY}px`,
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    padding: isEditing ? "10px 16px" : "11px 16px",
                    gap: 16,
                    alignItems: isEditing ? "start" : undefined,
                    borderBottom:
                      i < displayList.length - 1
                        ? "1px solid var(--dg-color-border-light)"
                        : "none",
                    cursor: isEditing ? "grab" : "default",
                    userSelect: isEditing ? "none" : undefined,
                  } as React.CSSProperties
                }
              >
                {isEditing && (
                  <button
                    type="button"
                    {...reorder.getHandleProps(i)}
                    aria-label={`Reorder ${item.name || label}. Use Arrow Up or Arrow Down to move.`}
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
                )}

                {isEditing ? (
                  <div>
                    <textarea
                      ref={(el) => {
                        if (el) nameRefs.current.set(item.id, el);
                        else nameRefs.current.delete(item.id);
                      }}
                      rows={1}
                      value={item.name}
                      onChange={(e) => handleItemChange(i, "name", e.target.value)}
                      onKeyDown={(e) => {
                        handleNameBackspace(e, item, i);
                        handleNameKeyDown(e, item, i);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                      placeholder="Full name"
                      style={{
                        ...fieldStyle,
                        minHeight: 36,
                        lineHeight: 1.4,
                        resize: "none",
                        overflowY: "hidden",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        ...(currentErrors.name ? { borderColor: "var(--dg-color-danger)" } : {}),
                      }}
                    />
                    {currentErrors.name ? (
                      <div
                        role="alert"
                        style={{
                          marginTop: 4,
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-danger)",
                        }}
                      >
                        {currentErrors.name}
                      </div>
                    ) : null}
                  </div>
                ) : item.name && showScheduleRoleToggle ? (
                  <div
                    data-role-name-text="true"
                    style={{
                      minWidth: 0,
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 600,
                      lineHeight: 1.4,
                      color: "var(--dg-color-text-primary)",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.name}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 600,
                      color: "var(--dg-color-text-primary)",
                    }}
                  >
                    {item.name || (
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
                  </div>
                )}

                {!hideAbbrFields &&
                  (isEditing ? (
                    <div>
                      <input
                        ref={(el) => {
                          if (el) abbrRefs.current.set(item.id, el);
                          else abbrRefs.current.delete(item.id);
                        }}
                        value={item.abbr}
                        onChange={(e) => handleItemChange(i, "abbr", e.target.value)}
                        onKeyDown={(e) => handleAbbrKeyDown(e, item, i)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        draggable={false}
                        placeholder="Abbreviation"
                        aria-label={`Compact label for ${item.name || "new item"}`}
                        style={{
                          ...fieldStyle,
                          fontWeight: 600,
                          ...(currentErrors.abbr ? { borderColor: "var(--dg-color-danger)" } : {}),
                        }}
                      />
                      {currentErrors.abbr ? (
                        <div
                          role="alert"
                          style={{
                            marginTop: 4,
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                          }}
                        >
                          {currentErrors.abbr}
                        </div>
                      ) : null}
                      {hideAbbr ? (
                        <Button
                          type="button"
                          disabled={!item.abbr.trim()}
                          onClick={() => handleItemChange(i, "abbr", "")}
                          className="dg-btn dg-btn-ghost dg-btn-sm"
                          style={{
                            marginTop: 4,
                            opacity: item.abbr.trim() ? undefined : 0.7,
                          }}
                        >
                          {item.abbr.trim()
                            ? "Use automatic"
                            : `Using automatic: ${getCompactNamedItemLabel(item)}`}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 500,
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {item.abbr}
                    </div>
                  ))}

                {showScheduleRoleToggle &&
                  (isEditing ? (
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: "var(--dg-fs-label)",
                        color: "var(--dg-color-text-secondary)",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="dg-checkbox"
                        checked={item.isScheduleRole ?? true}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setLocal((prev) =>
                            prev.map((candidate, idx) =>
                              idx === i ? { ...candidate, isScheduleRole: checked } : candidate,
                            ),
                          );
                        }}
                        draggable={false}
                      />
                      <span>Use for job eligibility</span>
                    </label>
                  ) : (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 500,
                        color: "var(--dg-color-text-primary)",
                      }}
                    >
                      {item.isScheduleRole === false ? "No" : "Yes"}
                    </div>
                  ))}

                {showDept &&
                  (isEditing ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                      className="dg-role-department-edit-pills"
                    >
                      {/* Multi-select: an item can belong to several departments.
                          Org-wide is the explicit empty-list state. */}
                      <SelectableTag
                        selected={(item.departmentIds ?? []).length === 0}
                        onClick={() => handleDeptClear(i)}
                        title="Org-wide"
                      >
                        Org-wide
                      </SelectableTag>
                      {activeDepts.map((d) => (
                        <SelectableTag
                          key={d.id}
                          selected={(item.departmentIds ?? []).includes(d.id)}
                          onClick={() => handleDeptToggle(i, d.id)}
                          title={d.name}
                        >
                          {d.name}
                        </SelectableTag>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(item.departmentIds ?? []).length > 0 ? (
                        <span
                          style={{
                            fontSize: "var(--dg-fs-label)",
                            fontWeight: 500,
                            color: "var(--dg-color-text-secondary)",
                          }}
                        >
                          {(item.departmentIds ?? [])
                            .map((id) => deptMap.get(id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 8px",
                            borderRadius: 20,
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            background: "var(--dg-color-brand-bg)",
                            border: "1px solid var(--dg-color-brand-border)",
                            color: "var(--dg-color-brand)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Org-wide
                        </span>
                      )}
                    </div>
                  ))}

                {showCerts &&
                  (isEditing ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                      style={{ display: "flex", flexDirection: "column", gap: 6 }}
                    >
                      <div className="dg-role-requirement-edit-pills">
                        {/* Selecting none leaves the role assignable to anyone;
                            any selected certification qualifies on its own. */}
                        <SelectableTag
                          selected={(item.requiredCertificationIds ?? []).length === 0}
                          onClick={() => handleCertClear(i)}
                          title="Anyone"
                        >
                          Anyone
                        </SelectableTag>
                        {activeCerts.map((c) => (
                          <SelectableTag
                            key={c.id}
                            selected={(item.requiredCertificationIds ?? []).includes(c.id)}
                            onClick={() => handleCertToggle(i, c.id)}
                            title={c.name}
                          >
                            {c.name}
                          </SelectableTag>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <RoleRequirementPills
                      requirements={
                        (item.requiredCertificationIds ?? []).length > 0
                          ? (item.requiredCertificationIds ?? []).map(
                              (id) => certMap.get(id)?.name ?? "Unknown certification",
                            )
                          : ["Anyone"]
                      }
                    />
                  ))}

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
            );
          })}

          {/* Dashed add button — only in edit mode */}
          {isEditing && (
            <div style={{ padding: "8px 16px 12px" }}>
              <Button onClick={addRow} className={addBtnClass} style={{ width: "100%" }}>
                + Add {placeholder.toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      )}

      {(duplicateName || error) && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--dg-color-danger-bg)",
            border: "1px solid var(--dg-color-danger-border)",
            borderRadius: "var(--dg-radius-md)",
            color: "var(--dg-color-danger-text)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 500,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <strong>{duplicateName ? "Validation Error:" : "Save Error:"}</strong>{" "}
          {duplicateName ?? error}
        </div>
      )}

      {footerActions}

      {deleteConfirm &&
        (() => {
          const deps = deleteConfirm.deps;
          const hasActive = deps?.hasDependencies ?? false;
          const hasAny = deps?.hasAnyReferences ?? true;
          if (hasActive) {
            return (
              <ConfirmDialog
                title={`Archive "${deleteConfirm.item.name}"?`}
                message={
                  <>
                    <strong>{deleteConfirm.item.name}</strong> is currently{" "}
                    {deps!.summary.toLowerCase()}.
                    <br />
                    <br />
                    Archiving will preserve historical records but remove it from dropdowns and new
                    assignments. Consider renaming instead if this item is still needed under a
                    different name.
                  </>
                }
                confirmLabel="Archive"
                variant="warning"
                onConfirm={() => {
                  handleRemove(deleteConfirm.idx, false);
                  setDeleteConfirm(null);
                }}
                onCancel={() => setDeleteConfirm(null)}
                secondaryConfirmLabel="Rename Instead"
                onSecondaryConfirm={() => {
                  setDeleteConfirm(null);
                  requestAnimationFrame(() => {
                    nameRefs.current.get(deleteConfirm.item.id)?.focus();
                    nameRefs.current.get(deleteConfirm.item.id)?.select();
                  });
                }}
              />
            );
          }
          if (hasAny) {
            return (
              <ConfirmDialog
                title={`Archive "${deleteConfirm.item.name}"?`}
                message={
                  <>
                    This will archive <strong>{deleteConfirm.item.name}</strong>. Historical records
                    will be preserved.
                  </>
                }
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
              title={`Delete "${deleteConfirm.item.name}"?`}
              message={
                <>
                  This will permanently delete <strong>{deleteConfirm.item.name}</strong>. Nothing
                  references it.
                </>
              }
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
    </div>
  );

  if (sectionTitle) {
    return (
      <SectionCard noPadding maxWidth={tableLayout.maxWidth} align="start">
        {content}
      </SectionCard>
    );
  }

  return content;
}

export function getTwoRowRequirementFit({
  containerWidth,
  pillWidths,
  overflowWidths,
  gap = 6,
}: {
  containerWidth: number;
  pillWidths: number[];
  overflowWidths: Map<number, number>;
  gap?: number;
}): number {
  if (containerWidth <= 0 || pillWidths.length === 0) return pillWidths.length;

  const fitsInTwoRows = (widths: number[]) => {
    let rows = 1;
    let usedWidth = 0;

    for (const width of widths) {
      if (width > containerWidth) return false;
      if (usedWidth === 0) {
        usedWidth = width;
      } else if (usedWidth + gap + width <= containerWidth) {
        usedWidth += gap + width;
      } else {
        rows += 1;
        usedWidth = width;
      }
      if (rows > 2) return false;
    }

    return true;
  };

  for (let visibleCount = pillWidths.length; visibleCount >= 0; visibleCount -= 1) {
    const hiddenCount = pillWidths.length - visibleCount;
    const widths = pillWidths.slice(0, visibleCount);
    if (hiddenCount > 0) widths.push(overflowWidths.get(hiddenCount) ?? 0);
    if (fitsInTwoRows(widths)) return visibleCount;
  }

  return 0;
}

function RoleRequirementPills({ requirements }: { requirements: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pillMeasureRefs = useRef(new Map<number, HTMLSpanElement>());
  const overflowMeasureRefs = useRef(new Map<number, HTMLSpanElement>());
  const [visibleCount, setVisibleCount] = useState(Math.min(2, requirements.length));

  const recalculate = useCallback(() => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const pillWidths = requirements.map(
      (_, index) => pillMeasureRefs.current.get(index)?.getBoundingClientRect().width ?? 0,
    );
    const overflowWidths = new Map<number, number>();
    for (let hiddenCount = 1; hiddenCount <= requirements.length; hiddenCount += 1) {
      overflowWidths.set(
        hiddenCount,
        overflowMeasureRefs.current.get(hiddenCount)?.getBoundingClientRect().width ?? 0,
      );
    }

    if (containerWidth <= 0 || pillWidths.some((width) => width <= 0)) return;
    setVisibleCount(getTwoRowRequirementFit({ containerWidth, pillWidths, overflowWidths }));
  }, [requirements]);

  useLayoutEffect(() => {
    recalculate();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    void document.fonts?.ready.then(recalculate);
    return () => observer.disconnect();
  }, [recalculate]);

  const visibleRequirements = requirements.slice(0, visibleCount);
  const hiddenRequirements = requirements.slice(visibleCount);

  return (
    <div className="dg-role-requirement-cell">
      <div ref={containerRef} className="dg-role-requirement-pills dg-role-requirement-pills--view">
        {visibleRequirements.map((requirement, index) => (
          <MaybeHint key={`${index}-${requirement}`} content={requirement}>
            <StatusPill tone="neutral" variant="category" className="dg-role-requirement-view-pill">
              <span className="dg-role-requirement-pill-label">{requirement}</span>
            </StatusPill>
          </MaybeHint>
        ))}
        {hiddenRequirements.length > 0 ? (
          <Hint content={hint(hiddenRequirements.join(", "))} side="top">
            <button
              type="button"
              className="dg-role-requirement-overflow-trigger"
              aria-label={`${hiddenRequirements.length} more requirements: ${hiddenRequirements.join(", ")}`}
            >
              <StatusPill tone="neutral" variant="category">
                +{hiddenRequirements.length} more
              </StatusPill>
            </button>
          </Hint>
        ) : null}
      </div>

      <div className="dg-role-requirement-measurer" aria-hidden="true">
        {requirements.map((requirement, index) => (
          <span
            key={`pill-${index}-${requirement}`}
            ref={(node) => {
              if (node) pillMeasureRefs.current.set(index, node);
              else pillMeasureRefs.current.delete(index);
            }}
          >
            <StatusPill tone="neutral" variant="category">
              <span className="dg-role-requirement-pill-label">{requirement}</span>
            </StatusPill>
          </span>
        ))}
        {requirements.map((_, index) => {
          const hiddenCount = index + 1;
          return (
            <span
              key={`overflow-${hiddenCount}`}
              ref={(node) => {
                if (node) overflowMeasureRefs.current.set(hiddenCount, node);
                else overflowMeasureRefs.current.delete(hiddenCount);
              }}
            >
              <StatusPill tone="neutral" variant="category">
                +{hiddenCount} more
              </StatusPill>
            </span>
          );
        })}
      </div>
    </div>
  );
}
