"use client";

import React, { useState, useRef, useEffect } from "react";
import { ShiftCategory, FocusArea, ShiftCode } from "@/types";
import { upsertShiftCategory, deleteShiftCategory, upsertShiftCode } from "@/lib/db";
import { fmt12h, calcTimeDuration, calcNetDuration, resolveEffectiveBreak } from "@/lib/utils";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { labelStyle, inputStyle, normalizeTimeCompare, TimeInput12h } from "./shared";

// ── Shift Categories Settings ──────────────────────────────────────────────────
function ShiftCategoriesSettings({
  shiftCategories,
  focusAreas,
  orgId,
  onChange,
  canManageShiftCodes,
  shiftCodes,
  onShiftCodesChange,
}: {
  shiftCategories: ShiftCategory[];
  focusAreas: FocusArea[];
  orgId: string;
  onChange: (categories: ShiftCategory[]) => void;
  canManageShiftCodes: boolean;
  shiftCodes: ShiftCode[];
  onShiftCodesChange: (codes: ShiftCode[]) => void;
}) {
  const [local, setLocal] = useState<(ShiftCategory & { isNew?: boolean })[]>(shiftCategories);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const originalRef = useRef<Map<number, ShiftCategory>>(
    new Map(shiftCategories.map((c) => [c.id, c]))
  );
  // Keep originalRef in sync when props update (e.g. concurrent edits)
  useEffect(() => {
    originalRef.current = new Map(shiftCategories.map((c) => [c.id, c]));
  }, [shiftCategories]);
  const nextTmpId = useRef(-1);

  const handleAdd = (focusAreaId: number | null) => {
    const tmpId = nextTmpId.current--;
    const tmp: ShiftCategory & { isNew: boolean } = {
      id: tmpId,
      orgId: orgId,
      name: "",
      color: "var(--color-bg-secondary)",
      startTime: null,
      endTime: null,
      sortOrder: local.filter((c) => c.focusAreaId === focusAreaId).length,
      focusAreaId,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
    setEditingId(tmpId);
  };

  const handleChange = (id: number, field: keyof ShiftCategory, value: string | number | null) => {
    setLocal((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleCancel = (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      setLocal((prev) => prev.filter((c) => c.id !== cat.id));
      onChange(local.filter((c) => c.id !== cat.id));
    } else {
      const orig = originalRef.current.get(cat.id);
      if (orig) setLocal((prev) => prev.map((c) => (c.id === cat.id ? orig : c)));
    }
    setEditingId(null);
  };

  const handleSave = async (cat: ShiftCategory & { isNew?: boolean }) => {
    if (!cat.name.trim()) return;
    setSaving(cat.id);
    try {
      // Capture old category times before saving, to cascade-clear child shift codes
      const oldCat = originalRef.current.get(cat.id);

      const saved = await upsertShiftCategory({
        id: cat.isNew ? undefined : cat.id,
        orgId: orgId,
        name: cat.name.trim(),
        color: cat.color,
        startTime: cat.startTime || null,
        endTime: cat.endTime || null,
        sortOrder: cat.sortOrder,
        focusAreaId: cat.focusAreaId ?? null,
        breakMinutes: cat.breakMinutes ?? null,
      });
      originalRef.current.set(saved.id, saved);
      const updated = local.map((c) => (c.id === cat.id ? saved : c));
      setLocal(updated);
      onChange(updated);

      // If category times changed, cascade-clear child shift codes that were
      // inheriting (had times matching the old category values)
      if (oldCat && (
        normalizeTimeCompare(oldCat.startTime) !== normalizeTimeCompare(saved.startTime) ||
        normalizeTimeCompare(oldCat.endTime) !== normalizeTimeCompare(saved.endTime)
      )) {
        const childCodes = shiftCodes.filter(sc =>
          sc.categoryId === saved.id
          && sc.defaultStartTime != null
          && sc.defaultEndTime != null
          && normalizeTimeCompare(sc.defaultStartTime) === normalizeTimeCompare(oldCat.startTime)
          && normalizeTimeCompare(sc.defaultEndTime) === normalizeTimeCompare(oldCat.endTime)
        );
        if (childCodes.length > 0) {
          const updatedCodes = [...shiftCodes];
          for (const sc of childCodes) {
            // Clear DB times to null (inherit from new category)
            await upsertShiftCode({ ...sc, defaultStartTime: null, defaultEndTime: null });
            const idx = updatedCodes.findIndex(c => c.id === sc.id);
            if (idx >= 0) updatedCodes[idx] = { ...updatedCodes[idx], defaultStartTime: null, defaultEndTime: null };
          }
          onShiftCodesChange(updatedCodes);
        }
      }

      setEditingId(null);
      toast.success("Category saved");
    } catch (err) {
      toast.error("Failed to save category");
      Sentry.captureException(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (cat: ShiftCategory & { isNew?: boolean }) => {
    if (cat.isNew) {
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      return;
    }
    setDeleting(cat.id);
    try {
      await deleteShiftCategory(cat.id, orgId);
      const updated = local.filter((c) => c.id !== cat.id);
      setLocal(updated);
      onChange(updated);
      setEditingId(null);
      toast.success("Category deleted");
    } catch (err) {
      toast.error("Failed to delete category");
      Sentry.captureException(err);
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
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

  const renderCategoryRow = (cat: ShiftCategory & { isNew?: boolean }) => {
    const isEditing = editingId === cat.id;
    const isSavingThis = saving === cat.id;
    const isDeletingThis = deleting === cat.id;
    const orig = originalRef.current.get(cat.id);
    const isDirty = cat.isNew || !orig ||
      cat.name !== orig.name ||
      (cat.startTime ?? null) !== (orig.startTime ?? null) ||
      (cat.endTime ?? null) !== (orig.endTime ?? null) ||
      (cat.breakMinutes ?? null) !== (orig.breakMinutes ?? null);

    if (!isEditing) {
      return (
        <div
          key={cat.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 0",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {cat.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Untitled</span>}
            </span>
            {(cat.startTime || cat.endTime) && (
              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                {fmt12h(cat.startTime)} – {fmt12h(cat.endTime)}
                {calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas) && (
                  <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                    ({calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas)})
                  </span>
                )}
                {resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas) > 0 && (
                  <span style={{ marginLeft: 6, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                    incl. {resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas)}m break
                  </span>
                )}
              </span>
            )}
          </div>
          {canManageShiftCodes && (
            <button
              onClick={() => setEditingId(cat.id)}
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                color: "var(--color-text-primary)",
                padding: "6px 12px",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
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
          padding: "12px 0",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 10,
            alignItems: "end",
            marginBottom: 10,
          }}
        >
          <div>
            <label style={labelStyle}>NAME</label>
            <input
              value={cat.name}
              onChange={(e) => handleChange(cat.id, "name", e.target.value)}
              placeholder="e.g. Day Shift"
              maxLength={50}
              style={{ ...inputStyle }}
              autoFocus
              disabled={!canManageShiftCodes}
            />
          </div>
          <div>
            <label style={labelStyle}>START</label>
            <TimeInput12h
              value={cat.startTime}
              onChange={(v) => handleChange(cat.id, "startTime", v)}
              disabled={!canManageShiftCodes}
            />
          </div>
          <div>
            <label style={labelStyle}>END</label>
            <TimeInput12h
              value={cat.endTime}
              onChange={(v) => handleChange(cat.id, "endTime", v)}
              disabled={!canManageShiftCodes}
            />
          </div>
        </div>
        {/* Break Duration */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>BREAK (MIN)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={480}
              value={cat.breakMinutes ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
                handleChange(cat.id, "breakMinutes", val);
              }}
              placeholder={(() => {
                if (!cat.focusAreaId) return "No break";
                const fa = focusAreas.find((f) => f.id === cat.focusAreaId);
                return fa?.breakMinutes ? `Inherits ${fa.breakMinutes}m` : "No break";
              })()}
              style={{ ...inputStyle, width: 140 }}
              disabled={!canManageShiftCodes}
            />
            {cat.breakMinutes == null && cat.focusAreaId != null && (() => {
              const fa = focusAreas.find((f) => f.id === cat.focusAreaId);
              return fa?.breakMinutes ? (
                <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                  Inherits {fa.breakMinutes}m from {fa.name}
                </span>
              ) : null;
            })()}
          </div>
        </div>
        {calcTimeDuration(cat.startTime, cat.endTime) && (
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginBottom: 10 }}>
            {(() => {
              const effectiveBreak = resolveEffectiveBreak(cat.breakMinutes, cat.focusAreaId, focusAreas);
              const gross = calcTimeDuration(cat.startTime, cat.endTime);
              const net = calcNetDuration(cat.startTime, cat.endTime, cat.breakMinutes, cat.focusAreaId, focusAreas);
              if (effectiveBreak > 0) {
                return <>Gross: {gross} · Break: {effectiveBreak}m · Net: <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{net}</span></>;
              }
              return <>Duration: <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{gross}</span></>;
            })()}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => handleSave(cat)}
            disabled={isSavingThis || !cat.name.trim() || !isDirty || !canManageShiftCodes}
            style={{
              background: cat.name.trim() && isDirty && canManageShiftCodes ? "var(--color-brand)" : "var(--color-border)",
              border: "none",
              color: "var(--color-text-inverse)",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: cat.name.trim() && isDirty && canManageShiftCodes ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            {isSavingThis ? "…" : "Save"}
          </button>
          <button
            onClick={() => handleCancel(cat)}
            disabled={isSavingThis}
            style={{
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-text-primary)",
              padding: "7px 12px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Cancel
          </button>
          {canManageShiftCodes && (
            <button
              onClick={() => cat.isNew ? handleDelete(cat) : setConfirmDeleteId(cat.id)}
              disabled={isDeletingThis}
              style={{
                background: "none",
                border: "1px solid var(--color-danger-border)",
                borderRadius: 8,
                color: "var(--color-danger)",
                padding: "7px 12px",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              {isDeletingThis ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Define the tally categories for each focus area (e.g. Day, Evening, Night).
      </p>

      {focusAreas.map((focusArea) => {
        const areaCats = local.filter((c) => c.focusAreaId === focusArea.id);
        return (
          <div
            key={focusArea.id}
            style={{
              background: "var(--color-surface)",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--color-border-light)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-secondary)",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: focusArea.colorBg || "var(--color-border)", flexShrink: 0 }} />
              {focusArea.name}
            </div>
            {areaCats.length > 0 ? (
              <div style={{ padding: "0 16px" }}>
                {areaCats.map(renderCategoryRow)}
              </div>
            ) : (
              <div style={{
                border: "1px dashed var(--color-border)", borderRadius: 10,
                padding: "28px 16px", textAlign: "center", color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                margin: "12px 16px",
              }}>
                <span>No categories yet</span>
                {canManageShiftCodes && (
                  <button onClick={() => handleAdd(focusArea.id)} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}>
                    + Add Category
                  </button>
                )}
              </div>
            )}
            {areaCats.length > 0 && canManageShiftCodes && (
              <div style={{ padding: "8px 16px 12px" }}>
                <button onClick={() => handleAdd(focusArea.id)} style={addBtnStyle}>
                  + Add Category
                </button>
              </div>
            )}
          </div>
        );
      })}


      {confirmDeleteId !== null && (() => {
        const cat = local.find(c => c.id === confirmDeleteId);
        if (!cat) return null;
        return (
          <ConfirmDialog
            title="Delete Category?"
            message={<>Delete <strong>{cat.name || "this category"}</strong>? Shift codes in this category will become uncategorized.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting === confirmDeleteId}
            onConfirm={() => handleDelete(cat)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        );
      })()}
    </div>
  );
}

export default ShiftCategoriesSettings;
