"use client";

import { useState, Fragment } from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
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
import { buildShiftJobPairKey } from "@/lib/shift-job-segments";
import ScrollableTabs from "@/components/ScrollableTabs";
import { MaybeHint } from "@/components/ui/hint";

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
    shiftDisplayMode: "name",
    defaultShiftEnabled,
  });
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

  function getOptionButtonStyle(
    color: string,
    text: string,
    border: string,
    isActive: boolean,
  ): React.CSSProperties {
    // `color`/`text` are already dark-resolved by the caller; re-derive the
    // border from the resolved text rather than trusting the raw stored
    // border, unless it's the literal "transparent" sentinel.
    const effectiveBorder =
      border === "transparent" ? "transparent" : isDarkTheme ? borderColor(text) : border;
    return {
      background: color,
      border: isActive
        ? `1.5px solid ${effectiveBorder === "transparent" ? text : effectiveBorder}`
        : `1px solid ${borderColor(text)}`,
      borderRadius: 8,
      padding: "8px 10px 6px",
      cursor: "pointer",
      textAlign: "left",
      transition:
        "border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease, opacity 150ms ease",
      position: "relative",
      boxShadow: isActive
        ? `0 0 0 1px ${borderColor(text, 0.15)}, inset 0 1px 3px rgba(0,0,0,0.08)`
        : "none",
      opacity: isActive ? 1 : 0.92,
    };
  }

  function renderShiftButton(option: AssignableShiftOption) {
    const optionKey = buildShiftJobPairKey(option.shiftId, option.jobId);
    const isActive = selectedSegments.some(
      (selected) => buildShiftJobPairKey(selected.shiftId, selected.jobId) === optionKey,
    );
    const darkOption = isDarkTheme ? toDarkPillColors(option.color) : null;
    const optionColor = darkOption?.bg ?? option.color;
    const optionText = darkOption?.text ?? option.text;

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
        aria-label={`${option.primaryLabel}${option.secondaryLabel ? ` - ${option.secondaryLabel}` : ""}`}
        style={getOptionButtonStyle(optionColor, optionText, option.border, isActive)}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.opacity = "1";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.opacity = "0.92";
          }
        }}
      >
        {isActive && (
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: optionText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={10} color="#fff" strokeWidth={3.5} />
          </div>
        )}

        <MaybeHint
          content={
            option.secondaryLabel
              ? `${option.primaryLabel} · ${option.secondaryLabel}`
              : option.primaryLabel
          }
          side="left"
        >
          <div
            style={{
              ...primaryTextStyle,
              color: optionText,
              display: "flex",
              alignItems: "center",
              gap: 3,
              paddingRight: isActive ? 20 : 0,
            }}
          >
            {option.primaryLabel}
          </div>
        </MaybeHint>
        {option.secondaryLabel ? (
          <MaybeHint content={option.secondaryLabel} side="left">
            <div
              style={{
                ...secondaryTextStyle,
                color: optionText,
                opacity: 0.82,
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: isActive ? 20 : 0,
              }}
            >
              {option.secondaryLabel}
            </div>
          </MaybeHint>
        ) : null}
      </Button>
    );
  }

  const primaryTextStyle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: "var(--dg-fs-label)",
    letterSpacing: "0.01em",
    textShadow: "0 1px 0 rgba(255,255,255,0.18)",
  };

  const secondaryTextStyle: React.CSSProperties = {
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 700,
    letterSpacing: "0.01em",
  };

  const sectionHeading: React.CSSProperties = {
    marginBottom: 10,
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 700,
    color: "var(--dg-color-text-subtle)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const countPill: React.CSSProperties = {
    fontSize: "var(--dg-fs-badge)",
    fontWeight: 600,
    color: "var(--dg-color-text-faint)",
    background: "var(--dg-color-bg-secondary)",
    padding: "1px 6px",
    borderRadius: 10,
  };

  const headingLine: React.CSSProperties = {
    flex: 1,
    height: 1,
    background: "var(--dg-color-border-light)",
  };

  function renderGroupedOptions(options: typeof assignableOptions) {
    const grouped = new Map<string, typeof assignableOptions>();
    for (const option of options) {
      const group = grouped.get(option.groupLabel) ?? [];
      group.push(option);
      grouped.set(option.groupLabel, group);
    }

    return Array.from(grouped.entries())
      .sort((left, right) => {
        const leftSort = left[1][0]?.groupSortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightSort = right[1][0]?.groupSortOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftSort !== rightSort) return leftSort - rightSort;
        return left[0].localeCompare(right[0]);
      })
      .map(([groupLabel, groupOptions]) => (
        <div key={groupLabel} style={{ marginBottom: 24 }}>
          <div style={sectionHeading}>
            {groupLabel}
            <span style={countPill}>{groupOptions.length}</span>
            <div style={headingLine} />
          </div>
          <div
            role="group"
            aria-label={`${groupLabel} shift options`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            {[...groupOptions]
              .sort(compareOptionsWithinGroup)
              .map((option) => renderShiftButton(option))}
          </div>
        </div>
      ));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      {/* Shifts */}
      <div>
        {renderGroupedOptions(areaOptions)}

        {generalOptions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={sectionHeading}>
              General
              <span style={countPill}>{generalOptions.length}</span>
              <div style={headingLine} />
            </div>
            <div
              role="group"
              aria-label="General shift options"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
            >
              {[...generalOptions]
                .sort(compareOptionsWithinGroup)
                .map((option) => renderShiftButton(option))}
            </div>
          </div>
        )}

        {absenceTypes.length > 0 && (
          <div>
            <div style={sectionHeading}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.5 }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Off Days
              <span style={countPill}>{absenceTypes.length}</span>
              <div style={headingLine} />
            </div>
            <div
              role="group"
              aria-label="Off day options"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
            >
              {absenceTypes.map((at) => {
                const isActive = currentAbsenceTypeId === at.id;
                const darkAt = isDarkTheme ? toDarkPillColors(at.color) : null;
                const atColor = darkAt?.bg ?? at.color;
                const atText = darkAt?.text ?? at.text;
                return (
                  <Button
                    key={at.id}
                    onClick={() => {
                      onAbsenceSelect?.(at);
                      if (closeOnSelect && !multiSelect) onClose?.();
                    }}
                    aria-pressed={isActive}
                    aria-label={`${at.label} - ${at.name}`}
                    style={getOptionButtonStyle(atColor, atText, at.border, isActive)}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.opacity = "1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.opacity = "0.92";
                      }
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: atText,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={10} color="#fff" strokeWidth={3.5} />
                      </div>
                    )}
                    <MaybeHint content={at.name || at.label} side="left">
                      <div
                        style={{
                          ...primaryTextStyle,
                          color: atText,
                          lineHeight: 1.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingRight: isActive ? 20 : 0,
                        }}
                      >
                        {at.name || at.label}
                      </div>
                    </MaybeHint>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {areaOptions.length === 0 && generalOptions.length === 0 && absenceTypes.length === 0 && (
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
