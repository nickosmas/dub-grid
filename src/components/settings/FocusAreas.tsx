"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { FocusArea } from "@/types";
import { deleteFocusArea, upsertFocusArea } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PresetColorPicker, labelStyle } from "./shared";

// ── Focus Area row ────────────────────────────────────────────────────────────
function FocusAreaRow({
  focusArea,
  orgId,
  onDeleted,
  onFormChange,
  isDragging,
  isDropTarget,
  isReordering,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  focusArea: FocusArea & { isNew?: boolean };
  orgId: string;
  onDeleted: (id: number) => void;
  onFormChange: (id: number, patch: { name: string; colorBg: string; colorText: string }) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  isReordering: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [form, setForm] = useState({
    name: focusArea.name,
    colorBg: focusArea.colorBg,
    colorText: focusArea.colorText,
  });
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Propagate form edits to parent for batch save
  useEffect(() => {
    if (isReordering) {
      onFormChange(focusArea.id, form);
    }
  }, [form, isReordering, focusArea.id, onFormChange]);

  const handleDelete = useCallback(async () => {
    if (focusArea.isNew) {
      onDeleted(focusArea.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteFocusArea(focusArea.id, orgId);
      onDeleted(focusArea.id);
      toast.success("Focus area deleted");
    } catch (err) {
      toast.error("Failed to delete focus area");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [focusArea, orgId, onDeleted]);

  // Read-only display mode
  if (!isReordering) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 12px",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            borderRadius: 20,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0 }} />
          {focusArea.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
        </span>
      </div>
    );
  }

  // Edit / reorder mode — drag handle + inline editing
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={isReordering ? onDragOver : undefined}
      onDrop={isReordering ? onDrop : undefined}
      onDragEnd={isReordering ? onDragEnd : undefined}
      style={{
        padding: "12px 12px",
        borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
        borderBottom: "1px solid var(--color-border-light)",
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        userSelect: isReordering ? "none" : undefined,
        transition: "opacity 150ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {/* Drag handle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="3" y="2" width="2" height="2" rx="1"/>
            <rect x="9" y="2" width="2" height="2" rx="1"/>
            <rect x="3" y="6" width="2" height="2" rx="1"/>
            <rect x="9" y="6" width="2" height="2" rx="1"/>
            <rect x="3" y="10" width="2" height="2" rx="1"/>
            <rect x="9" y="10" width="2" height="2" rx="1"/>
          </svg>
        </div>

        {/* Live preview badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 12px",
            borderRadius: 20,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: form.colorBg, flexShrink: 0 }} />
          {form.name || "Preview"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Delete */}
        {!focusArea.isNew && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            disabled={deleting}
            style={{
              background: "none",
              border: "1px solid var(--color-danger-border)",
              borderRadius: 8,
              color: "var(--color-danger)",
              padding: "5px 10px",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {deleting ? "…" : "Delete"}
          </button>
        )}
      </div>

      {/* Name */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, paddingLeft: 24 }}>
        <label style={{ ...labelStyle, marginBottom: 0, minWidth: 48 }}>NAME</label>
        <input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
          placeholder="Area name"
          maxLength={50}
          className="dg-input"
          style={{ flex: 1 }}
        />
      </div>

      {/* Color */}
      <div style={{ paddingLeft: 24 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <label style={labelStyle}>COLOR</label>
        <PresetColorPicker
          valueBg={form.colorBg}
          onChange={(c) => setForm((p) => ({ ...p, colorBg: c.bg, colorText: c.text }))}
        />
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Focus Area?"
          message={<>Delete <strong>{form.name || "this area"}</strong>? Employees assigned to this area will need to be reassigned.</>}
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


// ── Focus Areas Settings ──────────────────────────────────────────────────────
export default function FocusAreas({
  focusAreas,
  orgId,
  label,
  onChange,
  canManageFocusAreas,
}: {
  focusAreas: FocusArea[];
  orgId: string;
  label: string;
  onChange: (focusAreas: FocusArea[]) => void;
  canManageFocusAreas: boolean;
}) {
  const [localFocusAreas, setLocalFocusAreas] =
    useState<(FocusArea & { isNew?: boolean })[]>(focusAreas);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const nextTmpId = useRef(-1);
  const [saving, setSaving] = useState(false);
  const formEditsRef = useRef<Map<number, { name: string; colorBg: string; colorText: string }>>(new Map());

  const isDirty = useMemo(() => {
    if (localFocusAreas.length !== focusAreas.length) return true;
    return localFocusAreas.some((fa, i) => {
      const orig = focusAreas[i];
      if (!orig) return true;
      return fa.id !== orig.id || fa.name !== orig.name || fa.colorBg !== orig.colorBg;
    });
  }, [localFocusAreas, focusAreas]);

  const displayList = useMemo((): (FocusArea & { isNew?: boolean })[] => {
    if (!isEditing || draggedIdx === null || dragOverIdx === null) return isEditing ? localFocusAreas : focusAreas;
    const list = [...localFocusAreas];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, localFocusAreas, focusAreas, draggedIdx, dragOverIdx]);

  const handleFormChange = useCallback((id: number, patch: { name: string; colorBg: string; colorText: string }) => {
    formEditsRef.current.set(id, patch);
  }, []);

  const handleEnterEdit = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(true);
    formEditsRef.current.clear();
  };

  const handleCancel = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
    formEditsRef.current.clear();
  };

  const handleAdd = () => {
    const tmp: FocusArea & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId,
      name: "",
      colorBg: "#E0E7FF",
      colorText: "#3730A3",
      sortOrder: localFocusAreas.length,
      isNew: true,
    };
    setLocalFocusAreas((prev) => [...prev, tmp]);
    if (!isEditing) {
      setIsEditing(true);
      formEditsRef.current.clear();
    }
  };

  const handleDeleted = (id: number) => {
    setLocalFocusAreas((prev) => prev.filter((fa) => fa.id !== id));
    formEditsRef.current.delete(id);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const itemsToSave = localFocusAreas.map((fa, i) => {
        const edits = formEditsRef.current.get(fa.id);
        return {
          ...fa,
          name: edits?.name ?? fa.name,
          colorBg: edits?.colorBg ?? fa.colorBg,
          colorText: edits?.colorText ?? fa.colorText,
          sortOrder: i,
        };
      });

      const results: FocusArea[] = [];
      for (const item of itemsToSave) {
        if (!item.name.trim()) continue;
        const saved = await upsertFocusArea({
          id: item.isNew ? undefined : item.id,
          orgId,
          name: item.name.trim(),
          colorBg: item.colorBg,
          colorText: item.colorText,
          sortOrder: item.sortOrder,
        });
        results.push(saved);
      }

      onChange(results);
      setLocalFocusAreas(results);
      setIsEditing(false);
      formEditsRef.current.clear();
      toast.success("Focus areas saved");
    } catch (err) {
      toast.error("Failed to save focus areas");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(targetIdx);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      const list = [...localFocusAreas];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocalFocusAreas(list);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 16px" }}>
        {!isEditing && canManageFocusAreas && (
          <>
            <button
              onClick={handleEnterEdit}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)", display: "flex", alignItems: "center", gap: 5 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add
            </button>
          </>
        )}
        {isEditing && (
          <>
            {isDirty && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="dg-btn dg-btn-primary"
                style={{ padding: "7px 14px" }}
              >
                {saving ? "Saving…" : "Save All"}
              </button>
            )}
            <button onClick={handleCancel} className="dg-btn dg-btn-secondary" style={{ padding: "7px 14px" }}>
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add
            </button>
          </>
        )}
      </div>

      {/* List */}
      {displayList.length === 0 ? (
        <div style={{
          border: "1px dashed var(--color-border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          margin: "0 16px 16px",
        }}>
          <span>No {label.toLowerCase()} defined yet</span>
          {canManageFocusAreas && (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary" style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}>
              + Add {label.replace(/s$/, "")}
            </button>
          )}
        </div>
      ) : (
        displayList.map((fa, i) => (
          <FocusAreaRow
            key={fa.id}
            focusArea={fa}
            orgId={orgId}
            onDeleted={handleDeleted}
            onFormChange={handleFormChange}
            isDragging={draggedIdx !== null && localFocusAreas[draggedIdx]?.id === fa.id}
            isDropTarget={isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i}
            isReordering={isEditing}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))
      )}
    </div>
  );
}
