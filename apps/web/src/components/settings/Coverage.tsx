"use client";

import React, { useMemo, useState } from "react";
import type {
  AssignableShiftOption,
  CoverageRequirement,
  FocusArea,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  ShiftDisplayMode,
} from "@/types";
import { saveCoverageRequirements } from "@/features/settings/client";
import { buildShiftDisplayParts, getQualificationSeniorityRank } from "@/lib/assignable-shifts";
import { getJobPlacementShiftPool, resolveJobColorsForShift, resolveJobTimesForShift } from "@/lib/job-placement";
import { isRegularStaffSystemJob } from "@/lib/system-jobs";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { EmptyState } from "@/components/EmptyState";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CoverageDraft = {
  everyDay: boolean;
  values: number[];
};

type CoverageOptionSection = {
  key: string;
  title: string;
  options: AssignableShiftOption[];
  sortOrder: number;
  isShiftless: boolean;
};

function requirementKey(focusAreaId: number, option: Pick<AssignableShiftOption, "jobId" | "shiftId">): string {
  return `${focusAreaId}:${option.jobId}:${option.shiftId ?? "null"}`;
}

function requirementMatchesOption(
  requirement: CoverageRequirement,
  option: Pick<AssignableShiftOption, "jobId" | "shiftId">,
): boolean {
  return (
    requirement.jobId === option.jobId &&
    (requirement.preferredShiftId ?? null) === (option.shiftId ?? null)
  );
}

function buildDraft(
  requirements: CoverageRequirement[],
  focusAreaId: number,
  option: Pick<AssignableShiftOption, "jobId" | "shiftId">,
): CoverageDraft {
  const matching = requirements.filter(
    (requirement) =>
      requirement.focusAreaId === focusAreaId &&
      requirementMatchesOption(requirement, option),
  );

  if (matching.length === 0) {
    return {
      everyDay: true,
      values: [0],
    };
  }

  const everyDay = matching.find((requirement) => requirement.dayOfWeek == null);
  if (everyDay) {
    return {
      everyDay: true,
      values: [everyDay.minStaff],
    };
  }

  return {
    everyDay: false,
    values: Array.from({ length: 7 }, (_, index) => (
      matching.find((requirement) => requirement.dayOfWeek === index)?.minStaff ?? 0
    )),
  };
}

function serializeDraft(draft: CoverageDraft): string {
  return JSON.stringify({
    everyDay: draft.everyDay,
    values: draft.values,
  });
}

function CoveragePreview({ draft }: { draft: CoverageDraft }) {
  const numberStyle: React.CSSProperties = {
    color: "var(--color-text-primary)",
    fontWeight: 700,
    fontSize: "var(--dg-fs-body-sm)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  };
  const labelStyle: React.CSSProperties = {
    color: "var(--color-text-muted)",
    fontSize: "var(--dg-fs-caption)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontWeight: 600,
  };
  const emptyStyle: React.CSSProperties = {
    color: "var(--color-text-faint)",
    fontStyle: "italic",
    fontSize: "var(--dg-fs-caption)",
  };

  if (draft.everyDay) {
    const value = draft.values[0] ?? 0;
    if (value <= 0) return <span style={emptyStyle}>No requirement</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <span style={labelStyle}>Every day</span>
        <span style={numberStyle}>{value}</span>
      </span>
    );
  }

  const activeDays = draft.values
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value > 0);

  if (activeDays.length === 0) return <span style={emptyStyle}>No requirement</span>;

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline" }}>
      {activeDays.map((entry) => (
        <span key={entry.index} style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={labelStyle}>{DAY_NAMES[entry.index]}</span>
          <span style={numberStyle}>{entry.value}</span>
        </span>
      ))}
    </span>
  );
}

function getCoverageSectionKey(option: AssignableShiftOption): string {
  return option.shiftId != null ? `shift:${option.shiftId}` : "shiftless";
}

function getCoverageSectionTitle(option: AssignableShiftOption): string {
  if (option.shiftId != null) {
    return option.shiftName ?? option.groupLabel;
  }

  return "General jobs";
}

function getCoverageRowTitle(option: AssignableShiftOption): string {
  if (option.isShiftOnly) {
    return option.shiftName ?? option.groupLabel;
  }

  return option.jobName;
}

function isCoverageTargetOption(option: AssignableShiftOption): boolean {
  return !option.isShiftless && (option.showJobOnGrid || option.isShiftOnly);
}

function buildCoverageOptions(args: {
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  orgRoles: NamedItem[];
  certifications: NamedItem[];
  shiftDisplayMode: ShiftDisplayMode;
}): AssignableShiftOption[] {
  const { focusAreas, shiftCategories, jobs, orgRoles, certifications, shiftDisplayMode } = args;
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const activeShifts = shiftCategories.filter((shift) => !shift.archivedAt);
  const activeJobs = jobs.filter((job) => !job.archivedAt && !isRegularStaffSystemJob(job));
  const focusAreaNameById = new Map(activeFocusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
  const options: AssignableShiftOption[] = [];

  for (const job of activeJobs) {
    const assignmentMode = job.assignmentMode ?? "with_shift";

    if (assignmentMode !== "shiftless") {
      for (const shift of getJobPlacementShiftPool(job, activeShifts, activeFocusAreas)) {
        const colors = resolveJobColorsForShift(job, shift);
        const times = resolveJobTimesForShift(job, shift);
        const displayParts = buildShiftDisplayParts({
          shift,
          job,
          shiftDisplayMode,
        });

        options.push({
          id: `assignment:${shift.id}:${job.id}`,
          assignmentId: 0,
          shiftId: shift.id,
          jobId: job.id,
          focusAreaId: shift.focusAreaId ?? null,
          focusAreaName: shift.focusAreaId != null ? (focusAreaNameById.get(shift.focusAreaId) ?? null) : null,
          shiftName: shift.name,
          shiftAbbr: shift.abbr ?? null,
          jobName: job.name,
          jobAbbr: job.abbr,
          showJobOnGrid: displayParts.showJobOnGrid,
          isShiftless: displayParts.isShiftless,
          isShiftOnly: displayParts.isShiftOnly,
          primaryLabel: displayParts.primaryLabel,
          secondaryLabel: displayParts.secondaryLabel,
          groupLabel: shift.name,
          groupSortOrder: shift.sortOrder,
          sortOrder: shift.sortOrder * 1000 + job.sortOrder,
          qualificationRank: getQualificationSeniorityRank({ job, orgRoles, certifications }),
          color: colors.color,
          border: colors.border,
          text: colors.text,
          startTime: times.startTime,
          endTime: times.endTime,
        });
      }
    }

    if (assignmentMode !== "with_shift") {
      const colors = resolveJobColorsForShift(job, null);
      const times = resolveJobTimesForShift(job, null);
      const displayParts = buildShiftDisplayParts({
        shift: null,
        job,
        shiftDisplayMode,
      });

      options.push({
        id: `assignment:shiftless:${job.id}`,
        assignmentId: 0,
        shiftId: null,
        jobId: job.id,
        focusAreaId: null,
        focusAreaName: null,
        shiftName: null,
        shiftAbbr: null,
        jobName: job.name,
        jobAbbr: job.abbr,
        showJobOnGrid: displayParts.showJobOnGrid,
        isShiftless: displayParts.isShiftless,
        isShiftOnly: displayParts.isShiftOnly,
        primaryLabel: displayParts.primaryLabel,
        secondaryLabel: displayParts.secondaryLabel,
        groupLabel: "General",
        groupSortOrder: 1_000_000,
        sortOrder: 1_000_000 + job.sortOrder,
        qualificationRank: getQualificationSeniorityRank({ job, orgRoles, certifications }),
        color: colors.color,
        border: colors.border,
        text: colors.text,
        startTime: times.startTime,
        endTime: times.endTime,
      });
    }
  }

  return options.sort((left, right) => {
    const leftFocusArea = left.focusAreaName ?? "";
    const rightFocusArea = right.focusAreaName ?? "";
    if (leftFocusArea !== rightFocusArea) {
      return leftFocusArea.localeCompare(rightFocusArea);
    }
    if (left.groupSortOrder !== right.groupSortOrder) {
      return left.groupSortOrder - right.groupSortOrder;
    }
    if (left.groupLabel !== right.groupLabel) {
      return left.groupLabel.localeCompare(right.groupLabel);
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.primaryLabel.localeCompare(right.primaryLabel);
  });
}

function compareCoverageOptionsByQualificationSeniority(
  left: AssignableShiftOption,
  right: AssignableShiftOption,
): number {
  const leftRanked = left.qualificationRank != null;
  const rightRanked = right.qualificationRank != null;

  if (leftRanked !== rightRanked) {
    return leftRanked ? -1 : 1;
  }
  if (
    left.qualificationRank != null &&
    right.qualificationRank != null &&
    left.qualificationRank !== right.qualificationRank
  ) {
    return left.qualificationRank - right.qualificationRank;
  }
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.jobName.localeCompare(right.jobName);
}

function CoverageOptionRow({
  orgId,
  focusAreaId,
  option,
  requirements,
  onSaved,
  canEdit,
  isLast,
}: {
  orgId: string;
  focusAreaId: number;
  option: AssignableShiftOption;
  requirements: CoverageRequirement[];
  onSaved: (saved: CoverageRequirement[], option: AssignableShiftOption) => void;
  canEdit: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const panelId = React.useId();
  const initialDraft = useMemo(
    () => buildDraft(requirements, focusAreaId, option),
    [focusAreaId, option, requirements],
  );
  const [draft, setDraft] = useState<CoverageDraft>(initialDraft);

  React.useEffect(() => {
    if (!expanded) {
      setDraft(buildDraft(requirements, focusAreaId, option));
    }
  }, [expanded, focusAreaId, option, requirements]);

  const isDirty = serializeDraft(draft) !== serializeDraft(initialDraft);
  const handleClose = () => {
    if (isDirty) {
      setDraft(initialDraft);
      return;
    }
    setExpanded(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = draft.everyDay
        ? [{ dayOfWeek: null, minStaff: draft.values[0] ?? 0 }]
        : draft.values.map((value, index) => ({ dayOfWeek: index, minStaff: value }));
      const saved = await saveCoverageRequirements(
        orgId,
        focusAreaId,
        option.jobId,
        option.shiftId ?? null,
        rows,
      );
      onSaved(saved, option);
      setExpanded(false);
      toast.success("Coverage requirement saved");
    } catch (error) {
      Sentry.captureException(error);
      toast.error("Failed to save coverage requirement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dg-list-row" style={{ borderBottom: expanded || isLast ? "none" : "1px solid var(--color-border-light)" }}>
      <button
        type="button"
        className="dg-hover-row"
        aria-expanded={expanded}
        aria-controls={panelId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 8px",
          borderRadius: 8,
          cursor: "pointer",
          transition: "background 0.15s",
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
        }}
        onClick={() => setExpanded((previous) => !previous)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
            {getCoverageRowTitle(option)}
          </div>
          <div style={{ marginTop: 4 }}>
            <CoveragePreview draft={initialDraft} />
          </div>
        </div>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-faint)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
          ▾
        </span>
      </button>

      {expanded && (
        <div
          id={panelId}
          style={{
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--color-border-light)",
            margin: "0 0 8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              <input
                type="checkbox"
                checked={draft.everyDay}
                onChange={(event) => {
                  if (event.target.checked) {
                    setDraft((previous) => ({
                      everyDay: true,
                      values: [previous.everyDay ? previous.values[0] ?? 0 : previous.values[1] ?? previous.values[0] ?? 0],
                    }));
                    return;
                  }
                  setDraft((previous) => ({
                    everyDay: false,
                    values: Array.from({ length: 7 }, () => previous.values[0] ?? 0),
                  }));
                }}
                disabled={!canEdit}
              />
              Same every day
            </label>
          </div>

          {draft.everyDay ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Minimum Staff
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={draft.values[0] ?? 0}
                onChange={(event) => setDraft({ everyDay: true, values: [Math.max(0, Math.min(999, Number(event.target.value) || 0))] })}
                style={{ width: 72, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--color-border)", textAlign: "center" }}
                disabled={!canEdit}
              />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
              {DAY_NAMES.map((day, index) => (
                <label key={`${option.id}-${day}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {day}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={draft.values[index] ?? 0}
                    onChange={(event) => {
                      const nextValues = [...draft.values];
                      nextValues[index] = Math.max(0, Math.min(999, Number(event.target.value) || 0));
                      setDraft({ everyDay: false, values: nextValues });
                    }}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid var(--color-border)", textAlign: "center" }}
                    disabled={!canEdit}
                  />
                </label>
              ))}
            </div>
          )}

          <EditorActionRow
            secondaryAction={(
              <button onClick={handleClose} className="dg-btn dg-btn-secondary dg-btn-sm">
                {getEditorDismissLabel({ hasUnsavedChanges: isDirty })}
              </button>
            )}
            primaryAction={(
              <button onClick={handleSave} disabled={saving || !canEdit || !isDirty} className="dg-btn dg-btn-primary dg-btn-sm">
                {getEditorSaveLabel(saving)}
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}

export default function CoverageRequirementsSettings({
  orgId,
  focusAreas,
  shiftCategories,
  jobs,
  orgRoles = [],
  certifications = [],
  coverageRequirements,
  onCoverageRequirementsChange,
  canEdit,
  shiftDisplayMode = "code",
}: {
  orgId: string;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  orgRoles?: NamedItem[];
  certifications?: NamedItem[];
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canEdit: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const assignableOptions = useMemo(
    () => buildCoverageOptions({
      shiftCategories,
      jobs,
      focusAreas,
      orgRoles,
      certifications,
      shiftDisplayMode,
    }),
    [certifications, focusAreas, jobs, orgRoles, shiftCategories, shiftDisplayMode],
  );
  const coverageOptions = useMemo(
    () => assignableOptions.filter(isCoverageTargetOption),
    [assignableOptions],
  );

  const optionsByFocusArea = useMemo(() => {
    return new Map(
      activeFocusAreas.map((focusArea) => {
        const localOptions = coverageOptions.filter(
          (option) => option.focusAreaId === focusArea.id,
        );
        return [focusArea.id, localOptions];
      }),
    );
  }, [activeFocusAreas, coverageOptions]);

  if (activeFocusAreas.length === 0 || coverageOptions.length === 0) {
    return (
      <EmptyState
        size="compact"
        title={activeFocusAreas.length === 0 ? "No focus areas yet" : "No coverage targets yet"}
        description={activeFocusAreas.length === 0
          ? "Create focus areas first to configure coverage."
          : "Create shifts or scheduled jobs first so coverage can target the staffing demand you want to track."}
      />
    );
  }

  const sectionsByFocusArea = useMemo(() => {
    return new Map(
      activeFocusAreas.map((focusArea) => {
        const localOptions = coverageOptions.filter(
          (option) => option.focusAreaId === focusArea.id,
        );
        const sections = localOptions.reduce<Map<string, CoverageOptionSection>>((accumulator, option) => {
          const key = getCoverageSectionKey(option);
          const existing = accumulator.get(key);
          if (existing) {
            existing.options.push(option);
            return accumulator;
          }

          accumulator.set(key, {
            key,
            title: getCoverageSectionTitle(option),
            options: [option],
            sortOrder: option.groupSortOrder,
            isShiftless: option.isShiftless,
          });
          return accumulator;
        }, new Map());

        return [
          focusArea.id,
          Array.from(sections.values())
            .map((section) => ({
              ...section,
              options: [...section.options].sort(compareCoverageOptionsByQualificationSeniority),
            }))
            .sort((left, right) => {
              if (left.sortOrder !== right.sortOrder) {
                return left.sortOrder - right.sortOrder;
              }
              return left.title.localeCompare(right.title);
            }),
        ];
      }),
    );
  }, [activeFocusAreas, coverageOptions]);

  const handleSaved = (saved: CoverageRequirement[], option: AssignableShiftOption, focusAreaId: number) => {
    const updated = coverageRequirements.filter(
      (requirement) =>
        !(
          requirement.focusAreaId === focusAreaId &&
          requirementMatchesOption(requirement, option)
        ),
    );
    onCoverageRequirementsChange([...updated, ...saved]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {activeFocusAreas.map((focusArea) => {
        const localOptions = optionsByFocusArea.get(focusArea.id) ?? [];
        const sections = sectionsByFocusArea.get(focusArea.id) ?? [];

        return (
          <div key={focusArea.id} style={{ background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)" }}>
              {focusArea.name}
            </div>

            {localOptions.length === 0 ? (
              <EmptyState
                size="compact"
                title="No coverage targets yet"
                description="Create shifts or scheduled jobs that apply to this focus area before adding coverage."
                style={{ margin: "12px 16px" }}
              />
            ) : (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {sections.map((section) => (
                  <div key={`${focusArea.id}-${section.key}`} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--dg-radius-lg)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-light)" }}>
                      <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {section.title}
                      </div>
                    </div>
                    <div style={{ padding: "0 12px" }}>
                      {section.options.map((option, optionIndex) => (
                        <CoverageOptionRow
                          key={`${focusArea.id}-${requirementKey(focusArea.id, option)}`}
                          orgId={orgId}
                          focusAreaId={focusArea.id}
                          option={option}
                          requirements={coverageRequirements}
                          onSaved={(saved, savedOption) => handleSaved(saved, savedOption, focusArea.id)}
                          canEdit={canEdit}
                          isLast={optionIndex === section.options.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
