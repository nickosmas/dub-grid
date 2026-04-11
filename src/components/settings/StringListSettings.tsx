"use client";

import React, { useState, useRef, useMemo, useCallback } from "react";
import { NamedItem, Department } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SectionCard } from "./shared";
import type { DependencyInfo } from "@/lib/db";

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
}: {
  label: string;
  items: NamedItem[];
  onSave: (items: NamedItem[]) => Promise<void>;
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
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [isEditing, setIsEditing] = useState(initialEditing ?? false);
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [deleteConfirm, setDeleteConfirm] = useState<{ idx: number; item: NamedItem; deps: DependencyInfo | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextTmpId = useRef(-1);
  const nameRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const abbrRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Clean comparison: ignore empty uncommitted rows
  const nonEmpty = useCallback(
    (list: NamedItem[]) => list.filter((it) => it.name.trim()),
    [],
  );
  const isDirty = useMemo(
    () => JSON.stringify(nonEmpty(local)) !== JSON.stringify(items),
    [local, items, nonEmpty],
  );

  const displayList = useMemo((): NamedItem[] => {
    if (!isEditing) return items;
    if (draggedIdx === null || dragOverIdx === null) return local;
    const list = [...local];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, local, items, draggedIdx, dragOverIdx]);

  const handleEnterEdit = () => {
    setLocal([...items]);
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setLocal([...items]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setError(null);
  };

  const handleSave = async () => {
    const cleaned = nonEmpty(local).map((it, i) => ({
      ...it,
      name: it.name.trim(),
      abbr: it.abbr.trim() || it.name.trim(),
      sortOrder: i,
    }));

    const keys = cleaned.map((it) => `${it.name.toLowerCase()}::${it.departmentId ?? ""}`);
    const dupes = keys.filter((k, i) => k && keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      const dupeName = dupes[0].split("::")[0];
      setError(`Duplicate name: "${dupeName}"`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(cleaned);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : JSON.stringify(err);
      setError(msg || "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const addRow = useCallback(() => {
    const id = nextTmpId.current--;
    setLocal((prev) => [
      ...prev,
      { id, orgId: "", name: "", abbr: "", sortOrder: prev.length, departmentId: null },
    ]);
    requestAnimationFrame(() => {
      nameRefs.current.get(id)?.focus();
    });
  }, []);

  const handleRemove = (i: number) => {
    setLocal((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleDeleteClick = async (i: number) => {
    const item = local[i];
    // New unsaved items (negative ID) — remove immediately without confirmation
    if (item.id <= 0) { handleRemove(i); return; }
    // Existing items — check dependencies
    if (onCheckDependencies) {
      const deps = await onCheckDependencies(item.id);
      setDeleteConfirm({ idx: i, item, deps });
    } else {
      // No dependency checker provided — remove immediately
      handleRemove(i);
    }
  };

  const activeDepts = useMemo(
    () => (departments ?? []).filter((d) => !d.archivedAt && d.type === "scheduled"),
    [departments],
  );
  const deptMap = useMemo(
    () => new Map(activeDepts.map((d) => [d.id, d])),
    [activeDepts],
  );
  const showDept = activeDepts.length > 0;

  const handleItemChange = (i: number, field: "name" | "abbr", value: string) => {
    setLocal((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const handleDeptChange = (i: number, value: string) => {
    const departmentId = value === "" ? null : Number(value);
    setLocal((prev) => prev.map((item, idx) => (idx === i ? { ...item, departmentId } : item)));
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, item: NamedItem, idx: number) => {
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

  const handleAbbrKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, item: NamedItem, idx: number) => {
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

  const handleNameBackspace = (e: React.KeyboardEvent<HTMLInputElement>, item: NamedItem, idx: number) => {
    if (e.key === "Backspace" && !item.name && !item.abbr && item.id < 0) {
      e.preventDefault();
      handleRemove(idx);
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

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { setDraggedIdx(idx); setDragOverIdx(idx); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(targetIdx); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx && draggedIdx >= 0 && draggedIdx < local.length && dragOverIdx >= 0 && dragOverIdx <= local.length) {
      const list = [...local];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocal(list);
    }
    setDraggedIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDraggedIdx(null); setDragOverIdx(null); };

  // ── Input style ────────────────────────────────────────────────────────────
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

  const addBtnClass = "dg-btn dg-btn-dashed dg-btn-sm";

  const deptCol = showDept ? (isMobile ? " minmax(100px, 1fr)" : " minmax(140px, 1fr)") : "";
  const gridCols = hideAbbr
    ? isEditing
      ? `24px 2fr${deptCol} auto`
      : `2fr${deptCol}`
    : isEditing
      ? `24px 2fr 1fr${deptCol} auto`
      : `2fr 1fr${deptCol}`;

  const actionButtons = (
    <>
      {!isEditing && canEdit && displayList.length > 0 && (
        <button
          onClick={handleEnterEdit}
          className="dg-btn dg-btn-secondary dg-btn-sm"
        >
          Edit
        </button>
      )}
      {isEditing && (
        <>
          {isDirty && (
            <button onClick={handleSave} disabled={saving} className="dg-btn dg-btn-primary dg-btn-sm">
              {saving ? "Saving\u2026" : "Save All"}
            </button>
          )}
          <button onClick={handleCancel} className="dg-btn dg-btn-secondary dg-btn-sm">
            Cancel
          </button>
        </>
      )}
      {saved && (
        <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>Saved!</span>
      )}
    </>
  );

  const content = (
    <div>

      {/* Table */}
      {displayList.length === 0 && !isEditing ? (
        <EmptyState
          compact
          title={`No ${label.toLowerCase()} defined yet`}
          action={canEdit ? (
            <button onClick={handleEnterEdit} className={addBtnClass} style={{ width: "100%" }}>
              + Add {label.replace(/s$/, "")}
            </button>
          ) : undefined}
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
              alignItems: "center",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            {(isEditing
              ? hideAbbr
                ? ["", "Name", ...(showDept ? ["Department"] : []), ""]
                : ["", "Full Name", "Abbreviation", ...(showDept ? ["Department"] : []), ""]
              : hideAbbr
                ? ["Name", ...(showDept ? ["Department"] : [])]
                : ["Full Name", "Abbreviation", ...(showDept ? ["Department"] : [])]
            ).map((h, i) => (
              <div key={i} style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Item rows */}
          {displayList.map((item, i) => {
            const isDragging = isEditing && draggedIdx !== null && local[draggedIdx]?.id === item.id;
            const isDropTarget = isEditing && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
            return (
              <div
                key={item.id}
                draggable={isEditing}
                onDragStart={isEditing ? () => handleDragStart(i) : undefined}
                onDragOver={isEditing ? (e) => handleDragOver(e, i) : undefined}
                onDrop={isEditing ? handleDrop : undefined}
                onDragEnd={isEditing ? handleDragEnd : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  padding: isEditing ? "10px 16px" : "11px 16px",
                  gap: 16,
                  borderTop: isDropTarget ? "2px solid var(--color-brand)" : undefined,
                  borderBottom: i < displayList.length - 1 ? "1px solid var(--color-border-light)" : "none",
                  alignItems: "center",
                  cursor: isEditing ? "grab" : "default",
                  transition: "background 150ms ease, opacity 150ms ease",
                  opacity: isDragging ? 0.5 : 1,
                  userSelect: isEditing ? "none" : undefined,
                }}
              >
                {isEditing && (
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
                )}

                {isEditing ? (
                  <input
                    ref={(el) => { if (el) nameRefs.current.set(item.id, el); else nameRefs.current.delete(item.id); }}
                    value={item.name}
                    onChange={(e) => handleItemChange(i, "name", e.target.value)}
                    onKeyDown={(e) => { handleNameBackspace(e, item, i); handleNameKeyDown(e, item, i); }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    draggable={false}
                    placeholder="Full name"
                    style={fieldStyle}
                  />
                ) : (
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {item.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontWeight: 400 }}>Unnamed</span>}
                  </div>
                )}

                {!hideAbbr && (isEditing ? (
                  <input
                    ref={(el) => { if (el) abbrRefs.current.set(item.id, el); else abbrRefs.current.delete(item.id); }}
                    value={item.abbr}
                    onChange={(e) => handleItemChange(i, "abbr", e.target.value)}
                    onKeyDown={(e) => handleAbbrKeyDown(e, item, i)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    draggable={false}
                    placeholder="Abbreviation"
                    style={{ ...fieldStyle, fontWeight: 600 }}
                  />
                ) : (
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-muted)" }}>
                    {item.abbr}
                  </div>
                ))}

                {showDept && (isEditing ? (
                  <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} draggable={false}>
                    <CustomSelect
                      value={item.departmentId != null ? String(item.departmentId) : ""}
                      options={[
                        { value: "", label: "Org-wide" },
                        ...activeDepts.map((d) => ({ value: String(d.id), label: d.name })),
                      ]}
                      onChange={(val) => handleDeptChange(i, val)}
                      fontSize="var(--dg-fs-label)"
                    />
                  </div>
                ) : (
                  <div>
                    {item.departmentId ? (
                      <span
                        style={{
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 500,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {deptMap.get(item.departmentId)?.name ?? "—"}
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
                          background: "var(--color-brand-bg, rgba(0,95,2,0.08))",
                          border: "1px solid var(--color-brand-border, rgba(0,95,2,0.2))",
                          color: "var(--color-brand)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Org-wide
                      </span>
                    )}
                  </div>
                ))}

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
            );
          })}

          {/* Dashed add button — only in edit mode */}
          {isEditing && (
            <div style={{ padding: "8px 16px 12px" }}>
              <button onClick={addRow} className={addBtnClass} style={{ width: "100%" }}>
                + Add {placeholder.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 8, color: "var(--color-danger-text)", fontSize: "var(--dg-fs-label)", fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <strong>Save Error:</strong> {error}
        </div>
      )}

      {deleteConfirm && (
        deleteConfirm.deps?.hasDependencies ? (
          <ConfirmDialog
            title={`Archive "${deleteConfirm.item.name}"?`}
            message={<>
              <strong>{deleteConfirm.item.name}</strong> is currently {deleteConfirm.deps.summary.toLowerCase()}.
              <br /><br />
              Archiving will preserve historical records but remove it from dropdowns and new assignments.
              Consider renaming instead if this item is still needed under a different name.
            </>}
            confirmLabel="Archive"
            variant="warning"
            onConfirm={() => { handleRemove(deleteConfirm.idx); setDeleteConfirm(null); }}
            onCancel={() => setDeleteConfirm(null)}
            secondaryConfirmLabel="Rename Instead"
            onSecondaryConfirm={() => {
              setDeleteConfirm(null);
              // Focus the name input for renaming
              requestAnimationFrame(() => {
                nameRefs.current.get(deleteConfirm.item.id)?.focus();
                nameRefs.current.get(deleteConfirm.item.id)?.select();
              });
            }}
          />
        ) : (
          <ConfirmDialog
            title={`Delete "${deleteConfirm.item.name}"?`}
            message={<>This will archive <strong>{deleteConfirm.item.name}</strong>. Historical records will be preserved.</>}
            confirmLabel="Delete"
            variant="danger"
            onConfirm={() => { handleRemove(deleteConfirm.idx); setDeleteConfirm(null); }}
            onCancel={() => setDeleteConfirm(null)}
          />
        )
      )}
    </div>
  );

  if (sectionTitle) {
    return (
      <SectionCard noPadding>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {actionButtons}
          </div>
        </div>
        {content}
      </SectionCard>
    );
  }

  return content;
}
