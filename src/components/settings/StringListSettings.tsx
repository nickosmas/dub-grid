"use client";

import React, { useState, useRef, useMemo, useCallback } from "react";
import { NamedItem, Department } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";

export default function StringListSettings({
  label,
  items,
  onSave,
  placeholder,
  canEdit = true,
  hideAbbr = false,
  departments,
}: {
  label: string;
  items: NamedItem[];
  onSave: (items: NamedItem[]) => Promise<void>;
  placeholder: string;
  canEdit?: boolean;
  hideAbbr?: boolean;
  departments?: Department[];
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [isEditing, setIsEditing] = useState(false);
  const [local, setLocal] = useState<NamedItem[]>(items);
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
    // Strip empty rows before saving
    const cleaned = nonEmpty(local).map((it, i) => ({
      ...it,
      name: it.name.trim(),
      abbr: it.abbr.trim() || it.name.trim(),
      sortOrder: i,
    }));

    // Validate no duplicate names (within the same department scope)
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
    // Focus new row's name input after render
    requestAnimationFrame(() => {
      nameRefs.current.get(id)?.focus();
    });
  }, []);

  const handleRemove = (i: number) => {
    setLocal((prev) => prev.filter((_, idx) => idx !== i));
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

  const handleItemChange = (
    i: number,
    field: "name" | "abbr",
    value: string,
  ) => {
    setLocal((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleDeptChange = (i: number, value: string) => {
    const departmentId = value === "" ? null : Number(value);
    setLocal((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, departmentId } : item,
      ),
    );
  };

  const handleNameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hideAbbr) {
        // No abbr field — behave like abbr Enter: go to next row or add new
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

  const handleAbbrKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If this row is empty, don't create another
      if (!item.name.trim() && !item.abbr.trim()) return;
      // If there's a next row, focus it; otherwise add a new row
      if (idx < local.length - 1) {
        nameRefs.current.get(local[idx + 1].id)?.focus();
      } else {
        addRow();
      }
    }
  };

  // Backspace on empty name removes the row (if it's a new empty row)
  const handleNameBackspace = (
    e: React.KeyboardEvent<HTMLInputElement>,
    item: NamedItem,
    idx: number,
  ) => {
    if (
      e.key === "Backspace" &&
      !item.name &&
      !item.abbr &&
      item.id < 0 // only auto-remove temp rows
    ) {
      e.preventDefault();
      handleRemove(idx);
      // Focus previous row
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
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetIdx: number,
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(targetIdx);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (
      draggedIdx !== null &&
      dragOverIdx !== null &&
      draggedIdx !== dragOverIdx &&
      draggedIdx >= 0 &&
      draggedIdx < local.length &&
      dragOverIdx >= 0 &&
      dragOverIdx <= local.length
    ) {
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

  // ── Input style ────────────────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    fontSize: "var(--dg-fs-label)",
    fontWeight: 500,
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    outline: "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  };

  const deptCol = showDept ? (isMobile ? " 120px" : " 180px") : "";
  const gridCols = hideAbbr
    ? isEditing
      ? `24px 32px 1fr${deptCol} 28px`
      : `32px 1fr${deptCol}`
    : isMobile
      ? isEditing
        ? `24px 32px 1fr 100px${deptCol} 28px`
        : `32px 1fr 100px${deptCol}`
      : isEditing
        ? `24px 32px 1fr 200px${deptCol} 28px`
        : `32px 1fr 200px${deptCol}`;

  return (
    <div style={{ padding: "16px" }}>
      <p
        style={{
          fontSize: "var(--dg-fs-caption)",
          color: "var(--color-text-muted)",
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        {label}
      </p>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {!isEditing && canEdit && displayList.length > 0 && (
          <button
            onClick={handleEnterEdit}
            className="dg-btn dg-btn-secondary"
            style={{
              padding: "7px 12px",
              fontSize: "var(--dg-fs-caption)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        )}
        {isEditing && (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="dg-btn dg-btn-primary"
              style={{
                padding: "7px 14px",
                opacity: !isDirty ? 0.5 : 1,
              }}
            >
              {saving ? "Saving\u2026" : "Save"}
            </button>
            <button
              onClick={handleCancel}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 14px" }}
            >
              Cancel
            </button>
          </>
        )}
        {saved && (
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              color: "var(--color-brand)",
              fontWeight: 600,
            }}
          >
            Saved!
          </span>
        )}
      </div>

      {/* Table */}
      {displayList.length === 0 && !isEditing ? (
        <EmptyState
          compact
          title="No items defined yet"
          action={canEdit ? (
            <button
              onClick={handleEnterEdit}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "7px 16px", fontSize: "var(--dg-fs-caption)" }}
            >
              + Add New
            </button>
          ) : undefined}
        />
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
              ? hideAbbr
                ? ["", "#", "Name", ...(showDept ? ["Department"] : []), ""]
                : ["", "#", "Full Name", "Abbreviation", ...(showDept ? ["Department"] : []), ""]
              : hideAbbr
                ? ["#", "Name", ...(showDept ? ["Department"] : [])]
                : ["#", "Full Name", "Abbreviation", ...(showDept ? ["Department"] : [])]
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
            const isDragging =
              isEditing &&
              draggedIdx !== null &&
              local[draggedIdx]?.id === item.id;
            const isDropTarget =
              isEditing &&
              dragOverIdx === i &&
              draggedIdx !== null &&
              draggedIdx !== i;
            return (
              <div
                key={item.id}
                draggable={isEditing}
                onDragStart={
                  isEditing ? () => handleDragStart(i) : undefined
                }
                onDragOver={
                  isEditing ? (e) => handleDragOver(e, i) : undefined
                }
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
                  background:
                    i % 2 === 0
                      ? "var(--color-surface)"
                      : "var(--color-row-alt)",
                  cursor: isEditing ? "grab" : "default",
                  transition:
                    "background 150ms ease, opacity 150ms ease",
                  opacity: isDragging ? 0.5 : 1,
                  userSelect: isEditing ? "none" : undefined,
                }}
              >
                {isEditing && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="currentColor"
                    >
                      <rect x="3" y="2" width="2" height="2" rx="1" />
                      <rect x="9" y="2" width="2" height="2" rx="1" />
                      <rect x="3" y="6" width="2" height="2" rx="1" />
                      <rect x="9" y="6" width="2" height="2" rx="1" />
                      <rect x="3" y="10" width="2" height="2" rx="1" />
                      <rect x="9" y="10" width="2" height="2" rx="1" />
                    </svg>
                  </div>
                )}

                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: "var(--color-text-faint)",
                  }}
                >
                  {i + 1}
                </div>

                {isEditing ? (
                  <input
                    ref={(el) => {
                      if (el) nameRefs.current.set(item.id, el);
                      else nameRefs.current.delete(item.id);
                    }}
                    value={item.name}
                    onChange={(e) =>
                      handleItemChange(i, "name", e.target.value)
                    }
                    onKeyDown={(e) => {
                      handleNameBackspace(e, item, i);
                      handleNameKeyDown(e, item, i);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    draggable={false}
                    placeholder="Full name"
                    style={fieldStyle}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {item.name}
                  </div>
                )}

                {!hideAbbr && (isEditing ? (
                  <input
                    ref={(el) => {
                      if (el) abbrRefs.current.set(item.id, el);
                      else abbrRefs.current.delete(item.id);
                    }}
                    value={item.abbr}
                    onChange={(e) =>
                      handleItemChange(i, "abbr", e.target.value)
                    }
                    onKeyDown={(e) => handleAbbrKeyDown(e, item, i)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    draggable={false}
                    placeholder="Abbreviation"
                    style={{ ...fieldStyle, fontWeight: 600 }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {item.abbr}
                  </div>
                ))}

                {showDept && (isEditing ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    draggable={false}
                  >
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
                          padding: "1px 8px",
                          borderRadius: 20,
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          background: "var(--color-bg-secondary)",
                          border: "1px solid var(--color-border-light)",
                          color: "var(--color-text-secondary)",
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(i);
                    }}
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
                    &times;
                  </button>
                )}
              </div>
            );
          })}

          {/* Add row button — only in edit mode */}
          {isEditing && (
            <button
              onClick={addRow}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "10px 16px",
                background: "none",
                border: "none",
                borderTop: "1px solid var(--color-border-light)",
                cursor: "pointer",
                color: "var(--color-brand)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  "var(--color-brand-bg)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "none")
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add {placeholder.toLowerCase()}
            </button>
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
