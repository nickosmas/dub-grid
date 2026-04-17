"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ShiftCode, FocusArea, ShiftCategory, NamedItem, AbsenceType, ShiftDisplayMode } from "@/types";
import { upsertShiftCode, deleteShiftCode, upsertAbsenceType, deleteAbsenceType, checkShiftCodeDependencies, checkAbsenceTypeDependencies } from "@/lib/db";
import type { DependencyInfo } from "@/lib/db";
import { fmt12h, calcTimeDuration } from "@/lib/utils";
import { PREDEFINED_COLORS, TRANSPARENT_BORDER, borderColor } from "@/lib/colors";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";
import { PresetColorPicker, TimeInput12h, labelStyle, inputStyle, normalizeTimeCompare } from "./shared";
import { EmptyState } from "@/components/EmptyState";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { ExplainerSection, PreviewFrame } from "@/components/ui/explainer-section";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";

type ShiftCodeFormState = {
  label: string;
  name: string;
  color: string;
  border: string;
  text: string;
  categoryId: number | null;
  focusAreaId: number | null;
  requiredCertificationIds: number[];
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultDurationHours: number | null;
  defaultDurationMinutes: number | null;
};

type AbsenceTypeFormState = {
  label: string;
  name: string;
  color: string;
  border: string;
  text: string;
};

function buildShiftCodeFormState(src: ShiftCode, shiftCategories: ShiftCategory[]): ShiftCodeFormState {
  const category = src.categoryId != null ? shiftCategories.find((c) => c.id === src.categoryId) ?? null : null;
  const timesMatchCategory = category != null
    && normalizeTimeCompare(src.defaultStartTime) === normalizeTimeCompare(category.startTime)
    && normalizeTimeCompare(src.defaultEndTime) === normalizeTimeCompare(category.endTime);

  return {
    label: src.label,
    name: src.name,
    color: src.color === "transparent" ? PREDEFINED_COLORS[0].bg : src.color,
    border: src.border === "transparent" ? TRANSPARENT_BORDER : src.border,
    text: src.text === "transparent" ? PREDEFINED_COLORS[0].text : src.text,
    categoryId: src.categoryId ?? null,
    focusAreaId: src.focusAreaId ?? null,
    requiredCertificationIds: [...(src.requiredCertificationIds ?? [])],
    defaultStartTime: timesMatchCategory ? null : normalizeTimeCompare(src.defaultStartTime),
    defaultEndTime: timesMatchCategory ? null : normalizeTimeCompare(src.defaultEndTime),
    defaultDurationHours: src.defaultDurationHours ?? null,
    defaultDurationMinutes: src.defaultDurationMinutes ?? null,
  };
}

function serializeShiftCodeFormState(form: ShiftCodeFormState, shiftCategories: ShiftCategory[]): string {
  const category = form.categoryId != null ? shiftCategories.find((c) => c.id === form.categoryId) ?? null : null;
  const normalizedStartTime = normalizeTimeCompare(form.defaultStartTime);
  const normalizedEndTime = normalizeTimeCompare(form.defaultEndTime);
  const inheritsCategoryTime = category != null
    && normalizedStartTime === normalizeTimeCompare(category.startTime)
    && normalizedEndTime === normalizeTimeCompare(category.endTime);

  return JSON.stringify({
    label: form.label.trim(),
    name: form.name.trim(),
    color: form.color,
    border: form.border,
    text: form.text,
    categoryId: form.categoryId ?? null,
    focusAreaId: form.focusAreaId ?? null,
    requiredCertificationIds: [...form.requiredCertificationIds].sort((a, b) => a - b),
    defaultStartTime: inheritsCategoryTime ? null : normalizedStartTime,
    defaultEndTime: inheritsCategoryTime ? null : normalizedEndTime,
    defaultDurationHours: form.defaultDurationHours ?? null,
    defaultDurationMinutes: form.defaultDurationMinutes ?? null,
  });
}

function shouldUseCustomShiftCodeTime(src: ShiftCode, shiftCategories: ShiftCategory[]): boolean {
  const category = src.categoryId != null ? shiftCategories.find((c) => c.id === src.categoryId) ?? null : null;
  const timesMatchCategory = category != null
    && normalizeTimeCompare(src.defaultStartTime) === normalizeTimeCompare(category.startTime)
    && normalizeTimeCompare(src.defaultEndTime) === normalizeTimeCompare(category.endTime);

  return !timesMatchCategory && (src.defaultStartTime != null || src.defaultEndTime != null);
}

function buildAbsenceTypeFormState(src: AbsenceType): AbsenceTypeFormState {
  return {
    label: src.label,
    name: src.name,
    color: src.color === "transparent" ? PREDEFINED_COLORS[0].bg : src.color,
    border: src.border === "transparent" ? TRANSPARENT_BORDER : src.border,
    text: src.text === "transparent" ? PREDEFINED_COLORS[0].text : src.text,
  };
}

function serializeAbsenceTypeFormState(form: AbsenceTypeFormState): string {
  return JSON.stringify({
    label: form.label.trim(),
    name: form.name.trim(),
    color: form.color,
    border: form.border,
    text: form.text,
  });
}

// ── Shift Code row ────────────────────────────────────────────────────────────
function ShiftCodeRow({
  st,
  focusAreas,
  shiftCategories,
  orgId,
  certifications,
  certificationLabel,
  focusAreaLabel = "Focus Area",
  hideFocusAreaSelect,
  onSaved,
  onDeleted,
  canManageShiftCodes,
  shiftDisplayMode = "code",
  existingLabels = new Set<string>(),
}: {
  st: ShiftCode & { isNew?: boolean };
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  orgId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel?: string;
  hideFocusAreaSelect?: boolean;
  onSaved: (s: ShiftCode, prevId: number) => void;
  onDeleted: (id: number) => void;
  canManageShiftCodes: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
  existingLabels?: Set<string>;
}) {
  const isNameMode = shiftDisplayMode === "name";
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState<ShiftCodeFormState>(() => buildShiftCodeFormState(st, shiftCategories));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!st.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customizeTime, setCustomizeTime] = useState(() => shouldUseCustomShiftCodeTime(st, shiftCategories));

  // Re-sync form from prop when the parent data changes (e.g. fresh fetch
  // after cert deletion trigger cleans up IDs).
  const certIdsKey = JSON.stringify(st.requiredCertificationIds ?? []);
  const prevStIdRef = useRef(st.id);
  const prevCertIdsKeyRef = useRef(certIdsKey);
  const latestShiftCodeRef = useRef(st);
  const latestShiftCategoriesRef = useRef(shiftCategories);
  latestShiftCodeRef.current = st;
  latestShiftCategoriesRef.current = shiftCategories;
  useEffect(() => {
    if (st.id === prevStIdRef.current && certIdsKey === prevCertIdsKeyRef.current) return;
    prevStIdRef.current = st.id;
    prevCertIdsKeyRef.current = certIdsKey;
    setForm(
      buildShiftCodeFormState(
        latestShiftCodeRef.current,
        latestShiftCategoriesRef.current,
      ),
    );
    setCustomizeTime(
      shouldUseCustomShiftCodeTime(
        latestShiftCodeRef.current,
        latestShiftCategoriesRef.current,
      ),
    );
  }, [certIdsKey, st.id]);

  // Normalize times: if they match the category exactly, treat as null (inherit)
  const effectiveStartTime = (() => {
    if (form.categoryId != null && form.defaultStartTime != null) {
      const cat = shiftCategories.find(c => c.id === form.categoryId);
      if (cat && normalizeTimeCompare(form.defaultStartTime) === normalizeTimeCompare(cat.startTime)
            && normalizeTimeCompare(form.defaultEndTime) === normalizeTimeCompare(cat.endTime)) return null;
    }
    return form.defaultStartTime;
  })();
  const effectiveEndTime = (() => {
    if (form.categoryId != null && form.defaultEndTime != null) {
      const cat = shiftCategories.find(c => c.id === form.categoryId);
      if (cat && normalizeTimeCompare(form.defaultStartTime) === normalizeTimeCompare(cat.startTime)
            && normalizeTimeCompare(form.defaultEndTime) === normalizeTimeCompare(cat.endTime)) return null;
    }
    return form.defaultEndTime;
  })();

  const savedForm = useMemo(
    () => buildShiftCodeFormState(st, shiftCategories),
    [st, shiftCategories],
  );
  const isDirty = st.isNew || serializeShiftCodeFormState({
    ...form,
    defaultStartTime: effectiveStartTime,
    defaultEndTime: effectiveEndTime,
  }, shiftCategories) !== serializeShiftCodeFormState(savedForm, shiftCategories);

  const canSave = isDirty && (isNameMode || !!form.label.trim()) && !!form.name.trim();

  const resetDraft = useCallback(() => {
    setForm(buildShiftCodeFormState(st, shiftCategories));
    setCustomizeTime(shouldUseCustomShiftCodeTime(st, shiftCategories));
    setSaveError(null);
  }, [st, shiftCategories]);

  const discardDraft = useCallback((closeAfter: boolean) => {
    if (st.isNew && closeAfter) {
      onDeleted(st.id);
      return;
    }
    resetDraft();
    if (closeAfter) {
      setExpanded(false);
    }
  }, [onDeleted, resetDraft, st.id, st.isNew]);

  const closeEditor = useCallback(() => {
    if (st.isNew) {
      onDeleted(st.id);
      return;
    }
    setSaveError(null);
    setExpanded(false);
  }, [onDeleted, st.id, st.isNew]);

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: expanded && isDirty,
    onDiscard: () => discardDraft(true),
  });

  const toggleExpanded = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (isDirty) {
      requestClose();
      return;
    }
    closeEditor();
  }, [closeEditor, expanded, isDirty, requestClose]);

  const handleSave = useCallback(async () => {
    if ((!isNameMode && !form.label.trim()) || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      // If custom times match the category's times exactly, save as null (inherit)
      let saveStartTime = form.defaultStartTime;
      let saveEndTime = form.defaultEndTime;
      if (form.categoryId != null) {
        const cat = shiftCategories.find(c => c.id === form.categoryId);
        if (cat && normalizeTimeCompare(saveStartTime) === normalizeTimeCompare(cat.startTime)
              && normalizeTimeCompare(saveEndTime) === normalizeTimeCompare(cat.endTime)) {
          saveStartTime = null;
          saveEndTime = null;
        }
      }
      // In name mode, auto-generate label if not provided
      let labelToSave = form.label.trim();
      if (isNameMode && !labelToSave) {
        const base = form.name.trim().split(/\s+/)[0].toUpperCase().slice(0, 4) || "SHFT";
        labelToSave = base;
        let suffix = 2;
        while (existingLabels.has(labelToSave)) {
          labelToSave = `${base}${suffix}`;
          suffix++;
        }
      }
      const saved = await upsertShiftCode({
        id: st.isNew ? undefined : st.id,
        orgId: orgId,
        label: labelToSave,
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        categoryId: form.categoryId,
        isGeneral: form.focusAreaId == null,
        focusAreaId: form.focusAreaId,
        sortOrder: st.sortOrder,
        requiredCertificationIds: form.requiredCertificationIds,
        defaultStartTime: saveStartTime,
        defaultEndTime: saveEndTime,
        defaultDurationHours: form.defaultDurationHours,
        defaultDurationMinutes: form.defaultDurationMinutes,
      });
      onSaved(saved, st.id);
      setExpanded(false);
      setCustomizeTime(false);
      toast.success("Shift code saved");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? JSON.stringify(err) ?? "Unknown error";
      Sentry.captureException(err);
      setSaveError(msg);
      toast.error("Failed to save shift code");
    } finally {
      setSaving(false);
    }
  }, [form, st, orgId, onSaved, shiftCategories, isNameMode, existingLabels]);

  const [depInfo, setDepInfo] = useState<DependencyInfo | null>(null);

  const handleDeleteClick = useCallback(async () => {
    if (st.isNew) { onDeleted(st.id); return; }
    const deps = await checkShiftCodeDependencies(st.id, orgId);
    setDepInfo(deps);
    setShowDeleteConfirm(true);
  }, [st, orgId, onDeleted]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteShiftCode(st.id, orgId);
      onDeleted(st.id);
      toast.success("Shift code archived");
    } catch (err) {
      toast.error("Failed to delete shift code");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [st, orgId, onDeleted]);

  return (
    <div style={{ borderBottom: expanded ? "none" : "1px solid var(--color-border-light)" }}>
      {/* Collapsed row */}
      <div
        className="dg-hover-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 8px",
          borderRadius: 8,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onClick={toggleExpanded}
      >
        {!isNameMode && (
          <span
            style={{
              display: "inline-block",
              minWidth: 44,
              padding: "3px 8px",
              background: form.color,
              border: `1px solid ${borderColor(form.text)}`,
              color: form.text,
              borderRadius: 8,
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {form.label || "…"}
          </span>
        )}
        {isNameMode && (
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: form.color, border: `1px solid ${borderColor(form.text)}`, flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: "var(--dg-fs-label)",
            color: isNameMode ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            fontWeight: isNameMode ? 700 : 500,
            flex: 1,
          }}
        >
          {form.name || "—"}
        </span>
        {!hideFocusAreaSelect && form.focusAreaId != null && (
          <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
            {focusAreas.find((w) => w.id === form.focusAreaId)?.name}
          </span>
        )}
        {form.categoryId !== null && (
          <span style={{
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 600,
            padding: "2px 6px",
            background: "var(--color-bg-subtle)",
            color: "var(--color-text-secondary)",
            borderRadius: 4,
            border: "1px solid var(--color-border-light)",
          }}>
            {shiftCategories.find(c => c.id === form.categoryId)?.name}
          </span>
        )}
        {(() => {
          const effectiveStart = form.defaultStartTime
            ?? (form.categoryId != null ? shiftCategories.find(c => c.id === form.categoryId)?.startTime : null)
            ?? null;
          const effectiveEnd = form.defaultEndTime
            ?? (form.categoryId != null ? shiftCategories.find(c => c.id === form.categoryId)?.endTime : null)
            ?? null;
          if (!effectiveStart && !effectiveEnd) return null;
          const isCustom = form.defaultStartTime != null || form.defaultEndTime != null;
          return (
            <span style={{
              fontSize: "var(--dg-fs-footnote)",
              color: isCustom ? "var(--color-brand)" : "var(--color-text-muted)",
              fontWeight: isCustom ? 600 : 400,
              whiteSpace: "nowrap",
            }}>
              {fmt12h(effectiveStart)} – {fmt12h(effectiveEnd)}
            </span>
          );
        })()}
        <span
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div
          style={{
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--color-border-light)",
            margin: "0 0 8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNameMode ? "1fr" : (isMobile ? "1fr" : "120px 1fr"),
              gap: 10,
            }}
          >
            {!isNameMode && (
              <div>
                <label style={labelStyle}>CODE / LABEL</label>
                <input
                  value={form.label}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, label: e.target.value }))
                  }
                  placeholder="e.g. D"
                  maxLength={6}
                  className="dg-input"
                  disabled={!canManageShiftCodes}
                />
              </div>
            )}
            <div>
              <label style={labelStyle}>{isNameMode ? "SHIFT NAME" : "FULL NAME"}</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Day Shift"
                maxLength={50}
                className="dg-input"
                disabled={!canManageShiftCodes}
              />
            </div>
          </div>

          {/* Focus area — single select (hidden when section pre-assigns it) */}
          {!hideFocusAreaSelect && (
            <div>
              <label style={labelStyle}>
                {focusAreaLabel.toUpperCase()} (leave blank for global)
              </label>
              <CustomSelect
                value={form.focusAreaId != null ? String(form.focusAreaId) : ""}
                options={[
                  { value: "", label: `— Global (no ${focusAreaLabel.toLowerCase()}) —` },
                  ...focusAreas.map((w) => ({ value: String(w.id), label: w.name })),
                ]}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    focusAreaId: v ? Number(v) : null,
                  }))
                }
                style={{ width: "100%", marginTop: 4 }}
                disabled={!canManageShiftCodes}
              />
            </div>
          )}

          {/* Shift Category */}
          <div>
              <label style={labelStyle}>SHIFT CATEGORY</label>
              <CustomSelect
                value={form.categoryId != null ? String(form.categoryId) : ""}
                options={[
                  { value: "", label: "— Generic (No Category) —" },
                  ...shiftCategories
                    .filter(c => form.focusAreaId == null || c.focusAreaId == null || c.focusAreaId === form.focusAreaId)
                    .map((c) => ({
                      value: String(c.id),
                      label: `${c.name} ${c.focusAreaId ? `(${focusAreas.find(w => w.id === c.focusAreaId)?.name})` : "(Global)"}`
                    })),
                ]}
                onChange={(v) => {
                  const newCatId = v ? Number(v) : null;
                  setForm((p) => ({
                    ...p,
                    categoryId: newCatId,
                    // Clear custom times so the code inherits from the new category
                    defaultStartTime: null,
                    defaultEndTime: null,
                  }));
                }}
                style={{ width: "100%", marginTop: 4 }}
                disabled={!canManageShiftCodes}
              />
            </div>

          {/* Default Times vs Duration — inherit from category, customize on demand */}
          {(() => {
            const hasCustomTimes = effectiveStartTime != null || effectiveEndTime != null || customizeTime;
            const hasDuration = form.defaultDurationHours != null || form.defaultDurationMinutes != null;
            const isGeneral = form.focusAreaId == null;
            const selectedCategory = form.categoryId != null
              ? shiftCategories.find(c => c.id === form.categoryId) ?? null
              : null;
            const categoryStart = selectedCategory?.startTime ?? null;
            const categoryEnd = selectedCategory?.endTime ?? null;
            const hasCategoryTime = categoryStart != null || categoryEnd != null;

            // For general codes using duration mode
            if (isGeneral && hasDuration && !hasCustomTimes) {
              return (
                <div>
                  <label style={labelStyle}>DEFAULT DURATION</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={form.defaultDurationHours ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Math.min(23, Number(e.target.value)));
                        setForm((p) => ({ ...p, defaultDurationHours: v }));
                      }}
                      placeholder="0"
                      style={{ ...inputStyle, width: 64, textAlign: "center" }}
                      disabled={!canManageShiftCodes}
                    />
                    <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={form.defaultDurationMinutes ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, Math.min(59, Number(e.target.value)));
                        setForm((p) => ({ ...p, defaultDurationMinutes: v }));
                      }}
                      placeholder="0"
                      style={{ ...inputStyle, width: 64, textAlign: "center" }}
                      disabled={!canManageShiftCodes}
                    />
                    <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>m</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, defaultDurationHours: null, defaultDurationMinutes: null }))}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                    style={{ marginTop: 6 }}
                    disabled={!canManageShiftCodes}
                  >
                    Set actual times instead
                  </button>
                </div>
              );
            }

            // Custom times are set — show pickers with "Custom Time" label
            if (hasCustomTimes) {
              return (
                <div>
                  <label style={labelStyle}>
                    <span style={{ color: "var(--color-brand)", fontWeight: 700 }}>CUSTOM TIME</span>
                    {hasCategoryTime && (
                      <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: 6 }}>
                        (overrides {selectedCategory?.name}: {fmt12h(categoryStart)} – {fmt12h(categoryEnd)})
                      </span>
                    )}
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <TimeInput12h
                      value={form.defaultStartTime}
                      onChange={(v) => setForm((p) => ({ ...p, defaultStartTime: v }))}
                      disabled={!canManageShiftCodes}
                    />
                    <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>to</span>
                    <TimeInput12h
                      value={form.defaultEndTime}
                      onChange={(v) => setForm((p) => ({ ...p, defaultEndTime: v }))}
                      disabled={!canManageShiftCodes}
                    />
                  </div>
                  {calcTimeDuration(form.defaultStartTime, form.defaultEndTime) && (
                    <div style={{ marginTop: 6, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                      Duration: <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{calcTimeDuration(form.defaultStartTime, form.defaultEndTime)}</span>
                    </div>
                  )}
                  <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>
                    {hasCategoryTime
                      ? `This shift now uses its own saved time instead of the ${selectedCategory?.name} default. Later changes to the category time will not update this shift unless you revert it.`
                      : "This shift now uses its own saved time because there is no category default to inherit."}
                  </p>
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    {hasCategoryTime && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null })); }}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Revert to category default
                      </button>
                    )}
                    {!hasCategoryTime && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null })); }}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Remove custom time
                      </button>
                    )}
                    {isGeneral && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null, defaultDurationHours: 0, defaultDurationMinutes: 0 })); }}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Use duration instead
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // No custom times set — show inherited info + customize button
            return (
              <div>
                <label style={labelStyle}>DEFAULT TIME</label>
                {hasCategoryTime ? (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: "var(--dg-fs-label)",
                        color: "var(--color-text-secondary)",
                        fontWeight: 600,
                        padding: "4px 10px",
                        background: "var(--color-surface)",
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}>
                        {fmt12h(categoryStart)} – {fmt12h(categoryEnd)}
                      </span>
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                        from {selectedCategory?.name}
                      </span>
                      {calcTimeDuration(categoryStart, categoryEnd) && (
                        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                          ({calcTimeDuration(categoryStart, categoryEnd)})
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>
                      Custom times are currently blank, so this shift follows the category default. If the category time changes later, this shift updates automatically.
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: "4px 0 0", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                    {form.categoryId != null ? "Category has no default time set" : "No category selected — no inherited time"}
                  </p>
                )}
                {canManageShiftCodes && (
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomizeTime(true);
                        setForm((p) => ({
                          ...p,
                          defaultStartTime: categoryStart ?? "07:00",
                          defaultEndTime: categoryEnd ?? "15:00",
                        }));
                      }}
                      className="dg-btn dg-btn-secondary dg-btn-sm"
                    >
                      Customize Time
                    </button>
                    {isGeneral && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, defaultDurationHours: 0, defaultDurationMinutes: 0 }))}
                        className="dg-btn dg-btn-secondary dg-btn-sm"
                      >
                        Set duration instead
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Colors */}
          <div>
            <label style={labelStyle}>COLOR PRESET</label>
            <PresetColorPicker
              valueBg={form.color}
              onChange={c => setForm(p => ({ ...p, color: c.bg, text: c.text, border: TRANSPARENT_BORDER }))}
              disabled={!canManageShiftCodes}
            />
          </div>

          {/* Required Certifications — only for recurring shifts */}
          {certifications.length > 0 && (
            <div>
              <label style={labelStyle}>
                REQUIRED {certificationLabel.toUpperCase()}
              </label>
              <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: "0 0 6px", lineHeight: 1.4 }}>
                Leave all unchecked to accept any qualification.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                {certifications.map((desig) => {
                  const checked = form.requiredCertificationIds.includes(desig.id);
                  return (
                    <SelectableTag
                      key={desig.id}
                      selected={checked}
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          requiredCertificationIds: checked
                            ? p.requiredCertificationIds.filter((id) => id !== desig.id)
                            : [...p.requiredCertificationIds, desig.id],
                        }))
                      }
                      disabled={!canManageShiftCodes}
                      padding="4px 10px"
                      fontSize="var(--dg-fs-label)"
                      fontWeight={500}
                      selectedFontWeight={700}
                      unselectedBackground="var(--color-surface)"
                      unselectedBorderColor="var(--color-border)"
                      unselectedTextColor="var(--color-text-secondary)"
                      labelStyle={{ display: "inline-flex", alignItems: "center" }}
                      style={{
                        minHeight: 32,
                      }}
                    >
                      {desig.name !== desig.abbr ? `${desig.abbr} — ${desig.name}` : desig.name}
                    </SelectableTag>
                  );
                })}
              </div>
              {form.requiredCertificationIds.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
                  Only {form.requiredCertificationIds.map(id => certifications.find(s => s.id === id)?.name).filter(Boolean).join(", ")} can be assigned this shift.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {saveError && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 8px" }}>
              <strong>Error:</strong> {saveError}
            </p>
          )}
          <EditorActionRow
            destructiveAction={canManageShiftCodes && !st.isNew ? (
              <button
                onClick={handleDeleteClick}
                disabled={deleting}
                className="dg-btn dg-btn-danger dg-btn-sm"
              >
                {deleting ? "…" : "Delete"}
              </button>
            ) : undefined}
            secondaryAction={(
              <button
                onClick={() => isDirty ? discardDraft(false) : closeEditor()}
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                {getEditorDismissLabel(isDirty)}
              </button>
            )}
            primaryAction={(
              <button
                onClick={handleSave}
                disabled={saving || !canSave || !canManageShiftCodes}
                className="dg-btn dg-btn-primary dg-btn-sm"
              >
                {getEditorSaveLabel(saving)}
              </button>
            )}
          />
        </div>
      )}
      {unsavedChangesDialog}
      {showDeleteConfirm && (
        depInfo?.hasDependencies ? (
          <ConfirmDialog
            title={`Archive "${form.label}"?`}
            message={<>
              <strong>{form.label}</strong> is currently {depInfo.summary.toLowerCase()}.
              <br /><br />
              Archiving will preserve historical records but remove it from dropdowns and new assignments.
            </>}
            confirmLabel="Archive"
            variant="warning"
            isLoading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        ) : (
          <ConfirmDialog
            title={`Delete "${form.label}"?`}
            message={<>This will archive <strong>{form.label}</strong>. Historical records will be preserved.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )
      )}
    </div>
  );
}

// ── Absence Type Row ─────────────────────────────────────────────────────────
function AbsenceTypeRow({
  at,
  orgId,
  onSaved,
  onDeleted,
  canEdit,
  allAbsenceTypes,
  shiftDisplayMode = "code",
}: {
  at: AbsenceType & { isNew?: boolean };
  orgId: string;
  onSaved: (saved: AbsenceType, prevId: number) => void;
  onDeleted: (id: number) => void;
  canEdit: boolean;
  allAbsenceTypes: (AbsenceType & { isNew?: boolean })[];
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const isNameMode = shiftDisplayMode === "name";
  const isMobile = useMediaQuery(MOBILE);
  const resolveForm = useCallback((src: AbsenceType) => buildAbsenceTypeFormState(src), []);
  const [form, setForm] = useState<AbsenceTypeFormState>(() => resolveForm(at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!at.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // M3: Re-sync form when parent prop changes (e.g., concurrent update)
  useEffect(() => {
    if (!at.isNew) setForm(resolveForm(at));
  }, [at, resolveForm]);

  const isDirty = at.isNew || serializeAbsenceTypeFormState(form) !== serializeAbsenceTypeFormState(resolveForm(at));

  // M2: Duplicate label check
  const trimmedLabel = form.label.trim().toUpperCase();
  const isDuplicateLabel = trimmedLabel !== "" && allAbsenceTypes.some(
    (other) => other.id !== at.id && other.label.trim().toUpperCase() === trimmedLabel,
  );

  const canSave = isDirty && (isNameMode || !!form.label.trim()) && !!form.name.trim() && !isDuplicateLabel;

  const resetDraft = useCallback(() => {
    setForm(resolveForm(at));
    setSaveError(null);
  }, [at, resolveForm]);

  const discardDraft = useCallback((closeAfter: boolean) => {
    if (at.isNew && closeAfter) {
      onDeleted(at.id);
      return;
    }
    resetDraft();
    if (closeAfter) {
      setExpanded(false);
    }
  }, [at.id, at.isNew, onDeleted, resetDraft]);

  const closeEditor = useCallback(() => {
    if (at.isNew) {
      onDeleted(at.id);
      return;
    }
    setSaveError(null);
    setExpanded(false);
  }, [at.id, at.isNew, onDeleted]);

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: expanded && isDirty,
    onDiscard: () => discardDraft(true),
  });

  const toggleExpanded = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (isDirty) {
      requestClose();
      return;
    }
    closeEditor();
  }, [closeEditor, expanded, isDirty, requestClose]);

  const handleSave = useCallback(async () => {
    if ((!isNameMode && !form.label.trim()) || !form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      // In name mode, auto-generate label if not provided
      let labelToSave = form.label.trim();
      if (isNameMode && !labelToSave) {
        const base = form.name.trim().split(/\s+/)[0].toUpperCase().slice(0, 4) || "OFF";
        labelToSave = base;
        let suffix = 2;
        while (allAbsenceTypes.some(other => other.id !== at.id && other.label.trim().toUpperCase() === labelToSave)) {
          labelToSave = `${base}${suffix}`;
          suffix++;
        }
      }
      const saved = await upsertAbsenceType({
        id: at.isNew ? undefined : at.id,
        orgId,
        label: labelToSave,
        name: form.name.trim(),
        color: form.color,
        border: form.border,
        text: form.text,
        sortOrder: at.sortOrder,
      });
      onSaved(saved, at.id);
      setExpanded(false);
      toast.success("Off day type saved");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      Sentry.captureException(err);
      setSaveError(msg);
      toast.error("Failed to save off day type");
    } finally {
      setSaving(false);
    }
  }, [form, at, orgId, onSaved, isNameMode, allAbsenceTypes]);

  const [atDepInfo, setAtDepInfo] = useState<DependencyInfo | null>(null);

  const handleDeleteClick = useCallback(async () => {
    if (at.isNew) { onDeleted(at.id); return; }
    const deps = await checkAbsenceTypeDependencies(at.id, orgId);
    setAtDepInfo(deps);
    setShowDeleteConfirm(true);
  }, [at, orgId, onDeleted]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteAbsenceType(at.id, orgId);
      onDeleted(at.id);
      toast.success("Off day type archived");
    } catch (err) {
      toast.error("Failed to delete off day type");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [at, orgId, onDeleted]);

  return (
    <div style={{ borderBottom: expanded ? "none" : "1px solid var(--color-border-light)" }}>
      <div
        className="dg-hover-row"
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: "var(--dg-radius-md)", cursor: "pointer", transition: "background 0.15s" }}
        onClick={toggleExpanded}
      >
        {!isNameMode && (
          <span style={{ display: "inline-block", minWidth: 44, padding: "3px 8px", background: form.color, border: `1px solid ${borderColor(form.text)}`, color: form.text, borderRadius: 8, fontSize: "var(--dg-fs-caption)", fontWeight: 700, textAlign: "center" }}>
            {form.label || "…"}
          </span>
        )}
        {isNameMode && (
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: form.color, border: `1px solid ${borderColor(form.text)}`, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: "var(--dg-fs-label)", color: isNameMode ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: isNameMode ? 700 : 500, flex: 1 }}>
          {form.name || "—"}
        </span>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>▾</span>
      </div>

      {expanded && (
        <div style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--dg-radius-lg)", border: "1px solid var(--color-border-light)", margin: "0 0 8px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: isNameMode ? "1fr" : (isMobile ? "1fr" : "120px 1fr"), gap: 10 }}>
            {!isNameMode && (
              <div>
                <label style={labelStyle}>CODE / LABEL</label>
                <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. X" maxLength={6} className="dg-input" disabled={!canEdit} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{isNameMode ? "OFF DAY NAME" : "FULL NAME"}</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sick Leave" maxLength={50} className="dg-input" disabled={!canEdit} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>COLOR PRESET</label>
            <PresetColorPicker valueBg={form.color} onChange={c => setForm(p => ({ ...p, color: c.bg, text: c.text, border: TRANSPARENT_BORDER }))} disabled={!canEdit} />
          </div>
          {isDuplicateLabel && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 4px" }}>
              A type with label &ldquo;{form.label.trim()}&rdquo; already exists.
            </p>
          )}
          {saveError && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", margin: "0 0 8px" }}>
              <strong>Error:</strong> {saveError}
            </p>
          )}
          <EditorActionRow
            destructiveAction={canEdit && !at.isNew ? (
              <button onClick={handleDeleteClick} disabled={deleting} className="dg-btn dg-btn-danger dg-btn-sm">
                {deleting ? "…" : "Delete"}
              </button>
            ) : undefined}
            secondaryAction={(
              <button onClick={() => isDirty ? discardDraft(false) : closeEditor()} className="dg-btn dg-btn-secondary dg-btn-sm">
                {getEditorDismissLabel(isDirty)}
              </button>
            )}
            primaryAction={(
              <button onClick={handleSave} disabled={saving || !canSave || !canEdit} className="dg-btn dg-btn-primary dg-btn-sm">
                {getEditorSaveLabel(saving)}
              </button>
            )}
          />
        </div>
      )}
      {unsavedChangesDialog}
      {showDeleteConfirm && (
        atDepInfo?.hasDependencies ? (
          <ConfirmDialog
            title={`Archive "${form.label}"?`}
            message={<>
              <strong>{form.label}</strong> is currently {atDepInfo.summary.toLowerCase()}.
              <br /><br />
              Archiving will preserve historical records but remove it from dropdowns and new assignments.
            </>}
            confirmLabel="Archive"
            variant="warning"
            isLoading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        ) : (
          <ConfirmDialog
            title={`Delete "${form.label}"?`}
            message={<>This will archive <strong>{form.label}</strong>. Historical records will be preserved.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )
      )}
    </div>
  );
}

// ── Absence Types Settings ───────────────────────────────────────────────────
function AbsenceTypesSettings({
  absenceTypes,
  orgId,
  onChange,
  canManageShiftCodes,
  shiftDisplayMode = "code",
}: {
  absenceTypes: AbsenceType[];
  orgId: string;
  onChange: (types: AbsenceType[]) => void;
  canManageShiftCodes: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const [local, setLocal] = useState<(AbsenceType & { isNew?: boolean })[]>(absenceTypes);
  const nextTmpId = useRef(-1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal((prev) => {
      const newItems = prev.filter((s) => (s as { isNew?: boolean }).isNew);
      return [...absenceTypes, ...newItems];
    });
  }, [absenceTypes]);

  const handleAdd = () => {
    const tmp: AbsenceType & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId,
      label: "",
      name: "",
      color: "#EEEFEC",
      border: "#9EB4D4",
      text: "#3E433B",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: AbsenceType, prevId: number) => {
    const updated = local.map((s) => (s.id === prevId ? saved : s));
    setLocal(updated);
    onChange(updated.filter(s => !(s as { isNew?: boolean }).isNew));
  };

  const handleDeleted = (id: number) => {
    const updated = local.filter((s) => s.id !== id);
    setLocal(updated);
    onChange(updated.filter(s => !(s as { isNew?: boolean }).isNew));
  };

  return (
    <div style={{ background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
        Off Days
      </div>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0, padding: "8px 16px 4px" }}>
        Off days (scheduled off, sick leave, vacation) do not count toward shift totals.
      </p>
      {local.length > 0 ? (
        <div style={{ padding: "0 16px" }}>
          {local.map((at) => (
            <AbsenceTypeRow key={at.id} at={at} orgId={orgId} onSaved={handleSaved} onDeleted={handleDeleted} canEdit={canManageShiftCodes} allAbsenceTypes={local} shiftDisplayMode={shiftDisplayMode} />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          title="No off day types yet"
          action={canManageShiftCodes ? (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary dg-btn-sm">
              + Add Off Day Type
            </button>
          ) : undefined}
          style={{ margin: "12px 16px" }}
        />
      )}
      {local.length > 0 && canManageShiftCodes && (
        <div style={{ padding: "8px 16px 12px" }}>
          <button onClick={handleAdd} className="dg-btn dg-btn-dashed dg-btn-sm" style={{ width: "100%" }}>
            + Add Off Day Type
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shift Codes Settings ──────────────────────────────────────────────────────
function ShiftCodesSettings({
  shiftCodes,
  focusAreas,
  shiftCategories,
  orgId,
  certifications,
  certificationLabel,
  focusAreaLabel,
  onChange,
  canManageShiftCodes,
  absenceTypes,
  onAbsenceTypesChange,
  shiftDisplayMode = "code",
}: {
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  orgId: string;
  certifications: NamedItem[];
  certificationLabel: string;
  focusAreaLabel: string;
  onChange: (types: ShiftCode[]) => void;
  canManageShiftCodes: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const [local, setLocal] =
    useState<(ShiftCode & { isNew?: boolean })[]>(shiftCodes);
  const nextTmpId = useRef(-1);
  const existingLabels = useMemo(
    () => new Set(local.map(s => s.label.toUpperCase())),
    [local],
  );

  // Sync local state when the parent shiftCodes prop changes (e.g. fresh DB
  // data replacing stale cache data). Only replaces items that haven't been
  // locally added (isNew), so unsaved additions aren't lost.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal((prev) => {
      const newItems = prev.filter((s) => (s as { isNew?: boolean }).isNew);
      return [...shiftCodes, ...newItems];
    });
  }, [shiftCodes]);

  const handleAdd = (focusAreaId: number | null) => {
    const tmp: ShiftCode & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId: orgId,
      label: "",
      name: "",
      color: "#F7F8F5",
      border: "#9EB4D4",
      text:"#3E433B",
      focusAreaId: focusAreaId,
      sortOrder: local.filter((s) => (s.focusAreaId ?? null) === focusAreaId).length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSaved = (saved: ShiftCode, prevId: number) => {
    const updated = local.map((s) => (s.id === prevId ? saved : s));
    setLocal(updated);
    onChange(updated);
  };

  const handleDeleted = (id: number) => {
    const updated = local.filter((s) => s.id !== id);
    setLocal(updated);
    onChange(updated);
  };

  const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

  const renderRows = (codes: (ShiftCode & { isNew?: boolean })[], hideAreaSelect = false) =>
    codes.map((st) => (
      <ShiftCodeRow
        key={st.id}
        st={st}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        orgId={orgId}
        certifications={certifications}
        certificationLabel={certificationLabel}
        focusAreaLabel={focusAreaLabel}
        hideFocusAreaSelect={hideAreaSelect}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        canManageShiftCodes={canManageShiftCodes}
        shiftDisplayMode={shiftDisplayMode}
        existingLabels={existingLabels}
      />
    ));

  const isNameMode = shiftDisplayMode === "name";
  const shiftText = useCallback(
    (shift: ShiftCode | null | undefined, fallbackLabel: string, fallbackName: string) =>
      isNameMode ? (shift?.name || fallbackName) : (shift?.label || fallbackLabel),
    [isNameMode],
  );
  const exampleArea = focusAreas.find((focusArea) => !focusArea.archivedAt) ?? null;
  const exampleCertification = certifications[0]?.name || certificationLabel.replace(/s$/i, "") || "Certification";
  const areaSpecificLabel = shiftText(undefined, "Ds", "Day Supervisor");
  const generalLabel = shiftText(undefined, "Ofc", "Office");
  const distinctShiftLabel = shiftText(undefined, "EDU", "Education");
  const inheritedLabel = shiftText(undefined, "Ds", "Day Supervisor");
  const customTimeLabel = shiftText(undefined, "Ds", "Day Supervisor");
  const singularFocusAreaLabel = focusAreaLabel.replace(/s$/i, "") || focusAreaLabel;
  const exampleAreaName = exampleArea?.name || focusAreaLabel.replace(/s$/i, "") || "Area";
  const exampleCategoryName = "Day Shift";
  const categoryDefaultTime = "7:00 AM - 3:30 PM";
  const inheritedTime = categoryDefaultTime;
  const customTime = "6:15 AM - 3:00 PM";
  const shiftCodePoints = [
    {
      title: "Each shift code is an assignable shift",
      description: `A shift code is the actual worked shift people pick up on the grid. Use one row for each distinct shift, such as ${areaSpecificLabel} or ${distinctShiftLabel}.`,
    },
    {
      title: "Categories group similar shifts",
      description: `${exampleCategoryName} is the category. The shift codes inside it are the assignable options. Categories help you group related shifts and share default timing.`,
    },
    {
      title: "General / Cross-Area codes work across the schedule",
      description: `Area-specific codes belong to one ${singularFocusAreaLabel.toLowerCase()} only. General / Cross-Area codes are available without tying the shift to a single ${singularFocusAreaLabel.toLowerCase()}.`,
    },
    {
      title: "Shift times can inherit or override category defaults",
      description: `Leave custom times blank when a shift should follow the category default. Save custom start and end times only when that shift needs its own schedule, because saved custom times stop following later category time changes until you revert them.`,
    },
    {
      title: `${certificationLabel} affect who can be assigned`,
      description: `When a shift requires ${exampleCertification}, only qualified staff can be assigned to it. Use this for real qualification rules, not for cosmetic tagging.`,
    },
    {
      title: "Absence types are off-days, not worked shifts",
      description: "Use absence types for PTO, calloff, sick, and other non-worked days. They live in the same settings area for convenience, but they are not scheduled shifts.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ExplainerSection
        title="Shift code logic"
        defaultOpen
        storageKey="dg-explainer-shift-codes"
        points={shiftCodePoints}
        preview={(
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <PreviewFrame
              title="Area-specific vs cross-area"
              subtitle="Where the shift can be used"
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {exampleAreaName}
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {areaSpecificLabel}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.45 }}>
                    Shows inside one {singularFocusAreaLabel.toLowerCase()} only.
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-brand-bg)",
                    border: "1px solid var(--color-brand-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-brand)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    General / Cross-Area
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {generalLabel}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                    Available without locking the shift to one {singularFocusAreaLabel.toLowerCase()}.
                  </div>
                </div>
              </div>
            </PreviewFrame>

            <PreviewFrame
              title="Inherited time vs custom time"
              subtitle="How shift timing is resolved"
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {exampleCategoryName} category default
                  </div>
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {categoryDefaultTime}
                  </div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border-light)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Shared default
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {inheritedLabel}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                      Inherits category time
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)" }}>
                    {inheritedTime}
                  </span>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-brand-bg)",
                    border: "1px solid var(--color-brand-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {customTimeLabel}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                      {`Custom override saved on shift ${isNameMode ? "name" : "code"}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-brand)" }}>
                    {customTime}
                  </span>
                </div>
              </div>
            </PreviewFrame>
          </div>
        )}
      />
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Click any row to expand and edit.{shiftDisplayMode !== "name" && " The label (code) is used in the schedule grid."}
      </p>

      {/* Per-focus-area sections */}
      {focusAreas.map((focusArea) => {
        const areaCodes = local.filter(
          (s) => s.focusAreaId === focusArea.id,
        );
        return (
          <div key={focusArea.id} style={{ background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              {focusArea.name}
            </div>
            {areaCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(areaCodes, true)}
              </div>
            ) : (
              <EmptyState
                compact
                title="No shift codes yet"
                action={canManageShiftCodes ? (
                  <button onClick={() => handleAdd(focusArea.id)} className="dg-btn dg-btn-secondary dg-btn-sm">
                    + Add Shift Code
                  </button>
                ) : undefined}
                style={{ margin: "12px 16px" }}
              />
            )}
            {areaCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(focusArea.id)} className={addBtnClass} style={{ width: "100%" }}>
                  + Add Shift Code
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* General / cross-area codes */}
      {(() => {
        const generalCodes = local.filter(
          (s) => s.focusAreaId == null,
        );
        return (
          <div style={{ background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              General / Cross-Area
            </div>
            {generalCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(generalCodes, true)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: "var(--dg-radius-lg)",
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No general codes yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(null)} className="dg-btn dg-btn-secondary dg-btn-sm">
                    + Add General Code
                  </button>
                )}
              </div>
            )}
            {generalCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(null)} className={addBtnClass} style={{ width: "100%" }}>
                  + Add General Code
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Off Days (Absence Types) */}
      <AbsenceTypesSettings
        absenceTypes={absenceTypes}
        orgId={orgId}
        onChange={onAbsenceTypesChange}
        canManageShiftCodes={canManageShiftCodes}
        shiftDisplayMode={shiftDisplayMode}
      />
    </div>
  );
}

export default ShiftCodesSettings;
