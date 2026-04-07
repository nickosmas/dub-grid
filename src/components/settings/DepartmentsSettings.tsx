"use client";

import React, { useState, useCallback, useRef } from "react";
import { Department, FocusArea } from "@/types";
import { saveDepartments, upsertFocusArea, deleteFocusArea } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PresetColorPicker, labelStyle } from "./shared";
import DepartmentPermissionsEditor, { countEnabledPermissions } from "./DepartmentPermissionsEditor";
import DepartmentRoster from "./DepartmentRoster";
import { EmptyState } from "@/components/EmptyState";

// ── Types ────────────────────────────────────────────────────────────────────

interface DepartmentsSettingsProps {
  departments: Department[];
  focusAreas: FocusArea[];
  orgId: string;
  focusAreaLabel: string;
  departmentLabel: string;
  canManageFocusAreas: boolean;
  canManageOrgLabels: boolean;
  onDepartmentsChange: (departments: Department[]) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_COLOR_BG = "#E0E7FF";
const DEFAULT_COLOR_TEXT = "#3730A3";

const DragHandle = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)", flexShrink: 0, cursor: "grab" }}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="3" y="2" width="2" height="2" rx="1" />
      <rect x="9" y="2" width="2" height="2" rx="1" />
      <rect x="3" y="6" width="2" height="2" rx="1" />
      <rect x="9" y="6" width="2" height="2" rx="1" />
      <rect x="3" y="10" width="2" height="2" rx="1" />
      <rect x="9" y="10" width="2" height="2" rx="1" />
    </svg>
  </div>
);

const ColorBadge = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
);

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-body-sm)",
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  padding: "14px 16px 10px",
  margin: 0,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "var(--color-border)",
  margin: "8px 0",
};

// ── Focus Area Row (within a scheduled department) ──────────────────────────

function FocusAreaRow({
  fa,
  orgId,
  isEditing,
  onUpdate,
  onDelete,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  fa: FocusArea;
  orgId: string;
  isEditing: boolean;
  onUpdate: (updated: FocusArea) => void;
  onDelete: (id: number) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [editName, setEditName] = useState(fa.name);
  const [editColorBg, setEditColorBg] = useState(fa.colorBg);
  const [editColorText, setEditColorText] = useState(fa.colorText);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isInlineEdit, setIsInlineEdit] = useState(!fa.name);
  const isNew = !fa.name && fa.id < 0;
  const isModified = isNew || editName.trim() !== fa.name || editColorBg !== fa.colorBg || editColorText !== fa.colorText;

  const handleSave = useCallback(async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const saved = await upsertFocusArea({
        id: fa.id > 0 ? fa.id : undefined,
        orgId,
        departmentId: fa.departmentId,
        name: editName.trim(),
        colorBg: editColorBg,
        colorText: editColorText,
        sortOrder: fa.sortOrder,
      });
      onUpdate(saved);
      setIsInlineEdit(false);
      toast.success("Focus area saved");
    } catch (err) {
      toast.error("Failed to save focus area");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [fa, orgId, editName, editColorBg, editColorText, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (fa.id < 0) {
      onDelete(fa.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteFocusArea(fa.id, orgId);
      onDelete(fa.id);
      toast.success("Focus area deleted");
    } catch (err) {
      toast.error("Failed to delete focus area");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [fa, orgId, onDelete]);

  const cancelEdit = () => {
    // If this was a newly added FA that was never saved, remove it entirely
    if (!fa.name && fa.id < 0) {
      onDelete(fa.id);
      return;
    }
    setEditName(fa.name);
    setEditColorBg(fa.colorBg);
    setEditColorText(fa.colorText);
    setIsInlineEdit(false);
  };

  // Read-only row
  if (!isEditing && !isInlineEdit) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px 8px 40px",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <span style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)", marginRight: 2 }}>
          &#x251C;&#x2500;
        </span>
        <ColorBadge color={fa.colorBg} />
        <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-secondary)", flex: 1 }}>
          {fa.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
        </span>
        <button
          onClick={() => setIsInlineEdit(true)}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}
        >
          Edit
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            background: "none",
            border: "1px solid var(--color-danger-border)",
            borderRadius: 8,
            color: "var(--color-danger)",
            padding: "4px 10px",
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
        {showDeleteConfirm && (
          <ConfirmDialog
            title="Delete Focus Area?"
            message={<>Delete <strong>{fa.name || "this area"}</strong>? Employees assigned to it will need reassignment.</>}
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

  // Edit/drag mode
  return (
    <div
      draggable={isEditing}
      onDragStart={isEditing ? onDragStart : undefined}
      onDragOver={isEditing ? onDragOver : undefined}
      onDrop={isEditing ? onDrop : undefined}
      onDragEnd={isEditing ? onDragEnd : undefined}
      style={{
        padding: "10px 12px 10px 28px",
        borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
        borderBottom: "1px solid var(--color-border-light)",
        opacity: isDragging ? 0.5 : 1,
        userSelect: isEditing ? "none" : undefined,
        transition: "opacity 150ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {isEditing && <DragHandle />}
        <ColorBadge color={editColorBg} size={10} />
        <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-secondary)", flex: 1 }}>
          {editName || "New Focus Area"}
        </span>
        {!isEditing && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleSave} disabled={saving || !editName.trim() || !isModified} className="dg-btn dg-btn-primary" style={{ padding: "4px 12px", fontSize: "var(--dg-fs-caption)" }}>
              {saving ? "Saving\u2026" : "Save"}
            </button>
            <button onClick={cancelEdit} className="dg-btn dg-btn-secondary" style={{ padding: "4px 12px", fontSize: "var(--dg-fs-caption)" }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Name */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, paddingLeft: isEditing ? 24 : 0 }}>
        <label style={{ ...labelStyle, marginBottom: 0, minWidth: 48 }}>NAME</label>
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
          placeholder="Focus area name"
          maxLength={50}
          className="dg-input"
          style={{ flex: 1 }}
        />
      </div>

      {/* Color */}
      <div style={{ paddingLeft: isEditing ? 24 : 0 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <label style={labelStyle}>COLOR</label>
        <PresetColorPicker
          valueBg={editColorBg}
          onChange={(c) => { setEditColorBg(c.bg); setEditColorText(c.text); }}
        />
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Focus Area?"
          message={<>Delete <strong>{editName || "this area"}</strong>? Employees assigned to it will need reassignment.</>}
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


// ── Scheduled Department Row ─────────────────────────────────────────────────

function ScheduledDepartmentRow({
  dept,
  childFocusAreas,
  orgId,
  canEdit,
  focusAreaLabel,
  onDeptUpdate,
  onDeptDelete,
  onFocusAreasChange,
  isDragging,
  isDropTarget,
  isEditing,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  dept: Department;
  childFocusAreas: FocusArea[];
  orgId: string;
  canEdit: boolean;
  focusAreaLabel: string;
  onDeptUpdate: (updated: Department) => void;
  onDeptDelete: (id: number) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  isEditing: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(childFocusAreas.length > 1);
  const [editingName, setEditingName] = useState(!dept.name);
  const [nameValue, setNameValue] = useState(dept.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nextTmpFaId = useRef(-1000 - dept.id * 100);

  const isSingleFA = childFocusAreas.length === 1;
  const firstFA = childFocusAreas[0] ?? null;
  const isNameModified = nameValue.trim() !== dept.name;

  // FA drag state
  const [faDragIdx, setFaDragIdx] = useState<number | null>(null);
  const [faDragOverIdx, setFaDragOverIdx] = useState<number | null>(null);

  const handleSaveName = useCallback(async () => {
    if (!nameValue.trim()) return;
    const updated = { ...dept, name: nameValue.trim() };
    onDeptUpdate(updated);
    // Single-FA departments: sync the FA name to match the dept name
    if (isSingleFA && firstFA) {
      onFocusAreasChange(childFocusAreas.map(fa =>
        fa.id === firstFA.id ? { ...fa, name: nameValue.trim() } : fa
      ));
    }
    setEditingName(false);
  }, [dept, nameValue, onDeptUpdate, isSingleFA, firstFA, childFocusAreas, onFocusAreasChange]);

  const handleDeleteDept = useCallback(async () => {
    setDeleting(true);
    try {
      // Delete all child focus areas first
      for (const fa of childFocusAreas) {
        if (fa.id > 0) {
          await deleteFocusArea(fa.id, orgId);
        }
      }
      onDeptDelete(dept.id);
      toast.success("Department deleted");
    } catch (err) {
      toast.error("Failed to delete department");
      Sentry.captureException(err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [dept, childFocusAreas, orgId, onDeptDelete]);

  const handleAddFocusArea = useCallback(async () => {
    const tmpId = nextTmpFaId.current--;
    // First FA defaults to the department name; subsequent FAs start blank
    const defaultName = childFocusAreas.length === 0 ? dept.name : "";
    const newFA: FocusArea = {
      id: tmpId,
      orgId,
      departmentId: dept.id,
      name: defaultName,
      colorBg: DEFAULT_COLOR_BG,
      colorText: DEFAULT_COLOR_TEXT,
      sortOrder: childFocusAreas.length,
    };
    onFocusAreasChange([...childFocusAreas, newFA]);
    setExpanded(true);
  }, [dept.id, dept.name, orgId, childFocusAreas, onFocusAreasChange]);

  const handleFAUpdate = useCallback((updated: FocusArea) => {
    onFocusAreasChange(childFocusAreas.map(fa => fa.id === updated.id ? updated : fa));
  }, [childFocusAreas, onFocusAreasChange]);

  const handleFADelete = useCallback((id: number) => {
    onFocusAreasChange(childFocusAreas.filter(fa => fa.id !== id));
  }, [childFocusAreas, onFocusAreasChange]);

  // FA drag handlers
  const handleFADragStart = (idx: number) => { setFaDragIdx(idx); setFaDragOverIdx(idx); };
  const handleFADragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setFaDragOverIdx(idx); };
  const handleFADrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (faDragIdx !== null && faDragOverIdx !== null && faDragIdx !== faDragOverIdx) {
      const list = [...childFocusAreas];
      const [item] = list.splice(faDragIdx, 1);
      list.splice(faDragOverIdx, 0, item);
      onFocusAreasChange(list.map((fa, i) => ({ ...fa, sortOrder: i })));
    }
    setFaDragIdx(null);
    setFaDragOverIdx(null);
  };
  const handleFADragEnd = () => { setFaDragIdx(null); setFaDragOverIdx(null); };

  // Build display list with drag preview
  const faDisplayList = (() => {
    if (faDragIdx === null || faDragOverIdx === null) return childFocusAreas;
    const list = [...childFocusAreas];
    const [item] = list.splice(faDragIdx, 1);
    list.splice(faDragOverIdx, 0, item);
    return list;
  })();

  return (
    <div
      draggable={isEditing}
      onDragStart={isEditing ? (e) => { e.stopPropagation(); onDragStart(); } : undefined}
      onDragOver={isEditing ? onDragOver : undefined}
      onDrop={isEditing ? onDrop : undefined}
      onDragEnd={isEditing ? onDragEnd : undefined}
      style={{
        borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
        borderBottom: "1px solid var(--color-border-light)",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      {/* Department header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 12px",
          cursor: isSingleFA ? "default" : "pointer",
        }}
        onClick={() => { if (!isSingleFA) setExpanded(p => !p); }}
      >
        {isEditing && <DragHandle />}

        {/* Expand/collapse chevron */}
        {!isSingleFA && (
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease", flexShrink: 0, color: "var(--color-text-muted)" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
        {isSingleFA && <span style={{ width: 12 }} />}

        {/* Dept name (inline edit or display) */}
        {editingName ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={(e) => e.stopPropagation()}>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") { if (!dept.name) onDeptDelete(dept.id); else { setNameValue(dept.name); setEditingName(false); } }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
              autoFocus
              maxLength={80}
              className="dg-input"
              style={{ flex: 1, maxWidth: 300 }}
            />
            <button onClick={handleSaveName} disabled={!nameValue.trim() || !isNameModified} className="dg-btn dg-btn-primary" style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}>
              Save
            </button>
            <button onClick={() => { if (!dept.name) onDeptDelete(dept.id); else { setNameValue(dept.name); setEditingName(false); } }} className="dg-btn dg-btn-secondary" style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)", flex: 1 }}>
            {dept.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
          </span>
        )}

        {/* Single-FA inline preview: color badge + break */}
        {isSingleFA && firstFA && !editingName && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px",
              borderRadius: 20, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-light)",
              fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-secondary)",
            }}>
              <ColorBadge color={firstFA.colorBg} />
              {firstFA.name}
            </span>
          </div>
        )}

        {/* Multi-FA collapsed summary */}
        {!isSingleFA && !expanded && !editingName && (
          <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
            {childFocusAreas.length} focus area{childFocusAreas.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Actions */}
        {canEdit && !editingName && (
          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setEditingName(true)}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}
            >
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: "none", border: "1px solid var(--color-danger-border)", borderRadius: 8,
                color: "var(--color-danger)", padding: "4px 10px", fontSize: "var(--dg-fs-caption)", fontWeight: 600, cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Single focus area — name synced from department, show split option */}
      {isSingleFA && firstFA && (
        <div style={{ padding: "4px 16px 12px 40px" }}>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginBottom: 6 }}>
            Appears as &ldquo;{firstFA.name}&rdquo; on the schedule. Renaming the department updates this automatically. Only split if staff work in distinct sections.
          </div>
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFocusArea();
                }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "none", border: "1px solid var(--color-border)", borderRadius: 6,
                  cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--dg-fs-caption)", fontWeight: 600,
                  padding: "4px 10px", transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Split into Focus Areas
              </button>
            )}
        </div>
      )}

      {/* Multiple focus areas — full expandable list */}
      {childFocusAreas.length > 1 && expanded && (
        <div>
          {faDisplayList.map((fa, i) => (
            <FocusAreaRow
              key={fa.id}
              fa={fa}
              orgId={orgId}
              isEditing={isEditing}
              onUpdate={handleFAUpdate}
              onDelete={handleFADelete}
              isDragging={faDragIdx !== null && childFocusAreas[faDragIdx]?.id === fa.id}
              isDropTarget={faDragOverIdx === i && faDragIdx !== null && faDragIdx !== i}
              onDragStart={() => handleFADragStart(i)}
              onDragOver={(e) => handleFADragOver(e, i)}
              onDrop={handleFADrop}
              onDragEnd={handleFADragEnd}
            />
          ))}

          {/* Add focus area button */}
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAddFocusArea(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 12px 8px 40px",
                background: "none", border: "none", borderBottom: "1px solid var(--color-border-light)",
                cursor: "pointer", color: "var(--color-brand)", fontSize: "var(--dg-fs-caption)", fontWeight: 600,
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-brand-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add {focusAreaLabel.replace(/s$/i, "")}
            </button>
          )}
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Department?"
          message={<>Delete <strong>{dept.name || "this department"}</strong> and its {childFocusAreas.length} focus area{childFocusAreas.length !== 1 ? "s" : ""}? This cannot be undone.</>}
          confirmLabel="Delete"
          variant="danger"
          isLoading={deleting}
          onConfirm={handleDeleteDept}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}


// ── Management Department Row ────────────────────────────────────────────────

function ManagementDepartmentRow({
  dept,
  orgId,
  canEdit,
  onUpdate,
  onDelete,
  isDragging,
  isDropTarget,
  isEditing,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  dept: Department;
  orgId: string;
  canEdit: boolean;
  onUpdate: (updated: Department) => void;
  onDelete: (id: number) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  isEditing: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [editingName, setEditingName] = useState(!dept.name);
  const [nameValue, setNameValue] = useState(dept.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showPermsEditor, setShowPermsEditor] = useState(false);
  const isNameModified = nameValue.trim() !== dept.name;

  const { enabled: permCount, total: permTotal } = countEnabledPermissions(dept.permissions);

  const handleSave = () => {
    if (!nameValue.trim()) return;
    onUpdate({ ...dept, name: nameValue.trim() });
    setEditingName(false);
  };

  const handleDelete = () => {
    setDeleting(true);
    onDelete(dept.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  return (
    <div
      draggable={isEditing}
      onDragStart={isEditing ? onDragStart : undefined}
      onDragOver={isEditing ? onDragOver : undefined}
      onDrop={isEditing ? onDrop : undefined}
      onDragEnd={isEditing ? onDragEnd : undefined}
      style={{
        borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
        borderBottom: "1px solid var(--color-border-light)",
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      {/* ── Header row ────────────────────────────────────────────── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: dept.name ? "pointer" : undefined }}
        onClick={() => { if (dept.name && !editingName) setExpanded(!expanded); }}
      >
        {isEditing && <DragHandle />}

        {dept.name && (
          <span style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)", transition: "transform 150ms", transform: expanded ? "rotate(90deg)" : "none" }}>
            &#x25B6;
          </span>
        )}
        {!dept.name && (
          <span style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>
            &#x251C;&#x2500;
          </span>
        )}

        {editingName ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={(e) => e.stopPropagation()}>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { if (!dept.name) onDelete(dept.id); else { setNameValue(dept.name); setEditingName(false); } }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
              autoFocus
              maxLength={80}
              className="dg-input"
              style={{ flex: 1, maxWidth: 300 }}
            />
            <button onClick={handleSave} disabled={!nameValue.trim() || !isNameModified} className="dg-btn dg-btn-primary" style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}>
              Save
            </button>
            <button onClick={() => { if (!dept.name) onDelete(dept.id); else { setNameValue(dept.name); setEditingName(false); } }} className="dg-btn dg-btn-secondary" style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-secondary)", flex: 1 }}>
            {dept.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
            {dept.name && (
              <span style={{ marginLeft: 8, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                {permCount}/{permTotal} permissions
              </span>
            )}
          </span>
        )}

        {canEdit && !editingName && (
          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setEditingName(true)}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "4px 10px", fontSize: "var(--dg-fs-caption)" }}
            >
              Rename
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: "none", border: "1px solid var(--color-danger-border)", borderRadius: 8,
                color: "var(--color-danger)", padding: "4px 10px", fontSize: "var(--dg-fs-caption)", fontWeight: 600, cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* ── Expanded body: Permissions + Roster ────────────────── */}
      {expanded && dept.name && (
        <div style={{ padding: "0 12px 12px 36px" }}>
          {/* Permissions summary + edit button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Permissions
            </span>
            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
              {permCount} of {permTotal} enabled
            </span>
            {canEdit && (
              <button
                className="dg-btn dg-btn-ghost"
                onClick={() => setShowPermsEditor(true)}
                style={{ fontSize: "var(--dg-fs-caption)", padding: "2px 8px", marginLeft: "auto" }}
              >
                Configure
              </button>
            )}
          </div>

          {/* Roster */}
          <DepartmentRoster department={dept} orgId={orgId} canEdit={canEdit} />
        </div>
      )}

      {showPermsEditor && (
        <DepartmentPermissionsEditor
          department={dept}
          orgId={orgId}
          onClose={() => setShowPermsEditor(false)}
          onSaved={(perms) => onUpdate({ ...dept, permissions: perms })}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Department?"
          message={<>Delete <strong>{dept.name || "this department"}</strong>? Employees assigned to it will need reassignment.</>}
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


// ── Main Component ───────────────────────────────────────────────────────────

export default function DepartmentsSettings({
  departments,
  focusAreas,
  orgId,
  focusAreaLabel,
  departmentLabel,
  canManageFocusAreas,
  canManageOrgLabels,
  onDepartmentsChange,
  onFocusAreasChange,
}: DepartmentsSettingsProps) {
  const canEdit = canManageFocusAreas || canManageOrgLabels;
  const [saving, setSaving] = useState(false);

  // Separate departments by type
  const scheduledDepts = departments
    .filter(d => d.type === "scheduled" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const managementDepts = departments
    .filter(d => d.type === "management" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Group focus areas by department
  const faByDept = (deptId: number) =>
    focusAreas
      .filter(fa => fa.departmentId === deptId && !fa.archivedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  // Drag state for scheduled departments
  const [schedDragIdx, setSchedDragIdx] = useState<number | null>(null);
  const [schedDragOverIdx, setSchedDragOverIdx] = useState<number | null>(null);
  const [schedEditing, setSchedEditing] = useState(false);

  // Drag state for management departments
  const [mgmtDragIdx, setMgmtDragIdx] = useState<number | null>(null);
  const [mgmtDragOverIdx, setMgmtDragOverIdx] = useState<number | null>(null);
  const [mgmtEditing, setMgmtEditing] = useState(false);

  const nextTmpDeptId = useRef(-1);

  // ── Scheduled dept helpers ──────────────────────────────────────────────────

  const saveDepartmentsBatch = useCallback(async (updated: Department[]) => {
    setSaving(true);
    try {
      const result = await saveDepartments(orgId, updated, departments);
      onDepartmentsChange(result);
      toast.success("Departments saved");
    } catch (err) {
      toast.error("Failed to save departments");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [orgId, departments, onDepartmentsChange]);

  const handleAddScheduledDept = useCallback(async () => {
    const tmpId = nextTmpDeptId.current--;
    const newDept: Department = {
      id: tmpId,
      orgId,
      name: "",
      abbr: "",
      type: "scheduled",
      sortOrder: scheduledDepts.length + managementDepts.length,
    };

    setSaving(true);
    try {
      const allDepts = [...departments, newDept];
      const savedDepts = await saveDepartments(orgId, allDepts, departments);
      onDepartmentsChange(savedDepts);

      // Auto-create one FA with the dept name (single-FA depts inherit dept name)
      const createdDept = savedDepts
        .filter(d => d.type === "scheduled")
        .sort((a, b) => b.sortOrder - a.sortOrder)[0];
      if (createdDept) {
        const newFA = await upsertFocusArea({
          orgId,
          departmentId: createdDept.id,
          name: createdDept.name || "New Area",
          colorBg: DEFAULT_COLOR_BG,
          colorText: DEFAULT_COLOR_TEXT,
          sortOrder: 0,
        });
        onFocusAreasChange([...focusAreas, newFA]);
      }

      toast.success("Department added");
    } catch (err) {
      toast.error("Failed to add department");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [orgId, departments, scheduledDepts, managementDepts, focusAreas, onDepartmentsChange, onFocusAreasChange]);

  const handleAddManagementDept = useCallback(async () => {
    const tmpId = nextTmpDeptId.current--;
    const newDept: Department = {
      id: tmpId,
      orgId,
      name: "",
      abbr: "",
      type: "management",
      sortOrder: scheduledDepts.length + managementDepts.length,
    };

    setSaving(true);
    try {
      const allDepts = [...departments, newDept];
      const savedDepts = await saveDepartments(orgId, allDepts, departments);
      onDepartmentsChange(savedDepts);
      toast.success("Department added");
    } catch (err) {
      toast.error("Failed to add department");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [orgId, departments, scheduledDepts, managementDepts, onDepartmentsChange]);

  const handleScheduledDeptUpdate = useCallback(async (updated: Department) => {
    const allDepts = departments.map(d => d.id === updated.id ? updated : d);
    await saveDepartmentsBatch(allDepts);
  }, [departments, saveDepartmentsBatch]);

  const handleScheduledDeptDelete = useCallback(async (id: number) => {
    const allDepts = departments.filter(d => d.id !== id);
    // Also remove focus areas for this dept from state
    const remainingFAs = focusAreas.filter(fa => fa.departmentId !== id);
    onFocusAreasChange(remainingFAs);
    await saveDepartmentsBatch(allDepts);
  }, [departments, focusAreas, onFocusAreasChange, saveDepartmentsBatch]);

  const handleManagementDeptUpdate = useCallback(async (updated: Department) => {
    const allDepts = departments.map(d => d.id === updated.id ? updated : d);
    await saveDepartmentsBatch(allDepts);
  }, [departments, saveDepartmentsBatch]);

  const handleManagementDeptDelete = useCallback(async (id: number) => {
    const allDepts = departments.filter(d => d.id !== id);
    await saveDepartmentsBatch(allDepts);
  }, [departments, saveDepartmentsBatch]);

  const handleFocusAreasChangeForDept = useCallback((deptId: number, updatedChildFAs: FocusArea[]) => {
    const otherFAs = focusAreas.filter(fa => fa.departmentId !== deptId);
    onFocusAreasChange([...otherFAs, ...updatedChildFAs]);
  }, [focusAreas, onFocusAreasChange]);

  // ── Scheduled drag ─────────────────────────────────────────────────────────

  const schedDisplayList = (() => {
    if (schedDragIdx === null || schedDragOverIdx === null) return scheduledDepts;
    const list = [...scheduledDepts];
    const [item] = list.splice(schedDragIdx, 1);
    list.splice(schedDragOverIdx, 0, item);
    return list;
  })();

  const handleSchedDragStart = (idx: number) => { setSchedDragIdx(idx); setSchedDragOverIdx(idx); };
  const handleSchedDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setSchedDragOverIdx(idx); };
  const handleSchedDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (schedDragIdx !== null && schedDragOverIdx !== null && schedDragIdx !== schedDragOverIdx) {
      const list = [...scheduledDepts];
      const [item] = list.splice(schedDragIdx, 1);
      list.splice(schedDragOverIdx, 0, item);
      const reordered = list.map((d, i) => ({ ...d, sortOrder: i }));
      const otherDepts = departments.filter(d => d.type !== "scheduled" || !!d.archivedAt);
      await saveDepartmentsBatch([...reordered, ...otherDepts]);
    }
    setSchedDragIdx(null);
    setSchedDragOverIdx(null);
  };
  const handleSchedDragEnd = () => { setSchedDragIdx(null); setSchedDragOverIdx(null); };

  // ── Management drag ────────────────────────────────────────────────────────

  const mgmtDisplayList = (() => {
    if (mgmtDragIdx === null || mgmtDragOverIdx === null) return managementDepts;
    const list = [...managementDepts];
    const [item] = list.splice(mgmtDragIdx, 1);
    list.splice(mgmtDragOverIdx, 0, item);
    return list;
  })();

  const handleMgmtDragStart = (idx: number) => { setMgmtDragIdx(idx); setMgmtDragOverIdx(idx); };
  const handleMgmtDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setMgmtDragOverIdx(idx); };
  const handleMgmtDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (mgmtDragIdx !== null && mgmtDragOverIdx !== null && mgmtDragIdx !== mgmtDragOverIdx) {
      const list = [...managementDepts];
      const [item] = list.splice(mgmtDragIdx, 1);
      list.splice(mgmtDragOverIdx, 0, item);
      const reordered = list.map((d, i) => ({ ...d, sortOrder: scheduledDepts.length + i }));
      const otherDepts = departments.filter(d => d.type !== "management" || !!d.archivedAt);
      await saveDepartmentsBatch([...otherDepts, ...reordered]);
    }
    setMgmtDragIdx(null);
    setMgmtDragOverIdx(null);
  };
  const handleMgmtDragEnd = () => { setMgmtDragIdx(null); setMgmtDragOverIdx(null); };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Section 1: Scheduled Departments ──────────────────────────────── */}
      <h3 style={sectionTitleStyle}>Scheduled {departmentLabel}</h3>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", padding: "0 16px 8px", margin: 0 }}>
        Scheduled departments appear on the grid. Each department has one or more focus areas that define how staff are grouped on the schedule.
      </p>

      {canEdit && schedDisplayList.length >= 2 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 16px 10px" }}>
          <button
            onClick={() => setSchedEditing(p => !p)}
            className="dg-btn dg-btn-secondary"
            style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)", display: "flex", alignItems: "center", gap: 5 }}
          >
            {schedEditing ? (
              "Done Reordering"
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Reorder
              </>
            )}
          </button>
        </div>
      )}

      {schedDisplayList.length === 0 ? (
        <EmptyState
          compact
          title={`No scheduled ${departmentLabel.toLowerCase()} defined yet`}
          action={canEdit ? (
            <button
              onClick={handleAddScheduledDept}
              disabled={saving}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add Scheduled {departmentLabel.replace(/s$/i, "")}
            </button>
          ) : undefined}
        />
      ) : (
        <>
          {schedDisplayList.map((dept, i) => (
            <ScheduledDepartmentRow
              key={dept.id}
              dept={dept}
              childFocusAreas={faByDept(dept.id)}
              orgId={orgId}
              canEdit={canEdit}
              focusAreaLabel={focusAreaLabel}
              onDeptUpdate={handleScheduledDeptUpdate}
              onDeptDelete={handleScheduledDeptDelete}
              onFocusAreasChange={(fas) => handleFocusAreasChangeForDept(dept.id, fas)}
              isDragging={schedDragIdx !== null && scheduledDepts[schedDragIdx]?.id === dept.id}
              isDropTarget={schedEditing && schedDragOverIdx === i && schedDragIdx !== null && schedDragIdx !== i}
              isEditing={schedEditing}
              onDragStart={() => handleSchedDragStart(i)}
              onDragOver={(e) => handleSchedDragOver(e, i)}
              onDrop={handleSchedDrop}
              onDragEnd={handleSchedDragEnd}
            />
          ))}

          {/* Add scheduled dept button */}
          {canEdit && (
            <button
              onClick={handleAddScheduledDept}
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "10px 16px",
                background: "none", border: "none", borderBottom: "1px solid var(--color-border-light)",
                cursor: saving ? "wait" : "pointer", color: "var(--color-brand)", fontSize: "var(--dg-fs-label)", fontWeight: 600,
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-brand-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {saving ? "Adding\u2026" : `Add Scheduled ${departmentLabel.replace(/s$/i, "")}`}
            </button>
          )}
        </>
      )}

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div style={dividerStyle} />

      {/* ── Section 2: Management Departments ─────────────────────────────── */}
      <h3 style={sectionTitleStyle}>Management {departmentLabel}</h3>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", padding: "0 16px 8px", margin: 0 }}>
        For people who use the app but don&rsquo;t appear on the schedule (e.g. HR, Reception, Finance).
      </p>

      {canEdit && mgmtDisplayList.length >= 2 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 16px 10px" }}>
          <button
            onClick={() => setMgmtEditing(p => !p)}
            className="dg-btn dg-btn-secondary"
            style={{ padding: "7px 12px", fontSize: "var(--dg-fs-caption)", display: "flex", alignItems: "center", gap: 5 }}
          >
            {mgmtEditing ? (
              "Done Reordering"
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Reorder
              </>
            )}
          </button>
        </div>
      )}

      {mgmtDisplayList.length === 0 ? (
        <EmptyState
          compact
          title={`No management ${departmentLabel.toLowerCase()} defined yet`}
          action={canEdit ? (
            <button
              onClick={handleAddManagementDept}
              disabled={saving}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add Management {departmentLabel.replace(/s$/i, "")}
            </button>
          ) : undefined}
        />
      ) : (
        <>
          {mgmtDisplayList.map((dept, i) => (
            <ManagementDepartmentRow
              key={dept.id}
              dept={dept}
              orgId={orgId}
              canEdit={canEdit}
              onUpdate={handleManagementDeptUpdate}
              onDelete={handleManagementDeptDelete}
              isDragging={mgmtDragIdx !== null && managementDepts[mgmtDragIdx]?.id === dept.id}
              isDropTarget={mgmtEditing && mgmtDragOverIdx === i && mgmtDragIdx !== null && mgmtDragIdx !== i}
              isEditing={mgmtEditing}
              onDragStart={() => handleMgmtDragStart(i)}
              onDragOver={(e) => handleMgmtDragOver(e, i)}
              onDrop={handleMgmtDrop}
              onDragEnd={handleMgmtDragEnd}
            />
          ))}

          {/* Add management dept button */}
          {canEdit && (
            <button
              onClick={handleAddManagementDept}
              disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "10px 16px",
                background: "none", border: "none", borderBottom: "1px solid var(--color-border-light)",
                cursor: saving ? "wait" : "pointer", color: "var(--color-brand)", fontSize: "var(--dg-fs-label)", fontWeight: 600,
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-brand-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {saving ? "Adding\u2026" : `Add Management ${departmentLabel.replace(/s$/i, "")}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
