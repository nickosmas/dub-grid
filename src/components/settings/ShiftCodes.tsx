"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ShiftCode, FocusArea, ShiftCategory, NamedItem, AbsenceType, ShiftDisplayMode } from "@/types";
import { upsertShiftCode, deleteShiftCode, upsertAbsenceType, deleteAbsenceType } from "@/lib/db";
import { parseTo12h, to24h, fmt12h, calcTimeDuration } from "@/lib/utils";
import { PREDEFINED_COLORS, getPresetByBg, TRANSPARENT_BORDER, borderColor } from "@/lib/colors";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";
import { PresetColorPicker, TimeInput12h, labelStyle, inputStyle, normalizeTimeCompare } from "./shared";

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
  const [form, setForm] = useState(() => {
    // Normalize: if custom times match the category exactly, clear them to inherit
    const cat = st.categoryId != null ? shiftCategories.find(c => c.id === st.categoryId) : null;
    const timesMatchCategory = cat
      && st.defaultStartTime != null && st.defaultEndTime != null
      && normalizeTimeCompare(st.defaultStartTime) === normalizeTimeCompare(cat.startTime)
      && normalizeTimeCompare(st.defaultEndTime) === normalizeTimeCompare(cat.endTime);
    return {
      label: st.label,
      name: st.name,
      color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
      border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
      text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
      categoryId: st.categoryId ?? null as number | null,
      focusAreaId: st.focusAreaId ?? null as number | null,
      requiredCertificationIds: st.requiredCertificationIds ?? [],
      defaultStartTime: timesMatchCategory ? null : (st.defaultStartTime ?? null as string | null),
      defaultEndTime: timesMatchCategory ? null : (st.defaultEndTime ?? null as string | null),
      defaultDurationHours: st.defaultDurationHours ?? null as number | null,
      defaultDurationMinutes: st.defaultDurationMinutes ?? null as number | null,
    };
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!st.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customizeTime, setCustomizeTime] = useState(() => {
    const cat = st.categoryId != null ? shiftCategories.find(c => c.id === st.categoryId) : null;
    const timesMatchCategory = cat != null
      && normalizeTimeCompare(st.defaultStartTime) === normalizeTimeCompare(cat.startTime)
      && normalizeTimeCompare(st.defaultEndTime) === normalizeTimeCompare(cat.endTime);
    return !timesMatchCategory && (st.defaultStartTime != null || st.defaultEndTime != null);
  });

  // Re-sync form from prop when the parent data changes (e.g. fresh fetch
  // after cert deletion trigger cleans up IDs).
  const certIdsKey = JSON.stringify(st.requiredCertificationIds ?? []);
  const prevStIdRef = useRef(st.id);
  const prevCertIdsKeyRef = useRef(certIdsKey);
  useEffect(() => {
    if (st.id === prevStIdRef.current && certIdsKey === prevCertIdsKeyRef.current) return;
    prevStIdRef.current = st.id;
    prevCertIdsKeyRef.current = certIdsKey;
    // Normalize: if custom times match the category, clear to inherit
    const cat = st.categoryId != null ? shiftCategories.find(c => c.id === st.categoryId) : null;
    const timesMatch = cat
      && st.defaultStartTime != null && st.defaultEndTime != null
      && normalizeTimeCompare(st.defaultStartTime) === normalizeTimeCompare(cat.startTime)
      && normalizeTimeCompare(st.defaultEndTime) === normalizeTimeCompare(cat.endTime);
    setForm({
      label: st.label,
      name: st.name,
      color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
      border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
      text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
      categoryId: st.categoryId ?? null,
      focusAreaId: st.focusAreaId ?? null,
      requiredCertificationIds: st.requiredCertificationIds ?? [],
      defaultStartTime: timesMatch ? null : (st.defaultStartTime ?? null),
      defaultEndTime: timesMatch ? null : (st.defaultEndTime ?? null),
      defaultDurationHours: st.defaultDurationHours ?? null,
      defaultDurationMinutes: st.defaultDurationMinutes ?? null,
    });
    setCustomizeTime(!timesMatch && (st.defaultStartTime != null || st.defaultEndTime != null));
  }, [st.id, st.label, st.name, st.color, st.border, st.text, st.categoryId, st.focusAreaId, st.requiredCertificationIds, certIdsKey, st.defaultStartTime, st.defaultEndTime, st.defaultDurationHours, st.defaultDurationMinutes, shiftCategories]);

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

  const isDirty = st.isNew ||
    form.label !== st.label ||
    form.name !== st.name ||
    form.color !== (st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color) ||
    form.border !== (st.border === "transparent" ? TRANSPARENT_BORDER : st.border) ||
    form.text !== (st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text) ||
    form.categoryId !== (st.categoryId ?? null) ||
    form.focusAreaId !== (st.focusAreaId ?? null) ||
    JSON.stringify(form.requiredCertificationIds) !== JSON.stringify(st.requiredCertificationIds ?? []) ||
    effectiveStartTime !== (st.defaultStartTime ?? null) ||
    effectiveEndTime !== (st.defaultEndTime ?? null) ||
    form.defaultDurationHours !== (st.defaultDurationHours ?? null) ||
    form.defaultDurationMinutes !== (st.defaultDurationMinutes ?? null);

  const canSave = isDirty && (isNameMode || !!form.label.trim()) && !!form.name.trim();

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

  const handleDelete = useCallback(async () => {
    if (st.isNew) {
      onDeleted(st.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteShiftCode(st.id, orgId);
      onDeleted(st.id);
      toast.success("Shift code deleted");
    } catch (err) {
      toast.error("Failed to delete shift code");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [st, orgId, onDeleted]);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 0",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
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
            fontWeight: isNameMode ? 600 : 400,
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
            background: "var(--color-bg)",
            borderTop: "1px solid var(--color-border-light)",
            padding: 16,
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
                    style={{ marginTop: 6, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
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
                  <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                    {hasCategoryTime && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null })); }}
                        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
                      >
                        Revert to category default
                      </button>
                    )}
                    {!hasCategoryTime && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null })); }}
                        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
                      >
                        Remove custom time
                      </button>
                    )}
                    {isGeneral && canManageShiftCodes && (
                      <button
                        type="button"
                        onClick={() => { setCustomizeTime(false); setForm((p) => ({ ...p, defaultStartTime: null, defaultEndTime: null, defaultDurationHours: 0, defaultDurationMinutes: 0 })); }}
                        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
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
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "var(--dg-fs-label)",
                      color: "var(--color-text-secondary)",
                      padding: "4px 10px",
                      background: "var(--color-bg-subtle)",
                      borderRadius: 6,
                      border: "1px solid var(--color-border-light)",
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
                      style={{
                        background: "var(--color-bg-subtle)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 6,
                        color: "var(--color-brand)",
                        padding: "5px 12px",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Customize Time
                    </button>
                    {isGeneral && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, defaultDurationHours: 0, defaultDurationMinutes: 0 }))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-brand)",
                          padding: "5px 0",
                          fontSize: "var(--dg-fs-caption)",
                          cursor: "pointer",
                        }}
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
                REQUIRED {certificationLabel.toUpperCase()} (leave all unchecked = any qualification)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                {certifications.map((desig) => {
                  const checked = form.requiredCertificationIds.includes(desig.id);
                  return (
                    <label
                      key={desig.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "var(--dg-fs-label)",
                        cursor: canManageShiftCodes ? "pointer" : "default",
                        padding: "4px 10px",
                        borderRadius: 20,
                        border: `1.5px solid ${
                          checked ? "var(--color-brand)" : "var(--color-border)"
                        }`,
                        background: checked ? "var(--color-brand-bg)" : "transparent",
                        transition: "border-color 150ms ease, background 150ms ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        style={{ display: "none" }}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            requiredCertificationIds: e.target.checked
                              ? [...p.requiredCertificationIds, desig.id]
                              : p.requiredCertificationIds.filter((d) => d !== desig.id),
                          }))
                        }
                        disabled={!canManageShiftCodes}
                      />
                      <span
                        style={{
                          fontWeight: checked ? 700 : 500,
                          color: checked
                            ? "var(--color-brand)"
                            : "var(--color-text-secondary)",
                        }}
                      >
                        {desig.name !== desig.abbr ? `${desig.abbr} — ${desig.name}` : desig.name}
                      </span>
                    </label>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving || !canSave || !canManageShiftCodes}
              style={{
                background: canSave && canManageShiftCodes ? "var(--color-brand)" : "var(--color-border-light)",
                border: "none",
                color: canSave && canManageShiftCodes ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                cursor: canSave && canManageShiftCodes ? "pointer" : "default",
                opacity: canSave && canManageShiftCodes ? 1 : 0.6,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                if (st.isNew) {
                  onDeleted(st.id);
                } else {
                  const cat = st.categoryId != null ? shiftCategories.find(c => c.id === st.categoryId) : null;
                  const timesMatchCat = cat
                    && st.defaultStartTime != null && st.defaultEndTime != null
                    && normalizeTimeCompare(st.defaultStartTime) === normalizeTimeCompare(cat.startTime)
                    && normalizeTimeCompare(st.defaultEndTime) === normalizeTimeCompare(cat.endTime);
                  setForm({
                    label: st.label,
                    name: st.name,
                    color: st.color === "transparent" ? PREDEFINED_COLORS[0].bg : st.color,
                    border: st.border === "transparent" ? TRANSPARENT_BORDER : st.border,
                    text: st.text === "transparent" ? PREDEFINED_COLORS[0].text : st.text,
                    categoryId: st.categoryId ?? null,
                    focusAreaId: st.focusAreaId ?? null,
                    requiredCertificationIds: st.requiredCertificationIds ?? [],
                    defaultStartTime: timesMatchCat ? null : (st.defaultStartTime ?? null),
                    defaultEndTime: timesMatchCat ? null : (st.defaultEndTime ?? null),
                    defaultDurationHours: st.defaultDurationHours ?? null,
                    defaultDurationMinutes: st.defaultDurationMinutes ?? null,
                  });
                  setCustomizeTime(false);
                  setExpanded(false);
                }
              }}
              style={{
                background: "var(--color-border-light)",
                border: "none",
                borderRadius: 8,
                color: "var(--color-text-muted)",
                padding: "8px 14px",
                fontSize: "var(--dg-fs-label)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            {canManageShiftCodes && !st.isNew && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                style={{
                  background: "none",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: 8,
                  color: "var(--color-danger)",
                  padding: "8px 14px",
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {deleting ? "…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Shift Code?"
          message={<>Delete <strong>{form.label}</strong>? This code will be removed from future schedules.</>}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
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
  const resolveForm = useCallback((src: AbsenceType) => ({
    label: src.label,
    name: src.name,
    color: src.color === "transparent" ? PREDEFINED_COLORS[0].bg : src.color,
    border: src.border === "transparent" ? TRANSPARENT_BORDER : src.border,
    text: src.text === "transparent" ? PREDEFINED_COLORS[0].text : src.text,
  }), []);
  const [form, setForm] = useState(() => resolveForm(at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!!at.isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // M3: Re-sync form when parent prop changes (e.g., concurrent update)
  useEffect(() => {
    if (!at.isNew) setForm(resolveForm(at));
  }, [at, resolveForm]);

  const isDirty = at.isNew ||
    form.label !== at.label ||
    form.name !== at.name ||
    form.color !== (at.color === "transparent" ? PREDEFINED_COLORS[0].bg : at.color) ||
    form.border !== (at.border === "transparent" ? TRANSPARENT_BORDER : at.border) ||
    form.text !== (at.text === "transparent" ? PREDEFINED_COLORS[0].text : at.text);

  // M2: Duplicate label check
  const trimmedLabel = form.label.trim().toUpperCase();
  const isDuplicateLabel = trimmedLabel !== "" && allAbsenceTypes.some(
    (other) => other.id !== at.id && other.label.trim().toUpperCase() === trimmedLabel,
  );

  const canSave = isDirty && (isNameMode || !!form.label.trim()) && !!form.name.trim() && !isDuplicateLabel;

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

  const handleDelete = useCallback(async () => {
    if (at.isNew) { onDeleted(at.id); return; }
    setDeleting(true);
    try {
      await deleteAbsenceType(at.id, orgId);
      onDeleted(at.id);
      toast.success("Off day type deleted");
    } catch (err) {
      toast.error("Failed to delete off day type");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [at, orgId, onDeleted]);

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}
      >
        {!isNameMode && (
          <span style={{ display: "inline-block", minWidth: 44, padding: "3px 8px", background: form.color, border: `1px solid ${borderColor(form.text)}`, color: form.text, borderRadius: 8, fontSize: "var(--dg-fs-caption)", fontWeight: 700, textAlign: "center" }}>
            {form.label || "…"}
          </span>
        )}
        {isNameMode && (
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: form.color, border: `1px solid ${borderColor(form.text)}`, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: "var(--dg-fs-label)", color: isNameMode ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: isNameMode ? 600 : 400, flex: 1 }}>
          {form.name || "—"}
        </span>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>▾</span>
      </div>

      {expanded && (
        <div style={{ background: "var(--color-bg)", borderTop: "1px solid var(--color-border-light)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleSave} disabled={saving || !canSave || !canEdit} style={{ background: canSave && canEdit ? "var(--color-brand)" : "var(--color-border-light)", border: "none", color: canSave && canEdit ? "var(--color-text-inverse)" : "var(--color-text-muted)", borderRadius: 8, padding: "8px 18px", fontSize: "var(--dg-fs-label)", fontWeight: 700, cursor: canSave && canEdit ? "pointer" : "default", opacity: canSave && canEdit ? 1 : 0.6 }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { if (at.isNew) { onDeleted(at.id); } else { setForm(resolveForm(at)); setSaveError(null); setExpanded(false); } }} style={{ background: "var(--color-border-light)", border: "none", borderRadius: 8, color: "var(--color-text-muted)", padding: "8px 14px", fontSize: "var(--dg-fs-label)", cursor: "pointer" }}>
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            {canEdit && !at.isNew && (
              <button onClick={() => setShowDeleteConfirm(true)} disabled={deleting} style={{ background: "none", border: "1px solid var(--color-danger-border)", borderRadius: 8, color: "var(--color-danger)", padding: "8px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 600, cursor: "pointer" }}>
                {deleting ? "…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Off Day Type?"
          message={<>Delete <strong>{form.label}</strong>? This type will be removed from future schedules.</>}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
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
    <div style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
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
        <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, margin: "12px 16px" }}>
          <span>No off day types yet</span>
          {canManageShiftCodes && (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
              + Add Off Day Type
            </button>
          )}
        </div>
      )}
      {local.length > 0 && canManageShiftCodes && (
        <div style={{ padding: "8px 16px 12px" }}>
          <button onClick={handleAdd} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text-muted)", padding: "4px 10px", fontSize: "var(--dg-fs-caption)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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

  const addBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--color-text-muted)",
    padding: "6px 0",
    fontSize: "var(--dg-fs-caption)",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Click any row to expand and edit.{shiftDisplayMode !== "name" && " The label (code) is used in the schedule grid."}
      </p>

      {/* Per-focus-area sections */}
      {focusAreas.map((focusArea) => {
        const areaCodes = local.filter(
          (s) => s.focusAreaId === focusArea.id,
        );
        return (
          <div key={focusArea.id} style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0 }} />
              {focusArea.name}
            </div>
            {areaCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(areaCodes, true)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No shift codes yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(focusArea.id)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add Shift Code
                  </button>
                )}
              </div>
            )}
            {areaCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
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
          <div style={{ background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              General / Cross-Area
            </div>
            {generalCodes.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {renderRows(generalCodes, true)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No general codes yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(null)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add General Code
                  </button>
                )}
              </div>
            )}
            {generalCodes.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(null)} style={addBtnStyle}>
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
