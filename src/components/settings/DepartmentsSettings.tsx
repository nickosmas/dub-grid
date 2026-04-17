"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { Department, FocusArea } from "@/types";
import { saveDepartments, upsertFocusArea, deleteFocusArea, checkDepartmentDependencies } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { ExplainerSection, PreviewFrame, WorkflowStrip } from "@/components/ui/explainer-section";
import { SectionCard } from "./shared";
import { EmptyState } from "@/components/EmptyState";
import type { DependencyInfo } from "@/lib/db";

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

// ── Shared styles (matching StringListSettings) ─────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 500,
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  outline: "none",
  transition: "border-color 150ms ease, box-shadow 150ms ease",
};

const DragHandle = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)" }}>
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

const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

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
  // ── Edit lifecycle state ────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [localDepts, setLocalDepts] = useState<Department[]>([]);
  const [localFAs, setLocalFAs] = useState<FocusArea[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ idx: number; dept: Department; deps: DependencyInfo | null } | null>(null);
  const [faDeleteConfirm, setFaDeleteConfirm] = useState<{ faId: number; fa: FocusArea } | null>(null);

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ── FA drag state (per department) ──────────────────────────────────────────
  const [faDragDeptId, setFaDragDeptId] = useState<number | null>(null);
  const [faDragIdx, setFaDragIdx] = useState<number | null>(null);
  const [faDragOverIdx, setFaDragOverIdx] = useState<number | null>(null);

  // ── Expand/collapse for focus areas (scheduled) or roster (management) ─────
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const nextTmpId = useRef(-1);
  const nextTmpFaId = useRef(-1000);
  const nameRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // ── Focus area helpers ────────────────────────────────────────────────────
  const faByDept = useCallback(
    (deptId: number, source: FocusArea[]) =>
      source.filter(fa => fa.departmentId === deptId && !fa.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [],
  );

  const propFAs = useMemo(
    () => allFocusAreas.filter(fa => depts.some(d => d.id === fa.departmentId)),
    [allFocusAreas, depts],
  );

  // ── Dirty check ─────────────────────────────────────────────────────────────
  const nonEmpty = useCallback(
    (list: Department[]) => list.filter(d => d.name.trim()),
    [],
  );

  const isDirty = useMemo(() => {
    const deptsDirty = JSON.stringify(nonEmpty(localDepts)) !== JSON.stringify(depts);
    if (type === "management") return deptsDirty;
    const faDirty = JSON.stringify(localFAs.filter(fa => fa.name.trim())) !== JSON.stringify(propFAs);
    return deptsDirty || faDirty;
  }, [localDepts, depts, localFAs, propFAs, nonEmpty, type]);

  // ── Display list with drag preview ──────────────────────────────────────────
  const displayList = useMemo(() => {
    if (!isEditing) return depts;
    if (draggedIdx === null || dragOverIdx === null) return localDepts;
    const list = [...localDepts];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, localDepts, depts, draggedIdx, dragOverIdx]);

  // ── FA display list with drag preview ───────────────────────────────────────
  const faDisplayList = useCallback(
    (deptId: number) => {
      const source = isEditing ? localFAs : propFAs;
      const fas = faByDept(deptId, source);
      if (!isEditing || faDragDeptId !== deptId || faDragIdx === null || faDragOverIdx === null) return fas;
      const list = [...fas];
      const [item] = list.splice(faDragIdx, 1);
      list.splice(faDragOverIdx, 0, item);
      return list;
    },
    [isEditing, localFAs, propFAs, faByDept, faDragDeptId, faDragIdx, faDragOverIdx],
  );

  // ── Enter / Cancel / Save ───────────────────────────────────────────────────
  const syncDraftFromProps = useCallback(() => {
    setLocalDepts([...depts]);
    setLocalFAs([...propFAs]);
    if (type === "scheduled") {
      const toExpand = new Set<number>();
      for (const d of depts) {
        const fas = faByDept(d.id, propFAs);
        if (fas.length > 1) toExpand.add(d.id);
      }
      setExpandedIds(toExpand);
    } else {
      setExpandedIds(new Set());
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
    setFaDragDeptId(null);
    setFaDragIdx(null);
    setFaDragOverIdx(null);
    setError(null);
    setDeleteConfirm(null);
    setFaDeleteConfirm(null);
  }, [depts, faByDept, propFAs, type]);

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

  const handleSave = async () => {
    const cleaned = nonEmpty(localDepts).map((d, i) => ({
      ...d,
      name: d.name.trim(),
      abbr: d.abbr.trim() || d.name.trim(),
      sortOrder: i,
    }));

    // Duplicate check
    const names = cleaned.map(d => d.name.toLowerCase());
    const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setError(`Duplicate name: "${dupes[0]}"`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Phase 1: Save departments
      const otherDepts = allDepartments.filter(d => d.type !== type || !!d.archivedAt);
      const savedDepts = await saveDepartments(orgId, [...otherDepts, ...cleaned], allDepartments);

      // Phase 2: Save focus areas (scheduled only)
      if (type === "scheduled") {
        // Build temp→real ID map for new departments
        const tempToReal = new Map<number, number>();
        for (const c of cleaned) {
          if (c.id < 0) {
            const real = savedDepts.find(
              sd => sd.type === "scheduled" && sd.name === c.name && !otherDepts.some(od => od.id === sd.id),
            );
            if (real) tempToReal.set(c.id, real.id);
          }
        }

        // Determine deleted FAs
        const localFaIds = new Set(localFAs.filter(fa => fa.id > 0).map(fa => fa.id));
        const deletedFAs = propFAs.filter(fa => fa.id > 0 && !localFaIds.has(fa.id));
        for (const fa of deletedFAs) {
          await deleteFocusArea(fa.id, orgId);
        }

        // Upsert new and modified FAs
        const savedFAsList: FocusArea[] = [];
        const cleanedFAs = localFAs.filter(fa => fa.name.trim());
        for (let i = 0; i < cleanedFAs.length; i++) {
          const fa = cleanedFAs[i];
          const realDeptId = fa.departmentId && fa.departmentId < 0
            ? tempToReal.get(fa.departmentId) ?? fa.departmentId
            : fa.departmentId;
          const isNew = fa.id < 0;
          const orig = propFAs.find(p => p.id === fa.id);
          const isModified = !isNew && orig && (
            orig.name !== fa.name.trim() || orig.sortOrder !== i || orig.departmentId !== realDeptId
          );
          if (isNew || isModified) {
            const saved = await upsertFocusArea({
              ...(isNew ? {} : { id: fa.id }),
              orgId,
              departmentId: realDeptId,
              name: fa.name.trim(),
              sortOrder: i,
            });
            savedFAsList.push(saved);
          } else {
            savedFAsList.push({ ...fa, departmentId: realDeptId });
          }
        }

        // Merge saved FAs with unchanged FAs from other departments
        const otherFAs = allFocusAreas.filter(fa => !depts.some(d => d.id === fa.departmentId) && !tempToReal.has(fa.departmentId ?? -999));
        onFocusAreasChange([...otherFAs, ...savedFAsList]);
      }

      onDepartmentsChange(savedDepts);
      setIsEditing(false);
      setLocalDepts([]);
      setLocalFAs([]);
      toast.success(`${title} saved`);
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : JSON.stringify(err);
      setError(msg || "Unknown error");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  };

  // ── Row handlers ──────────────────────────────────────────────────────────
  const handleItemChange = (i: number, value: string) => {
    setLocalDepts(prev => {
      const updated = prev.map((d, idx) => (idx === i ? { ...d, name: value, abbr: value } : d));
      // Single-FA departments: sync FA name to dept name
      if (type === "scheduled") {
        const dept = updated[i];
        const fas = faByDept(dept.id, localFAs);
        if (fas.length === 1) {
          setLocalFAs(prevFAs => prevFAs.map(fa =>
            fa.id === fas[0].id ? { ...fa, name: value } : fa,
          ));
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
    setLocalDepts(prev => [...prev, newDept]);

    // Auto-create a default focus area for new scheduled departments
    if (type === "scheduled") {
      const faId = nextTmpFaId.current--;
      setLocalFAs(prev => [...prev, {
        id: faId,
        orgId,
        departmentId: id,
        name: "",
        sortOrder: 0,
      }]);
    }

    requestAnimationFrame(() => {
      nameRefs.current.get(id)?.focus();
    });
  }, [localDepts.length, orgId, type]);

  const handleDeleteClick = async (i: number) => {
    const dept = (isEditing ? localDepts : depts)[i];
    if (dept.id <= 0) {
      // New unsaved — remove immediately
      setLocalDepts(prev => prev.filter((_, idx) => idx !== i));
      if (type === "scheduled") {
        setLocalFAs(prev => prev.filter(fa => fa.departmentId !== dept.id));
      }
      return;
    }
    const deps = await checkDepartmentDependencies(dept.id, orgId);
    setDeleteConfirm({ idx: i, dept, deps });
  };

  const handleRemove = (i: number) => {
    const dept = localDepts[i];
    setLocalDepts(prev => prev.filter((_, idx) => idx !== i));
    if (type === "scheduled") {
      setLocalFAs(prev => prev.filter(fa => fa.departmentId !== dept.id));
    }
  };

  // ── FA handlers (scheduled only) ──────────────────────────────────────────
  const handleFAChange = (faId: number, value: string) => {
    setLocalFAs(prev => prev.map(fa => fa.id === faId ? { ...fa, name: value } : fa));
  };

  const addFocusArea = (deptId: number) => {
    const id = nextTmpFaId.current--;
    const existing = faByDept(deptId, localFAs);
    setLocalFAs(prev => [...prev, {
      id,
      orgId,
      departmentId: deptId,
      name: "",
      sortOrder: existing.length,
      version: 0,
    }]);
    setExpandedIds(prev => new Set(prev).add(deptId));
  };

  const handleFADeleteClick = (fa: FocusArea) => {
    if (fa.id < 0) {
      setLocalFAs(prev => prev.filter(f => f.id !== fa.id));
      return;
    }
    setFaDeleteConfirm({ faId: fa.id, fa });
  };

  const handleFARemove = (faId: number) => {
    setLocalFAs(prev => prev.filter(f => f.id !== faId));
  };

  // ── Dept drag handlers ────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { setDraggedIdx(idx); setDragOverIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx && draggedIdx >= 0 && draggedIdx < localDepts.length && dragOverIdx >= 0 && dragOverIdx <= localDepts.length) {
      const list = [...localDepts];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocalDepts(list);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDraggedIdx(null); setDragOverIdx(null); };

  // ── FA drag handlers ──────────────────────────────────────────────────────
  const handleFADragStart = (deptId: number, idx: number) => { setFaDragDeptId(deptId); setFaDragIdx(idx); setFaDragOverIdx(idx); };
  const handleFADragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setFaDragOverIdx(idx); };
  const handleFADrop = (e: React.DragEvent, deptId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (faDragDeptId === deptId && faDragIdx !== null && faDragOverIdx !== null && faDragIdx !== faDragOverIdx) {
      const fas = faByDept(deptId, localFAs);
      const list = [...fas];
      const [item] = list.splice(faDragIdx, 1);
      list.splice(faDragOverIdx, 0, item);
      const reordered = list.map((fa, i) => ({ ...fa, sortOrder: i }));
      setLocalFAs(prev => [
        ...prev.filter(fa => fa.departmentId !== deptId),
        ...reordered,
      ]);
    }
    setFaDragDeptId(null);
    setFaDragIdx(null);
    setFaDragOverIdx(null);
  };
  const handleFADragEnd = () => { setFaDragDeptId(null); setFaDragIdx(null); setFaDragOverIdx(null); };

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dept: Department, idx: number) => {
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
      handleRemove(idx);
      if (idx > 0) {
        const prevId = localDepts[idx - 1].id;
        requestAnimationFrame(() => {
          nameRefs.current.get(prevId)?.focus();
        });
      }
    }
  };

  // ── Toggle expand/collapse ────────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Action buttons ────────────────────────────────────────────────────────
  const footerActions = isEditing ? (
    <EditorActionRow
      secondaryAction={(
        <button onClick={isDirty ? handleDiscard : handleClose} className="dg-btn dg-btn-secondary dg-btn-sm">
          {getEditorDismissLabel(isDirty)}
        </button>
      )}
      primaryAction={(
        <button onClick={handleSave} disabled={saving || !isDirty} className="dg-btn dg-btn-primary dg-btn-sm">
          {getEditorSaveLabel(saving)}
        </button>
      )}
      style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border-light)" }}
    />
  ) : canEdit && displayList.length > 0 ? (
    <EditorActionRow
      primaryAction={<button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary dg-btn-sm">Edit</button>}
      style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border-light)" }}
    />
  ) : null;

  return (
    <SectionCard noPadding>
      {/* Header: title, description, actions */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 16px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
        <div>
          <h3 style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            {title}
          </h3>
          <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            {description}
          </p>
        </div>
      </div>

      {/* Content */}
      {displayList.length === 0 && !isEditing ? (
        <EmptyState
          compact
          title={`No ${type} ${departmentLabel.toLowerCase()} defined yet`}
          style={{ border: "none", borderRadius: 0 }}
          action={canEdit ? (
            <button onClick={handleEnterEdit} className={addBtnClass} style={{ width: "100%" }}>
              + Add {type === "scheduled" ? "Scheduled" : "Management"} {departmentLabel.replace(/s$/i, "")}
            </button>
          ) : undefined}
        />
      ) : (
        <div>
          {/* Department rows */}
          {displayList.map((dept, i) => {
            const isDragging = isEditing && draggedIdx !== null && localDepts[draggedIdx]?.id === dept.id;
            const isDropTarget = isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
            const childFAs = type === "scheduled" ? faDisplayList(dept.id) : [];
            const hasMultipleFAs = childFAs.length > 1;
            const isExpanded = expandedIds.has(dept.id);
            const isSingleFA = type === "scheduled" && childFAs.length === 1;

            return (
              <React.Fragment key={dept.id}>
                {/* Divider between scheduled department groups */}
                {type === "scheduled" && i > 0 && (
                  <div style={{ borderTop: "1px solid var(--color-border-light)" }} />
                )}

                {/* Department row */}
                <div
                  className={!isEditing ? "dg-hover-row" : undefined}
                  draggable={isEditing}
                  onDragStart={isEditing ? () => handleDragStart(i) : undefined}
                  onDragOver={isEditing ? (e) => handleDragOver(e, i) : undefined}
                  onDrop={isEditing ? handleDrop : undefined}
                  onDragEnd={isEditing ? handleDragEnd : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: isEditing ? "10px 16px" : "11px 16px",
                    borderTop: isDropTarget ? "2px solid var(--color-control-active-border)" : undefined,
                    borderBottom: type === "management" && i < displayList.length - 1 ? "1px solid var(--color-border-light)" : "none",
                    cursor: isEditing ? "grab" : (type === "scheduled" && hasMultipleFAs ? "pointer" : "default"),
                    transition: "background 150ms ease, opacity 150ms ease",
                    opacity: isDragging ? 0.5 : 1,
                    userSelect: isEditing ? "none" : undefined,
                  }}
                  onClick={!isEditing && type === "scheduled" && hasMultipleFAs ? () => toggleExpand(dept.id) : undefined}
                >
                  {isEditing && <DragHandle />}

                  {/* Name */}
                  {isEditing ? (
                    <input
                      ref={(el) => { if (el) nameRefs.current.set(dept.id, el); else nameRefs.current.delete(dept.id); }}
                      value={dept.name}
                      onChange={(e) => handleItemChange(i, e.target.value)}
                      onKeyDown={(e) => handleNameKeyDown(e, dept, i)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                      placeholder="Department name"
                      style={{ ...fieldStyle, flex: 1 }}
                    />
                  ) : (
                    <>
                      <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {dept.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontWeight: 400 }}>Unnamed</span>}
                      </span>

                      {/* Multi-FA count (next to name) */}
                      {hasMultipleFAs && !isExpanded && (
                        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                          {childFAs.length} {focusAreaLabel.toLowerCase()}
                        </span>
                      )}

                      {/* Spacer */}
                      <span style={{ flex: 1 }} />

                      {/* Expand chevron (far right) */}
                      {type === "scheduled" && hasMultipleFAs && (
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms ease", flexShrink: 0, color: "var(--color-text-muted)" }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </>
                  )}

                  {/* Delete button (edit mode) */}
                  {isEditing && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(i); }}
                      style={{
                        background: "none",
                        border: "1px solid var(--color-danger-border, #FECACA)",
                        borderRadius: 8,
                        cursor: "pointer",
                        color: "var(--color-danger)",
                        padding: "5px 10px",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "background 150ms, color 150ms",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-danger-bg, #FEF2F2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* ── Focus area sub-rows (scheduled only) ─────────────────── */}
                {type === "scheduled" && (isExpanded || isEditing) && hasMultipleFAs && (
                  <>
                    {childFAs.map((fa, fi) => {
                      const faIsDragging = isEditing && faDragDeptId === dept.id && faDragIdx !== null && faByDept(dept.id, localFAs)[faDragIdx]?.id === fa.id;
                      const faIsDropTarget = isEditing && faDragDeptId === dept.id && faDragOverIdx === fi && faDragIdx !== null && faDragIdx !== fi;
                      const isLastFA = fi === childFAs.length - 1;
                      return (
                        <div
                          key={fa.id}
                          draggable={isEditing}
                          onDragStart={isEditing ? (e) => { e.stopPropagation(); handleFADragStart(dept.id, fi); } : undefined}
                          onDragOver={isEditing ? (e) => handleFADragOver(e, fi) : undefined}
                          onDrop={isEditing ? (e) => handleFADrop(e, dept.id) : undefined}
                          onDragEnd={isEditing ? handleFADragEnd : undefined}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: isEditing ? 8 : 10,
                            padding: isLastFA && !isEditing ? "8px 16px 16px 32px" : "8px 16px 8px 32px",
                            borderTop: faIsDropTarget ? "2px solid var(--color-control-active-border)" : undefined,
                            opacity: faIsDragging ? 0.5 : 1,
                            transition: "opacity 150ms ease",
                            userSelect: isEditing ? "none" : undefined,
                          }}
                        >
                          {/* Tree connector (read mode) / drag handle (edit mode) */}
                          {isEditing ? <DragHandle /> : (
                            <svg width="20" height="16" viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
                              <line x1="4" y1="0" x2="4" y2="16" stroke="var(--color-border)" strokeWidth="1.5" />
                              <line x1="4" y1="8" x2="20" y2="8" stroke="var(--color-border)" strokeWidth="1.5" />
                            </svg>
                          )}
                          {isEditing ? (
                            <input
                              value={fa.name}
                              onChange={(e) => handleFAChange(fa.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              draggable={false}
                              placeholder={`${focusAreaLabel.replace(/s$/i, "")} name`}
                              style={{ ...fieldStyle, flex: 1 }}
                            />
                          ) : (
                            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-secondary)", flex: 1 }}>
                              {fa.name || <span style={{ fontStyle: "italic", opacity: 0.6 }}>Unnamed</span>}
                            </span>
                          )}
                          {isEditing && (
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); handleFADeleteClick(fa); }}
                              style={{
                                background: "none",
                                border: "1px solid var(--color-danger-border, #FECACA)",
                                borderRadius: 8,
                                cursor: "pointer",
                                color: "var(--color-danger)",
                                padding: "5px 10px",
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                                transition: "background 150ms, color 150ms",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-danger-bg, #FEF2F2)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add focus area button (edit mode) */}
                    {isEditing && (
                      <div style={{ padding: "8px 16px 8px 60px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); addFocusArea(dept.id); }}
                          className={addBtnClass}
                          style={{ width: "100%" }}
                        >
                          + Add {focusAreaLabel.replace(/s$/i, "")}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Single-FA: split option (edit mode only) */}
                {type === "scheduled" && isEditing && isSingleFA && (
                  <div style={{ padding: "6px 16px 10px 60px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); addFocusArea(dept.id); }}
                      className="dg-btn dg-btn-secondary dg-btn-sm"
                      style={{ fontSize: "var(--dg-fs-caption)" }}
                    >
                      + Split into {focusAreaLabel}
                    </button>
                  </div>
                )}

              </React.Fragment>
            );
          })}

          {/* Dashed add button (edit mode) */}
          {isEditing && (
            <div style={{ padding: "8px 16px 12px" }}>
              <button onClick={addRow} className={addBtnClass} style={{ width: "100%" }}>
                + Add {type === "scheduled" ? "Scheduled" : "Management"} {departmentLabel.replace(/s$/i, "").toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ margin: "0 16px 12px", padding: 12, background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: "var(--dg-radius-md)", color: "var(--color-danger-text)", fontSize: "var(--dg-fs-label)", fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <strong>Save Error:</strong> {error}
        </div>
      )}

      {footerActions}

      {/* Delete confirmation dialogs */}
      {deleteConfirm && (
        deleteConfirm.deps?.hasDependencies ? (
          <ConfirmDialog
            title={`Archive "${deleteConfirm.dept.name}"?`}
            message={<>
              <strong>{deleteConfirm.dept.name}</strong> is currently {deleteConfirm.deps.summary.toLowerCase()}.
              <br /><br />
              Archiving will preserve historical records but remove it from active use. Consider renaming instead if this department is still needed.
            </>}
            confirmLabel="Archive"
            variant="warning"
            onConfirm={() => { handleRemove(deleteConfirm.idx); setDeleteConfirm(null); }}
            onCancel={() => setDeleteConfirm(null)}
            secondaryConfirmLabel="Rename Instead"
            onSecondaryConfirm={() => {
              setDeleteConfirm(null);
              requestAnimationFrame(() => {
                nameRefs.current.get(deleteConfirm.dept.id)?.focus();
                nameRefs.current.get(deleteConfirm.dept.id)?.select();
              });
            }}
          />
        ) : (
          <ConfirmDialog
            title={`Delete "${deleteConfirm.dept.name}"?`}
            message={<>This will archive <strong>{deleteConfirm.dept.name || "this department"}</strong>. Historical records will be preserved.</>}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={() => { handleRemove(deleteConfirm.idx); setDeleteConfirm(null); }}
            onCancel={() => setDeleteConfirm(null)}
          />
        )
      )}

      {faDeleteConfirm && (
        <ConfirmDialog
          title={`Delete "${faDeleteConfirm.fa.name}"?`}
          message={<>This will archive <strong>{faDeleteConfirm.fa.name || "this focus area"}</strong>. Employees assigned to it will need reassignment.</>}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => { handleFARemove(faDeleteConfirm.faId); setFaDeleteConfirm(null); }}
          onCancel={() => setFaDeleteConfirm(null)}
        />
      )}
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
  canManageOrgLabels,
  onDepartmentsChange,
  onFocusAreasChange,
}: DepartmentsSettingsProps) {
  const canEdit = canManageFocusAreas || canManageOrgLabels;

  const scheduledDepts = departments
    .filter(d => d.type === "scheduled" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const managementDepts = departments
    .filter(d => d.type === "management" && !d.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const exampleScheduledDept = scheduledDepts[0]?.name || `Scheduled ${departmentLabel.replace(/s$/i, "")}`;
  const exampleManagementDept = managementDepts[0]?.name || `Management ${departmentLabel.replace(/s$/i, "")}`;
  const exampleFocusAreas = focusAreas
    .filter((focusArea) => !focusArea.archivedAt && scheduledDepts.some((department) => department.id === focusArea.departmentId))
    .slice(0, 2)
    .map((focusArea) => focusArea.name);
  const infoPoints = [
    {
      title: "Departments are the top-level structure",
      description: `A ${departmentLabel.replace(/s$/i, "").toLowerCase()} groups related teams. Scheduled and management ${departmentLabel.toLowerCase()} serve different parts of the app.`,
    },
    {
      title: `${focusAreaLabel} live inside scheduled departments`,
      description: `Scheduled ${departmentLabel.toLowerCase()} can contain one or more ${focusAreaLabel.toLowerCase()}. Those ${focusAreaLabel.toLowerCase()} are the groups that actually appear on the schedule grid.`,
    },
    {
      title: "Management departments are for app access, not staffing rows",
      description: `Use management ${departmentLabel.toLowerCase()} for people who need org access without appearing as scheduled staff.`,
    },
    {
      title: "Moving or archiving items changes grouping everywhere",
      description: `Reordering, renaming, moving, or archiving a ${departmentLabel.replace(/s$/i, "").toLowerCase()} or ${focusAreaLabel.replace(/s$/i, "").toLowerCase()} changes how people and schedule sections are organized across the app.`,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ExplainerSection
        title="Department structure"
        defaultOpen
        storageKey="dg-explainer-departments"
        points={infoPoints}
        preview={(
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <PreviewFrame
              title="Scheduled hierarchy"
              subtitle="How staff reach the schedule grid"
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border-light)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Example scheduled {departmentLabel.replace(/s$/i, "").toLowerCase()}
                </div>
                <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {exampleScheduledDept}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(exampleFocusAreas.length > 0 ? exampleFocusAreas : ["East Wing", "West Wing"]).map((name) => (
                    <span
                      key={name}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "3px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "var(--color-brand-bg)",
                        border: "1px solid var(--color-brand-border)",
                        color: "var(--color-brand)",
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <WorkflowStrip
                steps={[
                  {
                    label: exampleScheduledDept,
                    description: `Scheduled ${departmentLabel.replace(/s$/i, "").toLowerCase()}`,
                    tone: "default",
                  },
                  {
                    label: exampleFocusAreas[0] || `${focusAreaLabel.replace(/s$/i, "")} A`,
                    description: `${focusAreaLabel.replace(/s$/i, "")} on the grid`,
                    tone: "info",
                  },
                  {
                    label: "Schedule grouping",
                    description: "Staff rows and coverage rollups",
                    tone: "success",
                  },
                ]}
              />
            </PreviewFrame>

            <PreviewFrame
              title="Management hierarchy"
              subtitle="App access without schedule rows"
            >
              <WorkflowStrip
                steps={[
                  {
                    label: exampleManagementDept,
                    description: `Management ${departmentLabel.replace(/s$/i, "").toLowerCase()}`,
                    tone: "default",
                  },
                  {
                    label: "Org access",
                    description: "Permissions and membership",
                    tone: "info",
                  },
                  {
                    label: "No grid row",
                    description: "Does not create a scheduled staff row",
                    tone: "warning",
                  },
                ]}
              />
            </PreviewFrame>
          </div>
        )}
      />

      <DepartmentSection
        title={`Scheduled ${departmentLabel}`}
        description="Scheduled departments appear on the grid. Each department has one or more focus areas that define how staff are grouped on the schedule."
        depts={scheduledDepts}
        allDepartments={departments}
        focusAreas={focusAreas}
        orgId={orgId}
        type="scheduled"
        canEdit={canEdit}
        focusAreaLabel={focusAreaLabel}
        departmentLabel={departmentLabel}
        onDepartmentsChange={onDepartmentsChange}
        onFocusAreasChange={onFocusAreasChange}
      />

      <DepartmentSection
        title={`Management ${departmentLabel}`}
        description="For people who use the app but don't appear on the schedule (e.g. HR, Reception, Finance)."
        depts={managementDepts}
        allDepartments={departments}
        focusAreas={focusAreas}
        orgId={orgId}
        type="management"
        canEdit={canEdit}
        focusAreaLabel={focusAreaLabel}
        departmentLabel={departmentLabel}
        onDepartmentsChange={onDepartmentsChange}
        onFocusAreasChange={onFocusAreasChange}
      />
    </div>
  );
}
