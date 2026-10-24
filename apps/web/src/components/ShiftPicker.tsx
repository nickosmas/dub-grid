"use client";

import { useState, Fragment } from "react";
import { useTheme } from "next-themes";
import {
  AssignableShiftOption,
  AssignmentDefinition,
  AbsenceType,
  FocusArea,
  ScheduleCellSegmentInput,
  ShiftCategory,
  JobDefinition,
  NamedItem,
} from "@/types";
import { buildAssignableShiftOptions } from "@/lib/assignable-shifts";
import { Button } from "@/components/Button";
import { borderColor, toDarkPillColors } from "@/lib/colors";
import { absenceStripeFill } from "@/lib/absence-stripes";
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import ScrollableTabs from "@/components/ScrollableTabs";
import { MaybeHint } from "@/components/ui/hint";
import { formatShiftWindow, secondShiftClash, type WorkingShift } from "@/lib/shift-picker-groups";

interface ShiftPickerProps {
  assignments?: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  orgRoles?: NamedItem[];
  certifications?: NamedItem[];
  absenceTypes?: AbsenceType[];
  focusAreas: FocusArea[];
  currentAssignmentDefinitionIds?: number[];
  currentSegments?: ScheduleCellSegmentInput[];
  currentAbsenceTypeId?: number | null;
  onSelect: (segments: ScheduleCellSegmentInput[]) => void;
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  empFocusAreaIds?: number[];
  empCertificationId?: number | null;
  empRoleIds?: number[];
  initialTab?: number | null;
  /** If true, allows multiple shifts to be selected. */
  multiSelect?: boolean;
  /** If true, closes the picker immediately on select (usually for single-select). */
  closeOnSelect?: boolean;
  onClose?: () => void;
  defaultShiftEnabled?: boolean;
  /** The cell's date ("YYYY-MM-DD"), which names both days of an overnight shift. */
  date?: string;
  /** The shift already worked that day, when picking a second one. */
  workingShift?: WorkingShift | null;
  /** Lists shifts that clash with `workingShift` as unavailable instead of offering them. */
  blockClashes?: boolean;
  absenceScope?: "allDay" | "restOfDay";
}

export default function ShiftPicker({
  assignments = [],
  shiftCategories = [],
  jobs = [],
  orgRoles = [],
  certifications = [],
  absenceTypes = [],
  focusAreas,
  currentAssignmentDefinitionIds = [],
  currentSegments = [],
  currentAbsenceTypeId,
  onSelect,
  onAbsenceSelect,
  empFocusAreaIds = [],
  empCertificationId = null,
  empRoleIds = [],
  initialTab = null,
  multiSelect = false,
  closeOnSelect = true,
  onClose,
  defaultShiftEnabled = true,
  date,
  workingShift = null,
  blockClashes = false,
  absenceScope = "allDay",
}: ShiftPickerProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const assignableOptions = buildAssignableShiftOptions({
    assignments,
    shiftCategories,
    jobs,
    focusAreas,
    orgRoles,
    certifications,
    employee: {
      certificationId: empCertificationId,
      focusAreaIds: empFocusAreaIds,
      roleIds: empRoleIds,
    },
    // Tiles always spell names out, whatever the grid shows.
    shiftDisplayMode: "name",
    defaultShiftEnabled,
  });
  const spokenLabelById = new Map(
    assignableOptions.map((option) => [
      option.id,
      `${option.primaryLabel}${option.secondaryLabel ? ` - ${option.secondaryLabel}` : ""}`,
    ]),
  );
  const visibleAssignableOptions = assignableOptions.filter(
    (option) => option.showJobOnGrid || option.isShiftless || option.isShiftOnly,
  );

  const allPickerAreas = [
    ...focusAreas.filter(
      (fa) =>
        empFocusAreaIds.includes(fa.id) &&
        visibleAssignableOptions.some((option) => option.focusAreaId === fa.id),
    ),
    ...focusAreas.filter(
      (fa) =>
        !empFocusAreaIds.includes(fa.id) &&
        visibleAssignableOptions.some((option) => option.focusAreaId === fa.id),
    ),
  ];

  const [pickerTab, setPickerTab] = useState<number>(() => {
    if (initialTab != null) return initialTab;
    if (currentSegments.length > 0) {
      const firstSegment = currentSegments[0];
      if (firstSegment) {
        const firstOption = assignableOptions.find(
          (option) =>
            buildShiftJobPairKey(option.shiftId, option.jobId) ===
            buildShiftJobPairKey(firstSegment.shiftId, firstSegment.jobId),
        );
        if (firstOption?.focusAreaId != null) return firstOption.focusAreaId;
      }
    }
    if (currentAssignmentDefinitionIds.length > 0) {
      const firstOption = assignableOptions.find(
        (option) => option.assignmentId === currentAssignmentDefinitionIds[0],
      );
      if (firstOption?.focusAreaId != null) return firstOption.focusAreaId;
    }
    return allPickerAreas[0]?.id ?? empFocusAreaIds[0] ?? 0;
  });

  const areaOptions = assignableOptions.filter(
    (option) =>
      (option.showJobOnGrid || option.isShiftless || option.isShiftOnly) &&
      option.focusAreaId === pickerTab,
  );
  const generalOptions = visibleAssignableOptions.filter(
    (option) => option.isShiftless || option.focusAreaId == null,
  );
  const optionByPairKey = new Map(
    assignableOptions.map((option) => [buildShiftJobPairKey(option.shiftId, option.jobId), option]),
  );
  const isMentoredByPairKey = new Map(
    currentSegments.map((segment) => [
      buildShiftJobPairKey(segment.shiftId, segment.jobId),
      segment.isMentored ?? false,
    ]),
  );
  const selectedOptions =
    currentSegments.length > 0
      ? currentSegments
          .map(
            (segment) =>
              optionByPairKey.get(buildShiftJobPairKey(segment.shiftId, segment.jobId)) ?? null,
          )
          .filter((option): option is AssignableShiftOption => option != null)
      : currentAssignmentDefinitionIds
          .map(
            (assignmentId) =>
              assignableOptions.find((option) => option.assignmentId === assignmentId) ?? null,
          )
          .filter((option): option is AssignableShiftOption => option != null);
  const selectedSegments: ScheduleCellSegmentInput[] =
    currentSegments.length > 0
      ? currentSegments.map((segment, index) => ({
          shiftId: segment.shiftId,
          jobId: segment.jobId,
          position: segment.position ?? index,
          isMentored: segment.isMentored ?? false,
        }))
      : selectedOptions.map((selected, index) => ({
          shiftId: selected.shiftId,
          jobId: selected.jobId,
          position: index,
          isMentored:
            isMentoredByPairKey.get(buildShiftJobPairKey(selected.shiftId, selected.jobId)) ??
            false,
        }));

  function compareOptionsWithinGroup(
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

    const leftLabel = left.secondaryLabel
      ? `${left.primaryLabel} · ${left.secondaryLabel}`
      : left.primaryLabel;
    const rightLabel = right.secondaryLabel
      ? `${right.primaryLabel} · ${right.secondaryLabel}`
      : right.primaryLabel;
    return leftLabel.localeCompare(rightLabel);
  }

  function getTileStyle(
    background: string,
    text: string,
    isActive: boolean,
    disabled = false,
  ): React.CSSProperties {
    return {
      position: "relative",
      minHeight: 58,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      padding: "8px 10px",
      borderRadius: "var(--dg-radius-lg)",
      background: disabled ? "var(--dg-color-bg)" : background,
      border: disabled
        ? "1px dashed var(--dg-color-border-strong)"
        : `1px solid ${isActive ? "var(--dg-color-primary)" : borderColor(text)}`,
      // A second 1px ring outside the border reads as a 2px selection ring.
      boxShadow: isActive ? "0 0 0 1px var(--dg-color-primary)" : "none",
      color: disabled ? "var(--dg-color-text-subtle)" : text,
      cursor: disabled ? "not-allowed" : "pointer",
      textAlign: "center",
      transition: "border-color 150ms ease, box-shadow 150ms ease",
    };
  }

  function renderTileLabels(primary: string, secondary: string | null) {
    return (
      <>
        <MaybeHint content={secondary ? `${primary} · ${secondary}` : primary} side="left">
          <span style={tilePrimaryStyle}>{primary}</span>
        </MaybeHint>
        {secondary ? (
          <MaybeHint content={secondary} side="left">
            <span style={tileSecondaryStyle}>{secondary}</span>
          </MaybeHint>
        ) : null}
      </>
    );
  }

  function renderShiftButton(option: AssignableShiftOption, clash: string | null = null) {
    const optionKey = buildShiftJobPairKey(option.shiftId, option.jobId);
    const label =
      spokenLabelById.get(option.id) ??
      `${option.primaryLabel}${option.secondaryLabel ? ` - ${option.secondaryLabel}` : ""}`;
    const darkOption = isDarkTheme ? toDarkPillColors(option.color) : null;
    const optionColor = darkOption?.bg ?? option.color;
    const optionText = darkOption?.text ?? option.text;

    if (clash) {
      return (
        <Button
          key={option.id}
          disabled
          aria-label={`${label}, ${clash}`}
          style={getTileStyle(optionColor, optionText, false, true)}
        >
          {renderTileLabels(option.primaryLabel, option.secondaryLabel)}
        </Button>
      );
    }

    const isActive = selectedSegments.some(
      (selected) => buildShiftJobPairKey(selected.shiftId, selected.jobId) === optionKey,
    );

    const handleToggle = () => {
      let nextSegments: ScheduleCellSegmentInput[];
      if (multiSelect) {
        if (isActive) {
          nextSegments = selectedSegments.filter(
            (selected) => buildShiftJobPairKey(selected.shiftId, selected.jobId) !== optionKey,
          );
        } else if (selectedSegments.length >= 2) {
          return; // Max 2 shifts per cell
        } else {
          nextSegments = [
            ...selectedSegments,
            {
              shiftId: option.shiftId,
              jobId: option.jobId,
              position: selectedSegments.length,
              isMentored: false,
            },
          ];
        }
      } else {
        nextSegments = [
          {
            shiftId: option.shiftId,
            jobId: option.jobId,
            position: 0,
            isMentored: false,
          },
        ];
      }

      onSelect(
        nextSegments.map((segment, index): ScheduleCellSegmentInput => ({
          shiftId: segment.shiftId,
          jobId: segment.jobId,
          position: index,
          isMentored: segment.isMentored ?? false,
        })),
      );

      if (closeOnSelect && !multiSelect) {
        onClose?.();
      }
    };

    return (
      <Button
        key={option.id}
        onClick={handleToggle}
        aria-pressed={isActive}
        aria-label={label}
        style={getTileStyle(optionColor, optionText, isActive)}
      >
        {renderTileLabels(option.primaryLabel, option.secondaryLabel)}
      </Button>
    );
  }

  const tilePrimaryStyle: React.CSSProperties = {
    maxWidth: "100%",
    fontWeight: 700,
    fontSize: "var(--dg-fs-label)",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const tileSecondaryStyle: React.CSSProperties = {
    maxWidth: "100%",
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 600,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const tileGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  };

  function renderGroupHeading(label: string, detail: string | null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 10,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "var(--dg-fs-label)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        {detail ? (
          <span
            className="dg-tabular-nums"
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--dg-color-text-subtle)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {detail}
          </span>
        ) : null}
      </div>
    );
  }

  function groupByLabel(options: AssignableShiftOption[]) {
    const grouped = new Map<string, AssignableShiftOption[]>();
    for (const option of options) {
      const group = grouped.get(option.groupLabel) ?? [];
      group.push(option);
      grouped.set(option.groupLabel, group);
    }
    return Array.from(grouped.entries()).sort((left, right) => {
      const leftSort = left[1][0]?.groupSortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightSort = right[1][0]?.groupSortOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftSort !== rightSort) return leftSort - rightSort;
      return left[0].localeCompare(right[0]);
    });
  }

  function renderOptionGroups(
    options: AssignableShiftOption[],
    describe: (group: AssignableShiftOption[]) => string | null,
    clashOf: (option: AssignableShiftOption) => string | null = () => null,
  ) {
    return groupByLabel(options).map(([groupLabel, groupOptions]) => (
      <div key={groupLabel} style={{ marginBottom: 20 }}>
        {renderGroupHeading(groupLabel, describe(groupOptions))}
        <div role="group" aria-label={`${groupLabel} shift options`} style={tileGrid}>
          {[...groupOptions]
            .sort(compareOptionsWithinGroup)
            .map((option) => renderShiftButton(option, clashOf(option)))}
        </div>
      </div>
    ));
  }

  const shiftWindowOf = (group: AssignableShiftOption[]) => {
    const first = group[0];
    return first && !first.isShiftless
      ? formatShiftWindow(first.startTime, first.endTime, date)
      : null;
  };
  const clashOf = (option: AssignableShiftOption) =>
    workingShift && blockClashes ? secondShiftClash(option, workingShift, date) : null;
  const shiftOptions = [...new Set([...areaOptions, ...generalOptions])];
  const fittingAreaOptions = areaOptions.filter((option) => clashOf(option) == null);
  const fittingGeneralOptions = generalOptions.filter((option) => clashOf(option) == null);
  const clashingOptions = shiftOptions.filter((option) => clashOf(option) != null);
  const workingWindow = workingShift
    ? formatShiftWindow(workingShift.start, workingShift.end, date)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {workingShift && (
        <div
          className="dg-tabular-nums"
          style={{
            padding: "10px 12px",
            borderRadius: "var(--dg-radius-md)",
            background: "var(--dg-color-surface-alt)",
            fontSize: "var(--dg-fs-label)",
            color: "var(--dg-color-text-muted)",
          }}
        >
          Already working{" "}
          <strong style={{ color: "var(--dg-color-text-primary)" }}>
            {workingWindow ? `${workingShift.name}, ${workingWindow}` : workingShift.name}
          </strong>
        </div>
      )}

      {/* Tabs — stretch to fill when few, horizontal scroll when many */}
      {allPickerAreas.length > 1 && (
        <ScrollableTabs className="dg-span-tabs dg-span-tabs--light">
          {allPickerAreas.map((fa, i) => {
            const isActive = pickerTab === fa.id;
            const prevActive = i > 0 && pickerTab === allPickerAreas[i - 1].id;
            const showDivider = i > 0 && !isActive && !prevActive;
            return (
              <Fragment key={fa.id}>
                {i > 0 && (
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: showDivider ? "var(--dg-color-border)" : "transparent",
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                )}
                <Button
                  onClick={() => setPickerTab(fa.id)}
                  className={`dg-span-tab${isActive ? " active" : ""}`}
                  style={{ flex: "1 0 auto", textAlign: "center", whiteSpace: "nowrap" }}
                >
                  {fa.name}
                </Button>
              </Fragment>
            );
          })}
        </ScrollableTabs>
      )}

      <div>
        {renderOptionGroups(fittingAreaOptions, shiftWindowOf)}
        {renderOptionGroups(fittingGeneralOptions, () => "No set shift")}

        {absenceTypes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {renderGroupHeading(
              "Absences",
              absenceScope === "restOfDay" ? "Rest of the day · no hours" : "Whole day · no hours",
            )}
            <div role="group" aria-label="Absence options" style={tileGrid}>
              {absenceTypes.map((at) => {
                const isActive = currentAbsenceTypeId === at.id;
                const atFill = absenceStripeFill(at.color, isDarkTheme);
                const name = at.name || at.label;
                return (
                  <Button
                    key={at.id}
                    onClick={() => {
                      onAbsenceSelect?.(at);
                      if (closeOnSelect && !multiSelect) onClose?.();
                    }}
                    aria-pressed={isActive}
                    aria-label={`${at.label} - ${at.name}`}
                    style={getTileStyle(atFill.background, atFill.text, isActive)}
                  >
                    <MaybeHint content={name} side="left">
                      <span style={tilePrimaryStyle}>{name}</span>
                    </MaybeHint>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {clashingOptions.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                color: "var(--dg-color-text-muted)",
                paddingBottom: 8,
                marginBottom: 12,
                borderBottom: "1px solid var(--dg-color-border)",
              }}
            >
              Can&apos;t be added
            </div>
            {renderOptionGroups(clashingOptions, (group) => clashOf(group[0]), clashOf)}
          </div>
        )}

        {shiftOptions.length === 0 && absenceTypes.length === 0 && (
          <div
            style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--dg-color-text-subtle)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            No shifts available.
          </div>
        )}
      </div>
    </div>
  );
}
