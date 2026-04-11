"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { FocusArea } from "@/types";
import { deleteFocusArea, upsertFocusArea, checkFocusAreaDependencies } from "@/lib/db";
import type { DependencyInfo } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { labelStyle } from "./shared";
import { EmptyState } from "@/components/EmptyState";

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
  onFormChange: (id: number, patch: { name: string }) => void;
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
  });
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Propagate form edits to parent for batch save
  useEffect(() => {
    if (isReordering) {
      onFormChange(focusArea.id, form);
    }
  }, [form, isReordering, focusArea.id, onFormChange]);

  const [faDepInfo, setFaDepInfo] = useState<DependencyInfo | null>(null);

  const handleDeleteClick = useCallback(async () => {
    if (focusArea.isNew) { onDeleted(focusArea.id); return; }
    const deps = await checkFocusAreaDependencies(focusArea.id, orgId);
    setFaDepInfo(deps);
    setShowDeleteConfirm(true);
  }, [focusArea, orgId, onDeleted]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteFocusArea(focusArea.id, orgId);
      onDeleted(focusArea.id);
      toast.success("Focus area archived");
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
          {form.name || "Preview"}
        </span>

        <div style={{ flex: 1 }} />

        {/* Delete */}
        {!focusArea.isNew && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
            disabled={deleting}
            className="dg-btn dg-btn-danger dg-btn-sm"
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

      {showDeleteConfirm && (
        faDepInfo?.hasDependencies ? (
          <ConfirmDialog
            title={`Archive "${form.name}"?`}
            message={<>
              <strong>{form.name}</strong> is currently {faDepInfo.summary.toLowerCase()}.
              <br /><br />
              Archiving will preserve historical records but remove it from active use.
            </>}
            confirmLabel="Archive"
            variant="warning"
            isLoading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        ) : (
          <ConfirmDialog
            title={`Delete "${form.name}"?`}
            message={<>This will archive <strong>{form.name || "this area"}</strong>. Historical records will be preserved.</>}
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


// ── Focus Areas Settings ──────────────────────────────────────────────────────
export default function FocusAreas({
  focusAreas,
  orgId,
  label,
  onChange,
  canManageFocusAreas,
  initialEditing,
}: {
  focusAreas: FocusArea[];
  orgId: string;
  label: string;
  onChange: (focusAreas: FocusArea[]) => void;
  canManageFocusAreas: boolean;
  /** Start in edit mode immediately (e.g. during onboarding). */
  initialEditing?: boolean;
}) {
  const [localFocusAreas, setLocalFocusAreas] =
    useState<(FocusArea & { isNew?: boolean })[]>(focusAreas);
  const [isEditing, setIsEditing] = useState(initialEditing ?? false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const nextTmpId = useRef(-1);
  const [saving, setSaving] = useState(false);
  const formEditsRef = useRef<Map<number, { name: string }>>(new Map());
  const [formEditCount, setFormEditCount] = useState(0);

  const isDirty = useMemo(() => {
    if (localFocusAreas.length !== focusAreas.length) return true;
    if (formEditCount > 0) {
      for (const [id, patch] of formEditsRef.current) {
        const orig = focusAreas.find((fa) => fa.id === id);
        if (orig && patch.name !== orig.name) return true;
      }
    }
    return localFocusAreas.some((fa, i) => {
      const orig = focusAreas[i];
      if (!orig) return true;
      return fa.id !== orig.id || fa.name !== orig.name;
    });
  }, [localFocusAreas, focusAreas, formEditCount]);

  const displayList = useMemo((): (FocusArea & { isNew?: boolean })[] => {
    if (!isEditing || draggedIdx === null || dragOverIdx === null) return isEditing ? localFocusAreas : focusAreas;
    const list = [...localFocusAreas];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, localFocusAreas, focusAreas, draggedIdx, dragOverIdx]);

  const handleFormChange = useCallback((id: number, patch: { name: string }) => {
    formEditsRef.current.set(id, patch);
    setFormEditCount((c) => c + 1);
  }, []);

  const handleEnterEdit = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(true);
    formEditsRef.current.clear();
    setFormEditCount(0);
  };

  const handleCancel = () => {
    setLocalFocusAreas([...focusAreas]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
    formEditsRef.current.clear();
    setFormEditCount(0);
  };

  const handleAdd = () => {
    const tmp: FocusArea & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId,
      departmentId: null,
      name: "",
      sortOrder: localFocusAreas.length,
      version: 0,
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
          sortOrder: i,
        };
      });

      const results: FocusArea[] = [];
      for (const item of itemsToSave) {
        if (!item.name.trim()) continue;
        const saved = await upsertFocusArea({
          id: item.isNew ? undefined : item.id,
          orgId,
          departmentId: item.departmentId ?? null,
          name: item.name.trim(),
          sortOrder: item.sortOrder,
          version: 0,
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
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              Edit
            </button>
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-secondary dg-btn-sm"
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
                className="dg-btn dg-btn-primary dg-btn-sm"
              >
                {saving ? "Saving…" : "Save All"}
              </button>
            )}
            <button onClick={handleCancel} className="dg-btn dg-btn-secondary dg-btn-sm">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              + Add
            </button>
          </>
        )}
      </div>

      {/* List */}
      {displayList.length === 0 ? (
        <EmptyState
          compact
          title={`No ${label.toLowerCase()} defined yet`}
          action={canManageFocusAreas ? (
            <button onClick={handleAdd} className="dg-btn dg-btn-secondary dg-btn-sm">
              + Add {label.replace(/s$/, "")}
            </button>
          ) : undefined}
        />
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
