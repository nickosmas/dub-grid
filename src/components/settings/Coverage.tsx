"use client";

import React, { useState, useCallback } from "react";
import { CoverageRequirement, CoverageRuleConfig, FocusArea, ShiftCategory, ShiftCode, ShiftDisplayMode } from "@/types";
import { saveCoverageRequirements, saveCoverageRuleConfig } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { ExplainerSection, PreviewFrame } from "@/components/ui/explainer-section";
import { EmptyState } from "@/components/EmptyState";

// ── Coverage Requirements Settings ────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CoverageRequirementsSettings({
  orgId,
  focusAreas,
  shiftCategories,
  shiftCodes,
  coverageRequirements,
  onCoverageRequirementsChange,
  coverageRuleConfigs = [],
  onCoverageRuleConfigsChange = () => {},
  canEdit,
  shiftDisplayMode = "code",
}: {
  orgId: string;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  shiftCodes: ShiftCode[];
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  coverageRuleConfigs?: CoverageRuleConfig[];
  onCoverageRuleConfigsChange?: (configs: CoverageRuleConfig[]) => void;
  canEdit: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const isNameMode = shiftDisplayMode === "name";
  // Which section is currently being edited — "focusAreaId-categoryId"
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Draft edits keyed by "focusAreaId-categoryId"
  type CodeReq = { shiftCodeId: number; minStaff: number };
  type DraftRow = { dayOfWeek: number | null; codeRequirements: CodeReq[] };
  type DraftRuleConfig = {
    eligibleShiftCodeIds: number[];
    preferredOpenShiftCodeId: number;
  };
  type DraftEntry = {
    everyDay: boolean;
    rows: DraftRow[];
    ruleConfigs: Record<number, DraftRuleConfig>;
  };
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

  // Build a draft entry from existing coverage requirements (or empty)
  const buildDraftFromRequirements = useCallback(
    (focusAreaId: number, categoryId: number): DraftEntry => {
      const codes = getCodesForGroup(focusAreaId, categoryId);
      const buildRuleConfigs = (): Record<number, DraftRuleConfig> =>
        Object.fromEntries(
          codes.map((sc) => {
            const existingConfig = coverageRuleConfigs.find(
              (config) =>
                config.focusAreaId === focusAreaId &&
                config.requirementShiftCodeId === sc.id,
            );

            return [
              sc.id,
              {
                eligibleShiftCodeIds: existingConfig?.eligibleShiftCodeIds?.length
                  ? [...existingConfig.eligibleShiftCodeIds].sort((left, right) => left - right)
                  : [sc.id],
                preferredOpenShiftCodeId: existingConfig?.preferredOpenShiftCodeId ?? sc.id,
              },
            ];
          }),
        );
      const makeEmptyCodeReqs = (): CodeReq[] =>
        codes.map((sc) => ({ shiftCodeId: sc.id, minStaff: 0 }));

      const codeIds = new Set(codes.map((sc) => sc.id));
      const existing = coverageRequirements.filter(
        (r) => r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId),
      );

      if (existing.length === 0) {
        return {
          everyDay: true,
          rows: [{ dayOfWeek: null, codeRequirements: makeEmptyCodeReqs() }],
          ruleConfigs: buildRuleConfigs(),
        };
      }

      const hasEveryDay = existing.some((r) => r.dayOfWeek === null);
      if (hasEveryDay) {
        const codeReqs = codes.map((sc) => {
          const match = existing.find((r) => r.shiftCodeId === sc.id && r.dayOfWeek === null);
          return { shiftCodeId: sc.id, minStaff: match?.minStaff ?? 0 };
        });
        return {
          everyDay: true,
          rows: [{ dayOfWeek: null, codeRequirements: codeReqs }],
          ruleConfigs: buildRuleConfigs(),
        };
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
      return { everyDay: false, rows, ruleConfigs: buildRuleConfigs() };
    },
    [coverageRequirements, coverageRuleConfigs, getCodesForGroup],
  );

  // Get the current draft for a section (only exists while editing)
  const getDraft = useCallback(
    (focusAreaId: number, categoryId: number): DraftEntry | undefined => {
      return drafts[`${focusAreaId}-${categoryId}`];
    },
    [drafts],
  );

  // Get the read-only view data (always derived from saved requirements)
  const getDisplayData = useCallback(
    (focusAreaId: number, categoryId: number): DraftEntry => {
      return buildDraftFromRequirements(focusAreaId, categoryId);
    },
    [buildDraftFromRequirements],
  );

  const setDraft = useCallback((focusAreaId: number, categoryId: number, entry: DraftEntry) => {
    setDrafts((prev) => ({ ...prev, [`${focusAreaId}-${categoryId}`]: entry }));
  }, []);

  const handleEdit = useCallback(
    (focusAreaId: number, categoryId: number) => {
      const key = `${focusAreaId}-${categoryId}`;
      const entry = buildDraftFromRequirements(focusAreaId, categoryId);
      setDrafts((prev) => ({ ...prev, [key]: entry }));
      setEditingKey(key);
    },
    [buildDraftFromRequirements],
  );

  const handleClose = useCallback(
    (focusAreaId: number, categoryId: number) => {
      const key = `${focusAreaId}-${categoryId}`;
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setEditingKey(null);
    },
    [],
  );

  const handleDiscard = useCallback(
    (focusAreaId: number, categoryId: number) => {
      setDraft(focusAreaId, categoryId, buildDraftFromRequirements(focusAreaId, categoryId));
    },
    [buildDraftFromRequirements, setDraft],
  );

  const handleToggleEveryDay = useCallback(
    (focusAreaId: number, categoryId: number) => {
      const current = getDraft(focusAreaId, categoryId);
      if (!current) return;
      if (current.everyDay) {
        const val = current.rows[0]?.codeRequirements ?? [];
        const rows: DraftRow[] = [];
        for (let d = 0; d < 7; d++) {
          rows.push({ dayOfWeek: d, codeRequirements: val.map((c) => ({ ...c })) });
        }
        setDraft(focusAreaId, categoryId, { ...current, everyDay: false, rows });
      } else {
        const allValues = current.rows.map((r) => JSON.stringify(r.codeRequirements.map((c) => c.minStaff)));
        const hasDifferentDays = new Set(allValues).size > 1;
        if (hasDifferentDays && !window.confirm("Per-day values differ. Switching to 'Same every day' will keep only Monday's values. Continue?")) {
          return;
        }
        const mon = current.rows.find((r) => r.dayOfWeek === 1) ?? current.rows[0];
        const codeReqs = mon?.codeRequirements.map((c) => ({ ...c })) ?? [];
        setDraft(focusAreaId, categoryId, {
          ...current,
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
      if (!current) return;
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
      if (!draft) return;
      const codes = getCodesForGroup(focusAreaId, categoryId);
      const codeIds = new Set(codes.map((sc) => sc.id));
      const key = `${focusAreaId}-${categoryId}`;
      setSavingKey(key);
      try {
        const allSaved: CoverageRequirement[] = [];
        const savedRuleConfigs: CoverageRuleConfig[] = [];
        for (const code of codes) {
          const rows = draft.rows.map((r) => {
            const cr = r.codeRequirements.find((c) => c.shiftCodeId === code.id);
            return { dayOfWeek: r.dayOfWeek, minStaff: cr?.minStaff ?? 0 };
          });
          const saved = await saveCoverageRequirements(orgId, focusAreaId, code.id, rows);
          allSaved.push(...saved);

          const ruleConfig = draft.ruleConfigs[code.id] ?? {
            eligibleShiftCodeIds: [code.id],
            preferredOpenShiftCodeId: code.id,
          };
          const savedRuleConfig = await saveCoverageRuleConfig(orgId, focusAreaId, code.id, {
            eligibleShiftCodeIds: ruleConfig.eligibleShiftCodeIds,
            preferredOpenShiftCodeId: ruleConfig.preferredOpenShiftCodeId,
          });
          if (savedRuleConfig) savedRuleConfigs.push(savedRuleConfig);
        }
        const remaining = coverageRequirements.filter(
          (r) => !(r.focusAreaId === focusAreaId && codeIds.has(r.shiftCodeId)),
        );
        const remainingRuleConfigs = coverageRuleConfigs.filter(
          (config) =>
            !(config.focusAreaId === focusAreaId && codeIds.has(config.requirementShiftCodeId)),
        );
        onCoverageRequirementsChange([...remaining, ...allSaved]);
        onCoverageRuleConfigsChange([...remainingRuleConfigs, ...savedRuleConfigs]);
        // Clear draft and exit editing
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setEditingKey(null);
        toast.success("Coverage requirements saved");
      } catch (e) {
        Sentry.captureException(e);
        toast.error("Failed to save coverage requirements");
      } finally {
        setSavingKey(null);
      }
    },
    [
      getDraft,
      getCodesForGroup,
      orgId,
      coverageRequirements,
      coverageRuleConfigs,
      onCoverageRequirementsChange,
      onCoverageRuleConfigsChange,
    ],
  );

  const activeCategories = shiftCategories.filter((c) => !c.archivedAt);
  const activeFocusAreas = focusAreas.filter((fa) => !fa.archivedAt);

  if (activeFocusAreas.length === 0 || activeCategories.length === 0) {
    return (
      <EmptyState
        compact
        title={activeFocusAreas.length === 0
          ? "No focus areas yet"
          : "No shift categories yet"}
        description={activeFocusAreas.length === 0
          ? "Create focus areas first to configure coverage requirements."
          : "Create shift categories first to configure coverage requirements."}
      />
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

  const codeLabel = (sc: ShiftCode) => isNameMode ? (sc.name || sc.label) : sc.label;
  const sortCodes = (left: ShiftCode, right: ShiftCode) =>
    left.sortOrder - right.sortOrder || left.id - right.id;
  const activeShiftCodes = shiftCodes.filter((code) => !code.archivedAt).sort(sortCodes);
  const previewCategory = activeCategories.find((category) =>
    activeShiftCodes.some((code) => code.categoryId === category.id),
  );
  const previewCodes = previewCategory
    ? activeShiftCodes.filter((code) => code.categoryId === previewCategory.id).slice(0, 3)
    : activeShiftCodes.slice(0, 3);
  const fallbackLabels = isNameMode
    ? ["Day Shift", "Day Supervisor", "Day Mentoring"]
    : ["D", "Ds", "(D)"];
  const exampleLabels = fallbackLabels.map((fallbackLabel, index) =>
    previewCodes[index] ? codeLabel(previewCodes[index]) : fallbackLabel,
  );
  const previewCategoryLabel = previewCategory?.name ?? "Day";
  const shortageExample = `${exampleLabels[0]} short 1, ${exampleLabels[1]} short 1`;
  const infoPoints = [
    {
      title: "Enter the minimum by shift line",
      description: `Set the required count for each shift line in the category, such as ${exampleLabels[0]}, ${exampleLabels[1]}, and ${exampleLabels[2]}. These values describe the staffing mix you want on the schedule.`,
    },
    {
      title: "Coverage is judged by the category total",
      description: `For each focus area, date, and ${previewCategoryLabel} category, DubGrid adds those shift-line minimums together and compares that total to the number of unique staff scheduled anywhere in the category.`,
    },
    {
      title: "Green means the category total is covered",
      description: `If the scheduled total is equal to or greater than the category total required, coverage stays green even if one shift line is lighter than planned. A person is counted once toward the category total.`,
    },
    {
      title: "Red shows what mix is still missing",
      description: `If the scheduled total is below the category total required, coverage turns red and the shortage detail explains which lines are still short, for example ${shortageExample}.`,
    },
  ];

  const renderCoveragePreview = (
    title: string,
    tone: "green" | "red",
    actualTotal: number,
    requiredTotal: number,
    rowCounts: number[],
    detail: string,
  ) => {
    const palette = tone === "green"
      ? {
          bg: "rgba(16, 185, 129, 0.08)",
          border: "var(--color-success-border)",
          text: "var(--color-success-text)",
          badge: "Covered",
        }
      : {
          bg: "rgba(220, 38, 38, 0.06)",
          border: "var(--color-danger-border)",
          text: "var(--color-danger-dark)",
          badge: "Short",
        };

    return (
      <PreviewFrame
        key={title}
        title={title}
        subtitle={`${previewCategoryLabel} category`}
        badge={(
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              background: palette.bg,
              color: palette.text,
              border: `1px solid ${palette.border}`,
              whiteSpace: "nowrap",
            }}
          >
            {palette.badge}
          </span>
        )}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--dg-radius-sm)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {exampleLabels.map((label) => (
              <div key={`${title}-${label}`} style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right" }}>
            {rowCounts.map((count, index) => (
              <div key={`${title}-count-${exampleLabels[index] ?? index}`} style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {count}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-sm)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-light)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Required Total
            </div>
            <div style={{ marginTop: 3, fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
              {requiredTotal}
            </div>
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-sm)",
              background: palette.bg,
              border: `1px solid ${palette.border}`,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Scheduled
            </div>
            <div style={{ marginTop: 3, fontSize: "var(--dg-fs-label)", fontWeight: 700, color: palette.text }}>
              {actualTotal}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--dg-radius-sm)",
            background: tone === "green" ? "var(--color-bg)" : "rgba(255,255,255,0.6)",
            border: `1px dashed ${palette.border}`,
            fontSize: 11,
            lineHeight: 1.45,
            color: tone === "green" ? "var(--color-text-muted)" : palette.text,
          }}
        >
          {detail}
        </div>
      </PreviewFrame>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ExplainerSection
        title="Coverage logic"
        points={infoPoints}
        defaultOpen
        storageKey="dg-explainer-coverage-settings"
        preview={(
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {renderCoveragePreview(
              "Green example",
              "green",
              5,
              4,
              [2, 1, 2],
              `Category total met. Even if one line is lighter than planned, the ${previewCategoryLabel} category stays green because 5 scheduled is at least 4 required.`,
            )}
            {renderCoveragePreview(
              "Red example",
              "red",
              3,
              4,
              [2, 0, 1],
              `Category total is short, so coverage turns red and the shortage detail calls out the missing mix: ${shortageExample}.`,
            )}
          </div>
        )}
      />
      {activeFocusAreas.map((fa) => (
        <div
          key={fa.id}
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--dg-radius-md)",
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
            }}
          >
            {fa.name}
          </div>

          {/* Categories — always visible */}
          {activeCategories.map((cat) => {
            if (cat.focusAreaId != null && cat.focusAreaId !== fa.id) return null;

            const codes = getCodesForGroup(fa.id, cat.id);
            if (codes.length === 0) return null;

            const key = `${fa.id}-${cat.id}`;
            const isEditing = editingKey === key;
            const isSaving = savingKey === key;
            const draft = getDraft(fa.id, cat.id);
            const display = getDisplayData(fa.id, cat.id);
            const data = isEditing && draft ? draft : display;
            const hasValues = display.rows.some((r) =>
              r.codeRequirements.some((c) => c.minStaff > 0),
            );
            // Compare draft to saved state to determine if changes were made
            const hasChanges = isEditing && draft != null && (
              draft.everyDay !== display.everyDay ||
              JSON.stringify(draft.rows.map((r) => r.codeRequirements.map((c) => c.minStaff)))
                !== JSON.stringify(display.rows.map((r) => r.codeRequirements.map((c) => c.minStaff)))
            );

            return (
              <div key={cat.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                {/* Category header with Edit button */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                  }}
                >
                  <span style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {cat.name}
                    {!hasValues && !isEditing && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "1px 7px",
                        borderRadius: 20,
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 500,
                        background: "var(--color-border-light)",
                        color: "var(--color-text-muted)",
                        letterSpacing: "0.01em",
                      }}>
                        not configured
                      </span>
                    )}
                    {isEditing && (
                      <span style={{
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 600,
                        color: "var(--color-brand)",
                      }}>
                        editing
                      </span>
                    )}
                  </span>

                  {/* Action buttons */}
                  {canEdit && !isEditing && (
                    <button
                      onClick={() => handleEdit(fa.id, cat.id)}
                      disabled={editingKey !== null}
                      className="dg-btn dg-btn-secondary dg-btn-sm"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {/* Content — always visible */}
                <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Every day toggle — only in edit mode, compact inline */}
                  {isEditing && draft && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => handleToggleEveryDay(fa.id, cat.id)}
                        style={{
                          width: 34,
                          height: 20,
                          borderRadius: 10,
                          background: draft.everyDay ? "var(--color-brand)" : "var(--color-border)",
                          border: "none",
                          cursor: "pointer",
                          position: "relative",
                          padding: 0,
                          flexShrink: 0,
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
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>Same every day</span>
                    </div>
                  )}

                  {data.everyDay ? (
                    /* ── Every-day: one row per code ── */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {codes.map((sc, ci) => {
                        const val = data.rows[0]?.codeRequirements[ci]?.minStaff ?? 0;
                        return (
                          <div
                            key={sc.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 10px",
                              borderRadius: "var(--dg-radius-md)",
                              background: "var(--color-bg)",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 8px",
                                borderRadius: 6,
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 700,
                                color: sc.text || "var(--color-text-secondary)",
                                background: sc.color || "#EEEFEC",
                              }}
                            >
                              {codeLabel(sc)}
                            </span>
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                max={999}
                                value={val}
                                onChange={(e) => handleCodeChange(fa.id, cat.id, 0, ci, parseInt(e.target.value) || 0)}
                                style={inputStyle}
                              />
                            ) : (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 32,
                                padding: "2px 10px",
                                borderRadius: 6,
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 700,
                                background: val > 0 ? "var(--color-brand-bg)" : "var(--color-border-light)",
                                color: val > 0 ? "var(--color-brand)" : "var(--color-text-muted)",
                              }}>
                                {val}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Per-day: data grid with day columns ── */
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `auto repeat(7, 1fr)`,
                      gap: 0,
                      borderRadius: "var(--dg-radius-md)",
                      overflow: "hidden",
                      border: "1px solid var(--color-border-light)",
                    }}>
                      {/* Header row: empty corner + day names */}
                      <div style={{
                        padding: "5px 10px",
                        background: "var(--color-bg)",
                        borderBottom: "1px solid var(--color-border-light)",
                      }} />
                      {DAY_NAMES.map((day) => (
                        <div
                          key={day}
                          style={{
                            padding: "5px 0",
                            textAlign: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--color-text-muted)",
                            background: "var(--color-bg)",
                            borderBottom: "1px solid var(--color-border-light)",
                            borderLeft: "1px solid var(--color-border-light)",
                          }}
                        >
                          {day}
                        </div>
                      ))}

                      {/* Data rows: code badge + 7 day cells */}
                      {codes.map((sc, ci) => (
                        <React.Fragment key={sc.id}>
                          <div style={{
                            padding: "6px 10px",
                            display: "flex",
                            alignItems: "center",
                            background: "var(--color-bg)",
                            borderBottom: ci < codes.length - 1 ? "1px solid var(--color-border-light)" : "none",
                          }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: "var(--dg-fs-footnote)",
                              fontWeight: 700,
                              color: sc.text || "var(--color-text-secondary)",
                              background: sc.color || "#EEEFEC",
                              whiteSpace: "nowrap",
                            }}>
                              {codeLabel(sc)}
                            </span>
                          </div>
                          {data.rows.map((row, ri) => {
                            const val = row.codeRequirements[ci]?.minStaff ?? 0;
                            return (
                              <div
                                key={ri}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "4px 2px",
                                  borderLeft: "1px solid var(--color-border-light)",
                                  borderBottom: ci < codes.length - 1 ? "1px solid var(--color-border-light)" : "none",
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={val}
                                    onChange={(e) => handleCodeChange(fa.id, cat.id, ri, ci, parseInt(e.target.value) || 0)}
                                    style={{ ...inputStyle, width: "100%", maxWidth: 40 }}
                                  />
                                ) : (
                                  <span style={{
                                    fontSize: "var(--dg-fs-caption)",
                                    fontWeight: 600,
                                    color: val > 0 ? "var(--color-text-secondary)" : "var(--color-text-muted)",
                                  }}>
                                    {val}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  {/* Mode label — read-only indicator */}
                  {!isEditing && (
                    <span style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-text-muted)",
                      fontStyle: "italic",
                    }}>
                      {data.everyDay ? "Same every day" : "Per-day schedule"}
                    </span>
                  )}
                  {isEditing && (
                    <EditorActionRow
                      gap={6}
                      secondaryAction={(
                        <button
                          onClick={() => hasChanges ? handleDiscard(fa.id, cat.id) : handleClose(fa.id, cat.id)}
                          disabled={isSaving}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          {getEditorDismissLabel(hasChanges)}
                        </button>
                      )}
                      primaryAction={(
                        <button
                          onClick={() => handleSave(fa.id, cat.id)}
                          disabled={isSaving || !hasChanges}
                          className="dg-btn dg-btn-primary dg-btn-sm"
                        >
                          {getEditorSaveLabel(isSaving)}
                        </button>
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
