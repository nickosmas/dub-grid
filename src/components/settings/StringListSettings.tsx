"use client";

import React, { useState, useRef, useMemo } from "react";
import { NamedItem } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import { inputStyle } from "./shared";

export default function StringListSettings({
  label,
  items,
  onSave,
  placeholder,
  canEdit = true,
}: {
  label: string;
  items: NamedItem[];
  onSave: (items: NamedItem[]) => Promise<void>;
  placeholder: string;
  canEdit?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<NamedItem[]>(items);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextTmpId = useRef(-1);

  const isDirty = JSON.stringify(local) !== JSON.stringify(items);

  const displayList = useMemo((): NamedItem[] => {
    if (!isEditing || draggedIdx === null || dragOverIdx === null) return isEditing ? local : items;
    const list = [...local];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [isEditing, local, items, draggedIdx, dragOverIdx]);

  const handleEnterEdit = () => {
    setLocal([...items]);
    setIsEditing(true);
    setNewName("");
    setNewAbbr("");
    setError(null);
  };

  const handleCancel = () => {
    setLocal([...items]);
    setIsEditing(false);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setNewName("");
    setNewAbbr("");
    setError(null);
  };

  const handleSave = async () => {
    // Validate no duplicate names
    const names = local.map((it) => it.name.trim().toLowerCase());
    const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setError(`Duplicate name: "${dupes[0]}"`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(local);
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

  const handleAdd = () => {
    const trimmedName = newName.trim();
    const trimmedAbbr = newAbbr.trim() || trimmedName;
    if (!trimmedName || local.some((it) => it.name === trimmedName)) return;
    setLocal((prev) => [...prev, { id: nextTmpId.current--, orgId: "", name: trimmedName, abbr: trimmedAbbr, sortOrder: prev.length }]);
    setNewName("");
    setNewAbbr("");
  };

  const handleRemove = (i: number) => {
    setLocal((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleItemChange = (i: number, field: "name" | "abbr", value: string) => {
    setLocal((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(targetIdx);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx
        && draggedIdx >= 0 && draggedIdx < local.length
        && dragOverIdx >= 0 && dragOverIdx <= local.length) {
      const list = [...local];
      const [item] = list.splice(draggedIdx, 1);
      list.splice(dragOverIdx, 0, item);
      setLocal(list);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const gridCols = isMobile
    ? (isEditing ? "24px 32px 1fr 100px 28px" : "32px 1fr 100px")
    : (isEditing ? "24px 32px 1fr 200px 28px" : "32px 1fr 200px");

  return (
    <div style={{ padding: "16px" }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 0, marginBottom: 12 }}>
        {label}
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {!isEditing && (
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
        )}
        {isEditing && isDirty && (
          <button onClick={handleSave} disabled={saving} className="dg-btn dg-btn-primary" style={{ padding: "7px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {isEditing && (
          <button onClick={handleCancel} className="dg-btn dg-btn-secondary" style={{ padding: "7px 14px" }}>
            Cancel
          </button>
        )}
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>Saved!</span>
        )}
      </div>

      {/* Table */}
      {displayList.length === 0 && !isEditing ? (
        <div style={{
          border: "1px dashed var(--color-border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <span>No items defined yet</span>
          {canEdit && (
            <button onClick={handleEnterEdit} className="dg-btn dg-btn-secondary" style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}>
              + Add New
            </button>
          )}
        </div>
      ) : (
      <div
        style={{
          overflow: "hidden",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            background: isEditing ? "var(--color-brand-bg)" : undefined,
          }}
        >
          {(isEditing
            ? ["", "#", "Full Name", "Abbreviation", ""]
            : ["#", "Full Name", "Abbreviation"]
          ).map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.06em",
              }}
            >
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
                padding: "8px 16px",
                borderTop: isDropTarget
                  ? "2px solid var(--color-brand)"
                  : i === 0
                    ? "none"
                    : "1px solid var(--color-border-light)",
                alignItems: "center",
                background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                cursor: isEditing ? "grab" : "default",
                transition: "background 150ms ease, opacity 150ms ease",
                opacity: isDragging ? 0.5 : 1,
                userSelect: isEditing ? "none" : undefined,
              }}
            >
              {isEditing && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="3" y="2" width="2" height="2" rx="1"/>
                    <rect x="9" y="2" width="2" height="2" rx="1"/>
                    <rect x="3" y="6" width="2" height="2" rx="1"/>
                    <rect x="9" y="6" width="2" height="2" rx="1"/>
                    <rect x="3" y="10" width="2" height="2" rx="1"/>
                    <rect x="9" y="10" width="2" height="2" rx="1"/>
                  </svg>
                </div>
              )}

              <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-faint)" }}>
                {i + 1}
              </div>

              {isEditing ? (
                <input
                  value={item.name}
                  onChange={(e) => handleItemChange(i, "name", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  draggable={false}
                  placeholder="Full name"
                  style={{ ...inputStyle, fontSize: "var(--dg-fs-label)", fontWeight: 500 }}
                />
              ) : (
                <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
                  {item.name}
                </div>
              )}

              {isEditing ? (
                <input
                  value={item.abbr}
                  onChange={(e) => handleItemChange(i, "abbr", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  draggable={false}
                  placeholder="Abbreviation"
                  style={{ ...inputStyle, fontSize: "var(--dg-fs-label)", fontWeight: 600 }}
                />
              ) : (
                <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-muted)" }}>
                  {item.abbr}
                </div>
              )}

              {isEditing && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontSize: "var(--dg-fs-body)",
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Add new row — only in edit mode */}
        {isEditing && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              padding: "8px 16px",
              borderTop: "1px solid var(--color-border-light)",
              alignItems: "center",
              background: "var(--color-bg)",
            }}
          >
            <div />
            <div />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={placeholder}
              style={{ ...inputStyle, fontSize: "var(--dg-fs-label)" }}
            />
            <input
              value={newAbbr}
              onChange={(e) => setNewAbbr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Abbreviation"
              style={{ ...inputStyle, fontSize: "var(--dg-fs-label)" }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              style={{
                background: "none",
                border: "none",
                cursor: newName.trim() ? "pointer" : "not-allowed",
                color: newName.trim() ? "var(--color-brand)" : "var(--color-text-faint)",
                fontSize: "var(--dg-fs-heading)",
                fontWeight: 700,
                lineHeight: 1,
                padding: 0,
              }}
              title="Add"
            >
              +
            </button>
          </div>
        )}
      </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: 8,
            color: "var(--color-danger-text)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 500,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <strong>Save Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
