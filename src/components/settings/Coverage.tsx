"use client";

import React, { useState, useCallback } from "react";
import { CoverageRequirement, FocusArea, ShiftCategory, ShiftCode, ShiftDisplayMode } from "@/types";
import { saveCoverageRequirements } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import { fmt12h } from "@/lib/utils";
import { borderColor } from "@/lib/colors";
import { Section } from "./shared";

// ── Coverage Requirements Settings ────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CoverageRequirementsSettings({
  orgId,
  focusAreas,
  shiftCategories,
  shiftCodes,
  coverageRequirements,
  onCoverageRequirementsChange,
  canEdit,
  shiftDisplayMode = "code",
}: {
  orgId: string;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  shiftCodes: ShiftCode[];
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canEdit: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const isNameMode = shiftDisplayMode === "name";
  // Expand key = "focusAreaId-categoryId"
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Draft edits keyed by "focusAreaId-categoryId"
  type CodeReq = { shiftCodeId: number; minStaff: number };
  type DraftRow = { dayOfWeek: number | null; codeRequirements: CodeReq[] };
  type DraftEntry = { everyDay: boolean; rows: DraftRow[] };
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});

  // Get the shift codes belonging to a (focusArea, category) group
  const getCodesForGroup = useCallback(
    (focusAreaId: number, categoryId: number): ShiftCode[] => {
      return shiftCodes.filter(
        (sc) =>
          !sc.archivedAt &&
          sc.categoryId === categoryId &&
          sc.focusAreaId === focusAreaId,
      );
    },
    [shiftCodes],
  );

  const getDraft = useCallback(
    (focusAreaId: number, categoryId: number): DraftEntry => {
      const key = `${focusAreaId}-${categoryId}`;
      if (drafts[key]) return drafts[key];

      const codes = getCodesForGroup(focusAreaId, categoryId);
      const makeEmptyCodeReqs = (): CodeReq[] =>
        codes.map((sc) => ({ shiftCodeId: sc.id, minStaff: 0 }));

      // Build from existing requirements for codes in this group
      const codeIds = new Set(codes.map((sc) => sc.id));
      const existing = coverageRequirements.filter(
        (r) => r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId),
      );

      if (existing.length === 0) {
        return { everyDay: true, rows: [{ dayOfWeek: null, codeRequirements: makeEmptyCodeReqs() }] };
      }

      const hasEveryDay = existing.some((r) => r.dayOfWeek === null);
      if (hasEveryDay) {
        const codeReqs = codes.map((sc) => {
          const match = existing.find((r) => r.shiftCodeId === sc.id && r.dayOfWeek === null);
          return { shiftCodeId: sc.id, minStaff: match?.minStaff ?? 0 };
        });
        return { everyDay: true, rows: [{ dayOfWeek: null, codeRequirements: codeReqs }] };
      }

      // Per-day mode: fill all 7 days
      const rows: DraftRow[] = [];
      for (let d = 0; d < 7; d++) {
        const codeReqs = codes.map((sc) => {
          const match = existing.find((r) => r.shiftCodeId === sc.id && r.dayOfWeek === d);
          return { shiftCodeId: sc.id, minStaff: match?.minStaff ?? 0 };
        });
        rows.push({ dayOfWeek: d, codeRequirements: codeReqs });
      }
      return { everyDay: false, rows };
    },
    [coverageRequirements, drafts, getCodesForGroup],
  );

  const setDraft = useCallback((focusAreaId: number, categoryId: number, entry: DraftEntry) => {
    setDrafts((prev) => ({ ...prev, [`${focusAreaId}-${categoryId}`]: entry }));
  }, []);

  const handleToggleEveryDay = useCallback(
    (focusAreaId: number, categoryId: number) => {
      const current = getDraft(focusAreaId, categoryId);
      if (current.everyDay) {
        // Switch to per-day: duplicate current every-day row to all 7 days
        const val = current.rows[0]?.codeRequirements ?? [];
        const rows: DraftRow[] = [];
        for (let d = 0; d < 7; d++) {
          rows.push({ dayOfWeek: d, codeRequirements: val.map((c) => ({ ...c })) });
        }
        setDraft(focusAreaId, categoryId, { everyDay: false, rows });
      } else {
        // Check if per-day values differ — warn before collapsing
        const allValues = current.rows.map((r) => JSON.stringify(r.codeRequirements.map((c) => c.minStaff)));
        const hasDifferentDays = new Set(allValues).size > 1;
        if (hasDifferentDays && !window.confirm("Per-day values differ. Switching to 'Same every day' will keep only Monday's values. Continue?")) {
          return;
        }
        // Switch to every-day: use Monday's values (index 1)
        const mon = current.rows.find((r) => r.dayOfWeek === 1) ?? current.rows[0];
        const codeReqs = mon?.codeRequirements.map((c) => ({ ...c })) ?? [];
        setDraft(focusAreaId, categoryId, {
          everyDay: true,
          rows: [{ dayOfWeek: null, codeRequirements: codeReqs }],
        });
      }
    },
    [getDraft, setDraft],
  );

  const handleCodeChange = useCallback(
    (focusAreaId: number, categoryId: number, rowIndex: number, codeIndex: number, value: number) => {
      const current = getDraft(focusAreaId, categoryId);
      const rows = current.rows.map((r, ri) => {
        if (ri !== rowIndex) return r;
        const codeRequirements = r.codeRequirements.map((c, ci) => {
          if (ci !== codeIndex) return c;
          return { ...c, minStaff: Math.min(999, Math.max(0, value)) };
        });
        return { ...r, codeRequirements };
      });
      setDraft(focusAreaId, categoryId, { ...current, rows });
    },
    [getDraft, setDraft],
  );

  const handleSave = useCallback(
    async (focusAreaId: number, categoryId: number) => {
      const draft = getDraft(focusAreaId, categoryId);
      const codes = getCodesForGroup(focusAreaId, categoryId);
      const codeIds = new Set(codes.map((sc) => sc.id));
      const key = `${focusAreaId}-${categoryId}`;
      setSavingKey(key);
      try {
        // Save per code — collect all saved results
        const allSaved: CoverageRequirement[] = [];
        for (const code of codes) {
          const rows = draft.rows.map((r) => {
            const cr = r.codeRequirements.find((c) => c.shiftCodeId === code.id);
            return { dayOfWeek: r.dayOfWeek, minStaff: cr?.minStaff ?? 0 };
          });
          const saved = await saveCoverageRequirements(orgId, focusAreaId, code.id, rows);
          allSaved.push(...saved);
        }
        // Update parent state: remove old entries for codes in this group, add new ones
        const remaining = coverageRequirements.filter(
          (r) => !(r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId)),
        );
        onCoverageRequirementsChange([...remaining, ...allSaved]);
        // Clear draft
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[`${focusAreaId}-${categoryId}`];
          return next;
        });
        toast.success("Coverage requirements saved");
      } catch (e) {
        Sentry.captureException(e);
        toast.error("Failed to save coverage requirements");
      } finally {
        setSavingKey(null);
      }
    },
    [getDraft, getCodesForGroup, orgId, coverageRequirements, onCoverageRequirementsChange],
  );

  const activeCategories = shiftCategories.filter((c) => !c.archivedAt);
  const activeFocusAreas = focusAreas.filter((fa) => !fa.archivedAt);

  if (activeFocusAreas.length === 0 || activeCategories.length === 0) {
    return (
      <div style={{
        border: "1px dashed var(--color-border)",
        borderRadius: 12,
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: "var(--dg-fs-label)",
      }}>
        {activeFocusAreas.length === 0
          ? "Create focus areas first to configure coverage requirements."
          : "Create shift categories first to configure coverage requirements."}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: 48,
    padding: "4px 4px",
    fontSize: "var(--dg-fs-caption)",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    textAlign: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", margin: 0 }}>
        Set minimum staffing requirements per focus area and shift code. These will be shown in the schedule grid tally rows and the coverage panel.
      </p>

      {activeFocusAreas.map((fa) => (
        <div
          key={fa.id}
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {/* Focus Area Header */}
          <div
            style={{
              padding: "10px 16px",
              color: "var(--color-text-secondary)",
              fontWeight: 700,
              fontSize: "var(--dg-fs-label)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: fa.colorBg, flexShrink: 0 }} />
            {fa.name}
          </div>

          {/* Categories */}
          {activeCategories.map((cat) => {
            if (cat.focusAreaId != null && cat.focusAreaId !== fa.id) return null;

            const codes = getCodesForGroup(fa.id, cat.id);
            if (codes.length === 0) return null;

            const key = `${fa.id}-${cat.id}`;
            const isExpanded = expanded === key;
            const draft = getDraft(fa.id, cat.id);
            const hasValues = draft.rows.some((r) =>
              r.codeRequirements.some((c) => c.minStaff > 0),
            );

            return (
              <div key={cat.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                {/* Category row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {cat.name}
                    {hasValues && (
                      <span
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 700,
                          color: "var(--color-brand)",
                          background: "var(--color-brand-bg)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        configured
                      </span>
                    )}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transition: "transform 150ms ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded editor */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Every day toggle */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>Same every day</span>
                      <button
                        disabled={!canEdit}
                        onClick={() => handleToggleEveryDay(fa.id, cat.id)}
                        style={{
                          width: 34,
                          height: 20,
                          borderRadius: 10,
                          background: draft.everyDay ? "var(--color-brand)" : "var(--color-border)",
                          border: "none",
                          cursor: canEdit ? "pointer" : "default",
                          position: "relative",
                          padding: 0,
                          transition: "background 150ms ease",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "#fff",
                            position: "absolute",
                            top: 2,
                            left: draft.everyDay ? 16 : 2,
                            transition: "left 150ms ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          }}
                        />
                      </button>
                    </div>

                    {/* Per-code vertical list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {codes.map((sc, ci) => (
                        <div key={sc.id}>
                          {/* Shift code badge */}
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 10px",
                              borderRadius: 8,
                              fontSize: "var(--dg-fs-caption)",
                              fontWeight: 700,
                              color: sc.text || "var(--color-text-secondary)",
                              background: sc.color || "#EEEFEC",
                              marginBottom: 6,
                            }}
                          >
                            {isNameMode ? (sc.name || sc.label) : sc.label}
                          </div>
                          {/* Inputs */}
                          {draft.everyDay ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
                              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", width: 60 }}>Min staff</span>
                              <input
                                type="number"
                                min={0}
                                max={999}
                                value={draft.rows[0]?.codeRequirements[ci]?.minStaff ?? 0}
                                onChange={(e) => handleCodeChange(fa.id, cat.id, 0, ci, parseInt(e.target.value) || 0)}
                                disabled={!canEdit}
                                style={inputStyle}
                              />
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 4 }}>
                              {draft.rows.map((row, ri) => (
                                <div key={ri} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", width: 28 }}>
                                    {DAY_NAMES[row.dayOfWeek ?? 0]}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={row.codeRequirements[ci]?.minStaff ?? 0}
                                    onChange={(e) => handleCodeChange(fa.id, cat.id, ri, ci, parseInt(e.target.value) || 0)}
                                    disabled={!canEdit}
                                    style={{ ...inputStyle, width: 42 }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Save button */}
                    {canEdit && (
                      <button
                        onClick={() => handleSave(fa.id, cat.id)}
                        disabled={savingKey === key}
                        style={{
                          alignSelf: "flex-start",
                          padding: "7px 16px",
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 600,
                          borderRadius: 8,
                          border: "none",
                          background: "var(--color-brand)",
                          color: "var(--color-text-inverse)",
                          cursor: savingKey === key ? "not-allowed" : "pointer",
                          opacity: savingKey === key ? 0.7 : 1,
                        }}
                      >
                        {savingKey === key ? "Saving..." : "Save"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
