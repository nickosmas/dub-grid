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
import { Button } from "@/components/Button";
import { buildShiftDisplayParts, getQualificationSeniorityRank } from "@/lib/assignable-shifts";
import {
  getJobPlacementShiftPool,
  resolveJobColorsForShift,
  resolveJobTimesForShift,
} from "@/lib/job-placement";
import { isDefaultShiftSystemJob, isRegularStaffSystemJob } from "@/lib/system-jobs";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { EmptyState } from "@/components/EmptyState";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";

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

function requirementKey(
  focusAreaId: number,
  option: Pick<AssignableShiftOption, "jobId" | "shiftId">,
): string {
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
      requirement.focusAreaId === focusAreaId && requirementMatchesOption(requirement, option),
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
    values: Array.from(
      { length: 7 },
      (_, index) => matching.find((requirement) => requirement.dayOfWeek === index)?.minStaff ?? 0,
    ),
  };
}

function serializeDraft(draft: CoverageDraft): string {
  return JSON.stringify({
    everyDay: draft.everyDay,
    values: draft.values,
  });
}

function serializeDrafts(drafts: Record<string, CoverageDraft>): string {
  return Object.keys(drafts)
    .sort()
    .map((key) => `${key}=${serializeDraft(drafts[key])}`)
    .join("|");
}

function CoveragePreview({ draft }: { draft: CoverageDraft }) {
  const numberStyle: React.CSSProperties = {
    color: "var(--dg-color-text-primary)",
    fontWeight: 700,
    fontSize: "var(--dg-fs-body-sm)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  };
  const labelStyle: React.CSSProperties = {
    color: "var(--dg-color-text-muted)",
    fontSize: "var(--dg-fs-caption)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontWeight: 600,
  };
  const emptyStyle: React.CSSProperties = {
    color: "var(--dg-color-text-faint)",
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
    <span
      style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline" }}
    >
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
  defaultShiftEnabled?: boolean;
}): AssignableShiftOption[] {
  const {
    focusAreas,
    shiftCategories,
    jobs,
    orgRoles,
    certifications,
    shiftDisplayMode,
    defaultShiftEnabled = true,
  } = args;
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const activeShifts = shiftCategories.filter((shift) => !shift.archivedAt);
  const activeJobs = jobs.filter(
    (job) =>
      !job.archivedAt &&
      !isRegularStaffSystemJob(job) &&
      !(defaultShiftEnabled === false && isDefaultShiftSystemJob(job)),
  );
  const focusAreaNameById = new Map(
    activeFocusAreas.map((focusArea) => [focusArea.id, focusArea.name]),
  );
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
          focusAreaName:
            shift.focusAreaId != null ? (focusAreaNameById.get(shift.focusAreaId) ?? null) : null,
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
  option,
  draft,
  onDraftChange,
  canEdit,
  isLast,
}: {
  option: AssignableShiftOption;
  draft: CoverageDraft;
  onDraftChange: (draft: CoverageDraft) => void;
  canEdit: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = React.useId();

  return (
    <div
      className="dg-list-row"
      style={{
        borderBottom: expanded || isLast ? "none" : "1px solid var(--dg-color-border-light)",
      }}
    >
      <Button
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
          <div
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {getCoverageRowTitle(option)}
          </div>
          <div style={{ marginTop: 4 }}>
            <CoveragePreview draft={draft} />
          </div>
        </div>
        <span
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </Button>

      {expanded && (
        <div
          id={panelId}
          style={{
            background: "var(--dg-color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--dg-color-border-light)",
            margin: "0 0 8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--dg-fs-label)",
                color: "var(--dg-color-text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={draft.everyDay}
                onChange={(event) => {
                  if (event.target.checked) {
                    onDraftChange({
                      everyDay: true,
                      values: [
                        draft.everyDay
                          ? (draft.values[0] ?? 0)
                          : (draft.values[1] ?? draft.values[0] ?? 0),
                      ],
                    });
                    return;
                  }
                  onDraftChange({
                    everyDay: false,
                    values: Array.from({ length: 7 }, () => draft.values[0] ?? 0),
                  });
                }}
                disabled={!canEdit}
              />
              Same every day
            </label>
          </div>

          {draft.everyDay ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Minimum Staff
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={draft.values[0] ?? 0}
                onChange={(event) =>
                  onDraftChange({
                    everyDay: true,
                    values: [Math.max(0, Math.min(999, Number(event.target.value) || 0))],
                  })
                }
                style={{
                  width: 72,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--dg-color-border)",
                  textAlign: "center",
                }}
                disabled={!canEdit}
              />
            </div>
          ) : (
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}
            >
              {DAY_NAMES.map((day, index) => (
                <label
                  key={`${option.id}-${day}`}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <span
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 700,
                      color: "var(--dg-color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {day}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={draft.values[index] ?? 0}
                    onChange={(event) => {
                      const nextValues = [...draft.values];
                      nextValues[index] = Math.max(
                        0,
                        Math.min(999, Number(event.target.value) || 0),
                      );
                      onDraftChange({ everyDay: false, values: nextValues });
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--dg-color-border)",
                      textAlign: "center",
                    }}
                    disabled={!canEdit}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusAreaCoverageCard({
  orgId,
  focusArea,
  sections,
  requirements,
  canEdit,
  onBatchSaved,
}: {
  orgId: string;
  focusArea: FocusArea;
  sections: CoverageOptionSection[];
  requirements: CoverageRequirement[];
  canEdit: boolean;
  onBatchSaved: (
    focusAreaId: number,
    results: Array<{ option: AssignableShiftOption; saved: CoverageRequirement[] }>,
  ) => void;
}) {
  const [saving, setSaving] = useState(false);

  const initialDrafts = useMemo(() => {
    const map: Record<string, CoverageDraft> = {};
    for (const section of sections) {
      for (const option of section.options) {
        map[requirementKey(focusArea.id, option)] = buildDraft(requirements, focusArea.id, option);
      }
    }
    return map;
  }, [sections, requirements, focusArea.id]);
  const initialKey = useMemo(() => serializeDrafts(initialDrafts), [initialDrafts]);

  const [drafts, setDrafts] = useState<Record<string, CoverageDraft>>(initialDrafts);
  const [baselineKey, setBaselineKey] = useState(initialKey);

  // Sync drafts to the saved baseline when it changes (after a save, or an
  // external update). Render-time adjustment per React guidance, not an effect.
  if (initialKey !== baselineKey) {
    setDrafts(initialDrafts);
    setBaselineKey(initialKey);
  }

  const isDirty = serializeDrafts(drafts) !== initialKey;

  // The sidebar is one click away and this panel is a route away from being
  // unmounted, so navigating is the way these edits get lost.
  useNavigationGuard(`coverage:${focusArea.id}`, { isDirty: () => isDirty });

  const draftFor = (option: AssignableShiftOption): CoverageDraft =>
    drafts[requirementKey(focusArea.id, option)] ??
    initialDrafts[requirementKey(focusArea.id, option)];

  const handleDiscard = () => setDrafts(initialDrafts);

  const handleSave = async () => {
    setSaving(true);
    try {
      const allOptions = sections.flatMap((section) => section.options);
      const dirtyOptions = allOptions.filter((option) => {
        const key = requirementKey(focusArea.id, option);
        return serializeDraft(draftFor(option)) !== serializeDraft(initialDrafts[key]);
      });

      const results = await Promise.all(
        dirtyOptions.map(async (option) => {
          const draft = draftFor(option);
          const rows = draft.everyDay
            ? [{ dayOfWeek: null, minStaff: draft.values[0] ?? 0 }]
            : draft.values.map((value, index) => ({ dayOfWeek: index, minStaff: value }));
          const saved = await saveCoverageRequirements(
            orgId,
            focusArea.id,
            option.jobId,
            option.shiftId ?? null,
            rows,
          );
          return { option, saved };
        }),
      );

      onBatchSaved(focusArea.id, results);
      toast.success(
        results.length > 1 ? "Coverage requirements saved" : "Coverage requirement saved",
      );
    } catch (error) {
      Sentry.captureException(error);
      toast.error("We couldn't save the coverage requirements. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--dg-color-surface)",
        borderRadius: "var(--dg-radius-md)",
        border: "1px solid var(--dg-color-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--dg-color-border-light)",
          fontWeight: 700,
          fontSize: "var(--dg-fs-label)",
          color: "var(--dg-color-text-secondary)",
        }}
      >
        {focusArea.name}
      </div>

      {sections.length === 0 ? (
        <EmptyState
          size="compact"
          title="No coverage targets yet"
          description="Create shifts or scheduled jobs that apply to this focus area before adding coverage."
          style={{ margin: "12px 16px" }}
        />
      ) : (
        <>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {sections.map((section) => (
              <div
                key={`${focusArea.id}-${section.key}`}
                style={{
                  border: "1px solid var(--dg-color-border-light)",
                  borderRadius: "var(--dg-radius-lg)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--dg-color-border-light)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 700,
                      color: "var(--dg-color-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {section.title}
                  </div>
                </div>
                <div style={{ padding: "0 12px" }}>
                  {section.options.map((option, optionIndex) => (
                    <CoverageOptionRow
                      key={`${focusArea.id}-${requirementKey(focusArea.id, option)}`}
                      option={option}
                      draft={draftFor(option)}
                      onDraftChange={(next) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [requirementKey(focusArea.id, option)]: next,
                        }))
                      }
                      canEdit={canEdit}
                      isLast={optionIndex === section.options.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{ padding: "12px 16px", borderTop: "1px solid var(--dg-color-border-light)" }}
          >
            <EditorActionRow
              secondaryAction={
                isDirty ? (
                  <Button
                    onClick={handleDiscard}
                    disabled={saving}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                  >
                    {EDITOR_ACTION_LABELS.discard}
                  </Button>
                ) : null
              }
              primaryAction={
                <Button
                  onClick={handleSave}
                  disabled={saving || !canEdit || !isDirty}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
                </Button>
              }
            />
          </div>
        </>
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
  defaultShiftEnabled = true,
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
  defaultShiftEnabled?: boolean;
}) {
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const assignableOptions = useMemo(
    () =>
      buildCoverageOptions({
        shiftCategories,
        jobs,
        focusAreas,
        orgRoles,
        certifications,
        shiftDisplayMode: "name",
        defaultShiftEnabled,
      }),
    [certifications, focusAreas, jobs, orgRoles, shiftCategories, defaultShiftEnabled],
  );
  const coverageOptions = useMemo(
    () => assignableOptions.filter(isCoverageTargetOption),
    [assignableOptions],
  );

  const sectionsByFocusArea = useMemo(() => {
    return new Map(
      activeFocusAreas.map((focusArea) => {
        const localOptions = coverageOptions.filter(
          (option) => option.focusAreaId === focusArea.id,
        );
        const sections = localOptions.reduce<Map<string, CoverageOptionSection>>(
          (accumulator, option) => {
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
          },
          new Map(),
        );

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

  const handleBatchSaved = (
    focusAreaId: number,
    results: Array<{ option: AssignableShiftOption; saved: CoverageRequirement[] }>,
  ) => {
    if (results.length === 0) return;
    let updated = coverageRequirements;
    for (const { option } of results) {
      updated = updated.filter(
        (requirement) =>
          !(
            requirement.focusAreaId === focusAreaId && requirementMatchesOption(requirement, option)
          ),
      );
    }
    const added = results.flatMap((result) => result.saved);
    onCoverageRequirementsChange([...updated, ...added]);
  };

  if (activeFocusAreas.length === 0 || coverageOptions.length === 0) {
    return (
      <EmptyState
        size="compact"
        title={activeFocusAreas.length === 0 ? "No focus areas yet" : "No coverage targets yet"}
        description={
          activeFocusAreas.length === 0
            ? "Create focus areas first to configure coverage."
            : "Create shifts or scheduled jobs first so coverage can target the staffing demand you want to track."
        }
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {activeFocusAreas.map((focusArea) => (
        <FocusAreaCoverageCard
          key={focusArea.id}
          orgId={orgId}
          focusArea={focusArea}
          sections={sectionsByFocusArea.get(focusArea.id) ?? []}
          requirements={coverageRequirements}
          canEdit={canEdit}
          onBatchSaved={handleBatchSaved}
        />
      ))}
    </div>
  );
}
