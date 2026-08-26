"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { NamedItem, Department } from "@/types";
import { Button } from "@/components/Button";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { SectionCard } from "./shared";
import { useSmoothReorder } from "./useSmoothReorder";
import type { DependencyInfo } from "@/features/settings/client";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { formatClientErrorMessage } from "@/lib/client-facing";
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
  onCheckDependencies,
  sectionTitle,
  showScheduleRoleToggle = false,
  scheduleEligibilityHelpText,
  maxWidth,
  wideTable = false,
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
  /** Check if an item has dependencies before deletion. If provided, shows a warning dialog. */
  onCheckDependencies?: (itemId: number) => Promise<DependencyInfo>;
  /** When provided, wraps content in a SectionCard. */
  sectionTitle?: string;
  /** Shows an extra toggle used to mark which roles affect schedule job eligibility. */
  showScheduleRoleToggle?: boolean;
  /** Optional visible helper copy for the schedule-eligibility header. */
  scheduleEligibilityHelpText?: string;
  /** Optional max width for the card wrapper when this list is shown as a settings section. */
  maxWidth?: number;
  /** Give dense multi-column staff label tables more room per column. */
  wideTable?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isWizardMode = useWizardMode();
  const [isEditing, setIsEditing] = useState(isWizardMode ? true : (initialEditing ?? false));
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    idx: number;
    item: NamedItem;
    deps: DependencyInfo | null;
  } | null>(null);
  const [pendingHardDeleteIds, setPendingHardDeleteIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const nameRefs = useRef<Map<number, HTMLInputElement>>(new Map());
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
          !hideAbbr && item.abbr.trim().length > 0
            ? getCodeError(item.abbr, {
                label: "Abbreviation",
                maxLength: 20,
              })
            : null,
      })),
    [hideAbbr, local],
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
        }) ||
        normalizeLineText(it.name, {
          label: "Name",
          maxLength: 80,
          required: true,
          disallowUrl: true,
        }),
      isScheduleRole: showScheduleRoleToggle ? (it.isScheduleRole ?? true) : it.isScheduleRole,
      // Also applied here, not just on toggle, so rows that predate the rule
      // are normalized rather than persisting a second spelling of org-wide.
      departmentIds: collapseIfEveryDepartment(it.departmentIds ?? []),
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

  /**
   * Selecting every department says the same thing as org-wide, so store the
   * org-wide form. They are not merely equivalent today: org-wide also picks up
   * departments added later, which is what someone selecting all of them means.
   *
   * Skipped when there is only one department, where "all" and "that one" are
   * the same set and collapsing would leave the picker unable to scope at all.
   */
  const collapseIfEveryDepartment = useCallback(
    (departmentIds: number[]): number[] =>
      activeDepts.length > 1 && activeDepts.every((d) => departmentIds.includes(d.id))
        ? []
        : departmentIds,
    [activeDepts],
  );

  const handleDeptToggle = (i: number, departmentId: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        const current = item.departmentIds ?? [];
        const next = current.includes(departmentId)
          ? current.filter((id) => id !== departmentId)
          : [...current, departmentId];
        return { ...item, departmentIds: collapseIfEveryDepartment(next) };
      }),
    );
  };

  /** Clearing every department is what "org-wide" means. */
  const handleDeptClear = (i: number) => {
    setLocal((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, departmentIds: [] } : item)),
    );
  };

  const handleNameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hideAbbr) {
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
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Backspace" && !item.name && !item.abbr && item.id < 0) {
      e.preventDefault();
      handleRemove(idx, false);
      if (idx > 0) {
        const prevId = local[idx - 1].id;
        requestAnimationFrame(() => {
          if (hideAbbr) {
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
    borderRadius: 6,
    background: "var(--dg-color-surface)",
    color: "var(--dg-color-text-primary)",
    outline: "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  };

  const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

  const deptCol = showDept
    ? isMobile
      ? " minmax(100px, 1fr)"
      : wideTable
        ? " minmax(180px, 1fr)"
        : " minmax(140px, 1fr)"
    : "";
  const scheduleRoleCol = showScheduleRoleToggle
    ? wideTable && !isMobile
      ? " 220px"
      : " 160px"
    : "";
  const gridCols = hideAbbr
    ? isEditing
      ? `24px 2fr${scheduleRoleCol}${deptCol} auto`
      : `2fr${scheduleRoleCol}${deptCol}`
    : isEditing
      ? `24px 2fr 1fr${scheduleRoleCol}${deptCol} auto`
      : `2fr 1fr${scheduleRoleCol}${deptCol}`;

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
          <ButtonLoading loading={saving} loadingLabel={EDITOR_ACTION_LABELS.saving}>
            {EDITOR_ACTION_LABELS.save}
          </ButtonLoading>
        </Button>
      }
      style={{
        marginTop: 12,
        padding: sectionTitle ? "12px 16px" : undefined,
        borderTop: sectionTitle ? "1px solid var(--dg-color-border-light)" : undefined,
      }}
    />
  ) : canEdit && displayList.length > 0 ? (
    <EditorActionRow
      primaryAction={
        <Button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary dg-btn-sm">
          Edit
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
        <div>
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
              ? hideAbbr
                ? [
                    "",
                    "Name",
                    ...(showScheduleRoleToggle ? ["Schedule Eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    "",
                  ]
                : [
                    "",
                    "Full Name",
                    "Abbreviation",
                    ...(showScheduleRoleToggle ? ["Schedule Eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                    "",
                  ]
              : hideAbbr
                ? [
                    "Name",
                    ...(showScheduleRoleToggle ? ["Schedule Eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                  ]
                : [
                    "Full Name",
                    "Abbreviation",
                    ...(showScheduleRoleToggle ? ["Schedule Eligibility"] : []),
                    ...(showDept ? ["Department"] : []),
                  ]
            ).map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-subtle)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {h === "Schedule Eligibility" && scheduleEligibilityHelpText ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{h}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
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
                  <div
                    {...reorder.getHandleProps(i)}
                    role="button"
                    aria-label={`Reorder ${item.name || label}`}
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
                  </div>
                )}

                {isEditing ? (
                  <div>
                    <input
                      ref={(el) => {
                        if (el) nameRefs.current.set(item.id, el);
                        else nameRefs.current.delete(item.id);
                      }}
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

                {!hideAbbr &&
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
                    <div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          background:
                            item.isScheduleRole === false
                              ? "var(--dg-color-bg-secondary)"
                              : "var(--dg-color-brand-bg)",
                          border:
                            item.isScheduleRole === false
                              ? "1px solid var(--dg-color-border-light)"
                              : "1px solid var(--dg-color-brand-border)",
                          color:
                            item.isScheduleRole === false
                              ? "var(--dg-color-text-muted)"
                              : "var(--dg-color-brand)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.isScheduleRole === false ? "Cosmetic only" : "Schedule eligible"}
                      </span>
                    </div>
                  ))}

                {showDept &&
                  (isEditing ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                      style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
                    >
                      {/* Multi-select: an item can belong to several
                          departments, and selecting none means org-wide. */}
                      <DeptToggle
                        label="Org-wide"
                        selected={(item.departmentIds ?? []).length === 0}
                        onClick={() => handleDeptClear(i)}
                      />
                      {activeDepts.map((d) => (
                        <DeptToggle
                          key={d.id}
                          label={d.name}
                          selected={(item.departmentIds ?? []).includes(d.id)}
                          onClick={() => handleDeptToggle(i, d.id)}
                        />
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
                      borderRadius: 8,
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
                    loadingLabel="Checking"
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
      <SectionCard noPadding maxWidth={maxWidth}>
        {content}
      </SectionCard>
    );
  }

  return content;
}

/**
 * One department in the multi-select. A pill rather than a checkbox row so the
 * whole set stays readable inside a table cell.
 */
function DeptToggle({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: "pointer",
        background: selected ? "var(--dg-color-brand-bg)" : "var(--dg-color-bg-secondary)",
        border: `1px solid ${selected ? "var(--dg-color-brand-border)" : "var(--dg-color-border-light)"}`,
        color: selected ? "var(--dg-color-brand)" : "var(--dg-color-text-secondary)",
      }}
    >
      {label}
    </Button>
  );
}
