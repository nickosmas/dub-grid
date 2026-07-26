"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { ShiftCategory, FocusArea } from "@/types";
import {
  checkShiftCategoryDependencies,
  deleteShiftCategory,
  upsertShiftCategory,
} from "@/features/settings/client";
import type { DependencyInfo } from "@/features/settings/client";
import { fmt12h, calcTimeDuration, calcNetDuration, resolveEffectiveBreak } from "@/lib/utils";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { labelStyle, inputStyle, PresetColorPicker, TimeInput12h } from "./shared";
import { EmptyState } from "@/components/EmptyState";
import {
  DEFAULT_PREDEFINED_COLOR_BG,
  PREDEFINED_COLORS,
  borderColor,
  getPresetByBg,
  toDarkPillColors,
} from "@/lib/colors";
import { formatClientErrorMessage } from "@/lib/client-facing";

// ── Shift Categories Settings ──────────────────────────────────────────────────
const SHIFT_ABBR_MAX_LENGTH = 8;
const SHIFT_ABBR_IGNORED_WORDS = new Set(["shift"]);

function deriveShiftAbbreviation(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .filter((word) => !SHIFT_ABBR_IGNORED_WORDS.has(word.toLowerCase()));

  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();

  return words
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, SHIFT_ABBR_MAX_LENGTH)
    .toUpperCase();
}

function normalizeShiftAbbreviation(abbr: string | null | undefined, name: string): string | null {
  const explicit = abbr?.trim().toUpperCase().slice(0, SHIFT_ABBR_MAX_LENGTH) ?? "";
  const derived = deriveShiftAbbreviation(name);
  return explicit || derived || null;
}

function ShiftCategoriesSettings({
  shiftCategories,
  focusAreas,
  orgId,
  onChange,
  canManageScheduleDefinitions,
}: {
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
  orgId: string;
  onChange: (categories: ShiftCategory[]) => void;
  canManageScheduleDefinitions: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const [local, setLocal] = useState<(ShiftCategory & { isNew?: boolean })[]>(shiftCategories);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [catDepInfo, setCatDepInfo] = useState<DependencyInfo | null>(null);

  const handleDeleteClick = async (catId: number) => {
    const cat = local.find((c) => c.id === catId);
    if (!cat) return;
    if ((cat as { isNew?: boolean }).isNew) {
      handleDelete(cat, false);
      return;
    }
    const deps = await checkShiftCategoryDependencies(catId, orgId);
    setCatDepInfo(deps);
    setConfirmDeleteId(catId);
  };
  const originalRef = useRef<Map<number, ShiftCategory>>(
    new Map(shiftCategories.map((c) => [c.id, c])),
  );
  // Keep originalRef in sync when props update (e.g. concurrent edits)
  useEffect(() => {
    originalRef.current = new Map(shiftCategories.map((c) => [c.id, c]));
  }, [shiftCategories]);
  const nextTmpId = useRef(-1);
  const newCategoryDefaultsRef = useRef<Map<number, ShiftCategory & { isNew: boolean }>>(new Map());
  const pendingExitRef = useRef<
    { type: "open"; categoryId: number } | { type: "add"; focusAreaId: number | null } | null
  >(null);

  const createDraftCategory = (focusAreaId: number | null) => {
    const tmpId = nextTmpId.current--;
    const siblingCount = local.filter((c) => c.focusAreaId === focusAreaId).length;
    const defaultColor =
      PREDEFINED_COLORS[siblingCount % PREDEFINED_COLORS.length]?.bg ?? DEFAULT_PREDEFINED_COLOR_BG;
    const tmp: ShiftCategory & { isNew: boolean } = {
      id: tmpId,
      orgId: orgId,
      name: "",
      abbr: "",
      startTime: null,
      endTime: null,
      color: defaultColor,
      sortOrder: siblingCount,
      focusAreaId,
      isNew: true,
    };
    newCategoryDefaultsRef.current.set(tmpId, tmp);
    setLocal((prev) => [...prev, tmp]);
    setEditingId(tmpId);
  };

  const handleChange = (id: number, field: keyof ShiftCategory, value: string | number | null) => {
    setLocal((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleNameChange = (cat: ShiftCategory & { isNew?: boolean }, value: string) => {
    const currentAbbr = cat.abbr?.trim().toUpperCase() ?? "";
    const previousSuggestedAbbr = deriveShiftAbbreviation(cat.name);
    const shouldUpdateSuggestedAbbr = currentAbbr === "" || currentAbbr === previousSuggestedAbbr;
    const nextSuggestedAbbr = deriveShiftAbbreviation(value);

    setLocal((prev) =>
      prev.map((entry) =>
        entry.id === cat.id
          ? {
              ...entry,
              name: value,
              abbr: shouldUpdateSuggestedAbbr ? nextSuggestedAbbr : entry.abbr,
            }
          : entry,
      ),
    );
  };

  const handleAbbrChange = (id: number, value: string) => {
    handleChange(id, "abbr", value.toUpperCase().slice(0, SHIFT_ABBR_MAX_LENGTH));
  };

  const isCategoryDirty = (cat: ShiftCategory & { isNew?: boolean }) => {
    const orig = originalRef.current.get(cat.id);
    return (
      cat.isNew ||
      !orig ||
      cat.name !== orig.name ||
      normalizeShiftAbbreviation(cat.abbr, cat.name) !==
        normalizeShiftAbbreviation(orig.abbr, orig.name) ||
      (cat.startTime ?? null) !== (orig.startTime ?? null) ||
      (cat.endTime ?? null) !== (orig.endTime ?? null) ||
      (cat.color ?? DEFAULT_PREDEFINED_COLOR_BG) !== (orig.color ?? DEFAULT_PREDEFINED_COLOR_BG) ||
      (cat.breakMinutes ?? null) !== (orig.breakMinutes ?? null)
    );
  };

  const resetCategoryDraft = (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      const initialDraft = newCategoryDefaultsRef.current.get(cat.id);
      if (!initialDraft) return;
      setLocal((prev) => prev.map((entry) => (entry.id === cat.id ? { ...initialDraft } : entry)));
      return;
    }

    const orig = originalRef.current.get(cat.id);
    if (!orig) return;
    setLocal((prev) => prev.map((entry) => (entry.id === cat.id ? orig : entry)));
  };

  const discardCategoryChanges = (
    cat: ShiftCategory & { isNew?: boolean },
    closeAfter: boolean,
  ) => {
    if (cat.isNew) {
      if (closeAfter) {
        newCategoryDefaultsRef.current.delete(cat.id);
        setLocal((prev) => prev.filter((entry) => entry.id !== cat.id));
      } else {
        resetCategoryDraft(cat);
      }
    } else {
      resetCategoryDraft(cat);
    }

    if (closeAfter) {
      setEditingId(null);
    }
  };

  const completePendingExit = () => {
    const pending = pendingExitRef.current;
    pendingExitRef.current = null;
    if (!pending) return;
    if (pending.type === "open") {
      setEditingId(pending.categoryId);
      return;
    }
    createDraftCategory(pending.focusAreaId);
  };

  const currentEditingCategory =
    editingId == null ? null : (local.find((category) => category.id === editingId) ?? null);
  const hasUnsavedEditingChanges = currentEditingCategory
    ? isCategoryDirty(currentEditingCategory)
    : false;

  const { requestClose: requestEditorClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasUnsavedEditingChanges,
    onDiscard: () => {
      if (!currentEditingCategory) return;
      discardCategoryChanges(currentEditingCategory, true);
      completePendingExit();
    },
  });

  const attemptOpenCategory = (categoryId: number) => {
    if (editingId === categoryId) return;
    if (hasUnsavedEditingChanges) {
      pendingExitRef.current = { type: "open", categoryId };
      if (!requestEditorClose()) return;
      pendingExitRef.current = null;
    }
    setEditingId(categoryId);
  };

  const handleAdd = (focusAreaId: number | null) => {
    if (hasUnsavedEditingChanges) {
      pendingExitRef.current = { type: "add", focusAreaId };
      if (!requestEditorClose()) return;
      pendingExitRef.current = null;
    }
    createDraftCategory(focusAreaId);
  };

  const handleClose = (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      newCategoryDefaultsRef.current.delete(cat.id);
      setLocal((prev) => prev.filter((entry) => entry.id !== cat.id));
    }
    setEditingId(null);
  };

  const handleSave = async (cat: ShiftCategory & { isNew?: boolean }) => {
    const nameError = getLineTextError(cat.name, {
      label: "Shift name",
      maxLength: 50,
      required: true,
      disallowUrl: true,
    });
    const abbrError = cat.abbr?.trim()
      ? getCodeError(cat.abbr, {
          label: "Shift code",
          maxLength: SHIFT_ABBR_MAX_LENGTH,
          uppercase: true,
        })
      : null;
    if (nameError || abbrError) return;
    setSaving(cat.id);
    try {
      const saved = await upsertShiftCategory({
        id: cat.isNew ? undefined : cat.id,
        orgId: orgId,
        name: normalizeLineText(cat.name, {
          label: "Shift name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        }),
        abbr: cat.abbr?.trim()
          ? normalizeCode(cat.abbr, {
              label: "Shift code",
              maxLength: SHIFT_ABBR_MAX_LENGTH,
              uppercase: true,
            })
          : normalizeShiftAbbreviation(cat.abbr, cat.name),
        startTime: cat.startTime || null,
        endTime: cat.endTime || null,
        color: cat.color ?? DEFAULT_PREDEFINED_COLOR_BG,
        sortOrder: cat.sortOrder,
        focusAreaId: cat.focusAreaId ?? null,
        breakMinutes: cat.breakMinutes ?? null,
      });
      if (cat.isNew) {
        newCategoryDefaultsRef.current.delete(cat.id);
      }
      originalRef.current.set(saved.id, saved);
      const updated = local.map((c) => (c.id === cat.id ? saved : c));
      setLocal(updated);
      onChange(updated);

      setEditingId(null);
      toast.success("Category saved");
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Failed to save category"));
      Sentry.captureException(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (cat: ShiftCategory & { isNew?: boolean }, hard: boolean) => {
    if (cat.isNew) {
      newCategoryDefaultsRef.current.delete(cat.id);
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      setEditingId(null);
      return;
    }
    setDeleting(cat.id);
    try {
      await deleteShiftCategory(cat.id, orgId, hard);
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      toast.success(hard ? "Category deleted" : "Category archived");
    } catch (err) {
      toast.error("Failed to delete category");
      Sentry.captureException(err);
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

  const renderCategoryRow = (cat: ShiftCategory & { isNew?: boolean }) => {
    const isEditing = editingId === cat.id;
    const isSavingThis = saving === cat.id;
    const isDeletingThis = deleting === cat.id;
    const isDirty = isCategoryDirty(cat);
    const nameError =
      cat.name.trim().length > 0
        ? getLineTextError(cat.name, {
            label: "Shift name",
            maxLength: 50,
            required: true,
            disallowUrl: true,
          })
        : null;
    const abbrError = cat.abbr?.trim()
      ? getCodeError(cat.abbr, {
          label: "Shift code",
          maxLength: SHIFT_ABBR_MAX_LENGTH,
          uppercase: true,
        })
      : null;
    // Name uniqueness is scoped per focus area to match the DB's partial unique
    // indexes (shift_categories_area_name_unique / shift_categories_global_name_unique).
    // Archived shifts are excluded since the DB indexes filter on archived_at IS NULL.
    const duplicateName =
      cat.name.trim().length > 0 &&
      local.some(
        (candidate) =>
          candidate.id !== cat.id &&
          candidate.archivedAt == null &&
          (candidate.focusAreaId ?? null) === (cat.focusAreaId ?? null) &&
          candidate.name.trim().toLowerCase() === cat.name.trim().toLowerCase(),
      );
    // Code uniqueness mirrors the name rule: per (org, focus_area) when scoped
    // to a focus area, per org for area-less shifts. Archived shifts excluded.
    const normalizedCode = normalizeShiftAbbreviation(cat.abbr, cat.name);
    const duplicateCode =
      Boolean(normalizedCode) &&
      local.some(
        (candidate) =>
          candidate.id !== cat.id &&
          candidate.archivedAt == null &&
          (candidate.focusAreaId ?? null) === (cat.focusAreaId ?? null) &&
          normalizeShiftAbbreviation(candidate.abbr, candidate.name)?.toUpperCase() ===
            normalizedCode?.toUpperCase(),
      );
    const previewColor = cat.color ?? DEFAULT_PREDEFINED_COLOR_BG;
    const previewPreset = getPresetByBg(previewColor);
    const previewDisplay = isDarkTheme ? toDarkPillColors(previewPreset.bg) : previewPreset;
    const rawPreviewLabel = normalizedCode ?? "";
    const previewLabel = (rawPreviewLabel || "S").toUpperCase();

    if (!isEditing) {
      return (
        <div
          key={cat.id}
          className="dg-hover-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 8px",
            borderRadius: "var(--dg-radius-md)",
            transition: "background 0.15s",
            cursor: canManageScheduleDefinitions ? "pointer" : undefined,
          }}
          onClick={canManageScheduleDefinitions ? () => attemptOpenCategory(cat.id) : undefined}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
                minWidth: 34,
                height: 30,
                padding: "0 8px",
                borderRadius: "var(--dg-radius-sm)",
                background: previewDisplay.bg,
                border: `1px solid ${borderColor(previewDisplay.text)}`,
                color: previewDisplay.text,
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {previewLabel}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {cat.name || (
                    <span
                      style={{
                        color: "var(--color-text-muted)",
                        fontStyle: "italic",
                        fontWeight: 400,
                      }}
                    >
                      Untitled
                    </span>
                  )}
                </span>
                {(cat.startTime || cat.endTime) && (
                  <span
                    style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}
                  >
                    {fmt12h(cat.startTime)} – {fmt12h(cat.endTime)}
                    {calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes) && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontWeight: 700,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        ({calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes)})
                      </span>
                    )}
                  </span>
                )}
              </div>
              {resolveEffectiveBreak(cat.breakMinutes) > 0 && (
                <div
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-text-faint)",
                    marginTop: 2,
                  }}
                >
                  incl. {resolveEffectiveBreak(cat.breakMinutes)}m break
                </div>
              )}
            </div>
          </div>
          {canManageScheduleDefinitions && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                attemptOpenCategory(cat.id);
              }}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              Edit
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        key={cat.id}
        style={{
          background: "var(--color-bg-secondary)",
          borderRadius: "var(--dg-radius-lg)",
          padding: "14px 16px",
          margin: "8px 0",
          border: "1px solid var(--color-border-light)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={labelStyle}>NAME</label>
            <input
              value={cat.name}
              onChange={(e) => handleNameChange(cat, e.target.value)}
              placeholder="e.g. Day Shift"
              maxLength={50}
              style={{
                ...inputStyle,
                ...(nameError || duplicateName ? { borderColor: "var(--color-danger)" } : {}),
              }}
              autoFocus
              disabled={!canManageScheduleDefinitions}
            />
            {nameError || duplicateName ? (
              <p
                role="alert"
                style={{
                  margin: "4px 0 0",
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--color-danger)",
                }}
              >
                {nameError ?? "Another shift in this focus area already uses that name."}
              </p>
            ) : null}
          </div>
          <div>
            <label style={labelStyle}>CODE</label>
            <input
              value={cat.abbr ?? ""}
              onChange={(e) => handleAbbrChange(cat.id, e.target.value)}
              placeholder={deriveShiftAbbreviation(cat.name) || "D"}
              maxLength={SHIFT_ABBR_MAX_LENGTH}
              style={{
                ...inputStyle,
                textTransform: "uppercase",
                ...(abbrError || duplicateCode ? { borderColor: "var(--color-danger)" } : {}),
              }}
              disabled={!canManageScheduleDefinitions}
            />
            {abbrError || duplicateCode ? (
              <p
                role="alert"
                style={{
                  margin: "4px 0 0",
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--color-danger)",
                }}
              >
                {abbrError ?? "Another shift in this focus area already uses that code."}
              </p>
            ) : null}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>COLOR</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <PresetColorPicker
              valueBg={previewColor}
              onChange={(color) => handleChange(cat.id, "color", color.bg)}
              disabled={!canManageScheduleDefinitions}
            />
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 48,
                height: 34,
                padding: "0 12px",
                borderRadius: "var(--dg-radius-sm)",
                background: previewDisplay.bg,
                border: `1px solid ${borderColor(previewDisplay.text)}`,
                color: previewDisplay.text,
                fontSize: "var(--dg-fs-label)",
                fontWeight: 800,
              }}
            >
              {previewLabel}
            </span>
          </div>
        </div>
        {/* START / END / BREAK — single row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "end",
            marginBottom: 12,
          }}
        >
          <div>
            <label style={labelStyle}>START</label>
            <TimeInput12h
              value={cat.startTime}
              onChange={(v) => handleChange(cat.id, "startTime", v)}
              disabled={!canManageScheduleDefinitions}
            />
          </div>
          <div>
            <label style={labelStyle}>END</label>
            <TimeInput12h
              value={cat.endTime}
              onChange={(v) => handleChange(cat.id, "endTime", v)}
              disabled={!canManageScheduleDefinitions}
            />
          </div>
          <div>
            <label style={labelStyle}>BREAK (MIN)</label>
            <input
              type="number"
              min={0}
              max={480}
              value={cat.breakMinutes ?? ""}
              onChange={(e) => {
                const val =
                  e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
                handleChange(cat.id, "breakMinutes", val);
              }}
              placeholder="None"
              style={{ ...inputStyle, width: 100 }}
              disabled={!canManageScheduleDefinitions}
            />
          </div>
        </div>
        {/* Duration pill */}
        {calcTimeDuration(cat.startTime, cat.endTime) && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-light)",
              borderRadius: 6,
              padding: "4px 10px",
              marginBottom: 12,
            }}
          >
            {(() => {
              const effectiveBreak = resolveEffectiveBreak(cat.breakMinutes);
              const gross = calcTimeDuration(cat.startTime, cat.endTime);
              const net = calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes);
              if (effectiveBreak > 0) {
                return (
                  <>
                    Gross: {gross} · Break: {effectiveBreak}m · Net:{" "}
                    <span style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
                      {net}
                    </span>
                  </>
                );
              }
              return (
                <>
                  Duration:{" "}
                  <span style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
                    {gross}
                  </span>
                </>
              );
            })()}
          </div>
        )}
        {/* Actions */}
        <EditorActionRow
          destructiveAction={
            canManageScheduleDefinitions && !cat.isNew ? (
              <button
                onClick={() => handleDeleteClick(cat.id)}
                disabled={isDeletingThis}
                className="dg-btn dg-btn-danger dg-btn-sm"
              >
                {isDeletingThis ? "…" : "Delete"}
              </button>
            ) : undefined
          }
          secondaryAction={
            <button
              onClick={() =>
                cat.isNew || !isDirty ? handleClose(cat) : discardCategoryChanges(cat, false)
              }
              disabled={isSavingThis}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              {getEditorDismissLabel({
                hasUnsavedChanges: isDirty,
                isCreating: Boolean(cat.isNew),
              })}
            </button>
          }
          primaryAction={
            <button
              onClick={() => handleSave(cat)}
              disabled={
                isSavingThis ||
                !cat.name.trim() ||
                !isDirty ||
                !canManageScheduleDefinitions ||
                Boolean(nameError) ||
                Boolean(abbrError) ||
                duplicateName ||
                duplicateCode
              }
              className="dg-btn dg-btn-primary dg-btn-sm"
            >
              {getEditorSaveLabel(isSavingThis)}
            </button>
          }
        />
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Define the primary shift blocks for each focus area (for example Day, Evening, and Night).
      </p>

      {focusAreas.length === 0 && (
        <EmptyState
          size="compact"
          title="No focus areas yet"
          description="Create focus areas first, then add shifts to each one."
        />
      )}

      {focusAreas.map((focusArea) => {
        const areaCats = local.filter((c) => c.focusAreaId === focusArea.id);
        return (
          <div
            key={focusArea.id}
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border-light)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-secondary)",
              }}
            >
              {focusArea.name}
            </div>
            {areaCats.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {areaCats.map((cat, i) => (
                  <React.Fragment key={cat.id}>
                    {renderCategoryRow(cat)}
                    {i < areaCats.length - 1 && (
                      <div style={{ height: 1, background: "var(--color-border-light)" }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <EmptyState
                size="compact"
                title="No shifts yet"
                action={
                  canManageScheduleDefinitions ? (
                    <button
                      onClick={() => handleAdd(focusArea.id)}
                      className="dg-btn dg-btn-secondary dg-btn-sm"
                    >
                      + Add Shift
                    </button>
                  ) : undefined
                }
                style={{ margin: "12px 16px" }}
              />
            )}
            {areaCats.length > 0 && canManageScheduleDefinitions && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button
                  onClick={() => handleAdd(focusArea.id)}
                  className={addBtnClass}
                  style={{ width: "100%" }}
                >
                  + Add Shift
                </button>
              </div>
            )}
          </div>
        );
      })}

      {unsavedChangesDialog}

      {confirmDeleteId !== null &&
        (() => {
          const cat = local.find((c) => c.id === confirmDeleteId);
          if (!cat) return null;
          const hasActive = catDepInfo?.hasDependencies ?? false;
          const hasAny = catDepInfo?.hasAnyReferences ?? true;
          if (hasActive) {
            return (
              <ConfirmDialog
                title={`Archive "${cat.name}"?`}
                message={
                  <>
                    <strong>{cat.name}</strong> is currently {catDepInfo!.summary.toLowerCase()}.
                    <br />
                    <br />
                    Archiving will preserve historical records. Any derived compatibility labels
                    tied to this shift will become uncategorized.
                  </>
                }
                confirmLabel="Archive"
                variant="warning"
                isLoading={deleting === confirmDeleteId}
                onConfirm={() => handleDelete(cat, false)}
                onCancel={() => setConfirmDeleteId(null)}
              />
            );
          }
          if (hasAny) {
            return (
              <ConfirmDialog
                title={`Archive "${cat.name}"?`}
                message={
                  <>
                    This will archive <strong>{cat.name || "this category"}</strong>. Historical
                    records will be preserved.
                  </>
                }
                confirmLabel="Archive"
                variant="warning"
                isLoading={deleting === confirmDeleteId}
                onConfirm={() => handleDelete(cat, false)}
                onCancel={() => setConfirmDeleteId(null)}
              />
            );
          }
          return (
            <ConfirmDialog
              title={`Delete "${cat.name}"?`}
              message={
                <>
                  This will permanently delete <strong>{cat.name || "this category"}</strong>.
                  Nothing references it.
                </>
              }
              confirmLabel="Delete"
              variant="danger"
              isLoading={deleting === confirmDeleteId}
              onConfirm={() => handleDelete(cat, true)}
              onCancel={() => setConfirmDeleteId(null)}
            />
          );
        })()}
    </div>
  );
}

export default ShiftCategoriesSettings;
