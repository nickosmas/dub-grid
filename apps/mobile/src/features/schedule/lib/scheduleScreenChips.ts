import type {
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import {
  mobileDarkenTone,
  mobileVisiblePillBorder,
  type MobileColors,
} from "../../../shared/theme/tokens";
import {
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  formatCompactScheduleDate,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryCustomTimeRange,
  getMobileScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryTitle,
  getSplitShiftSegmentLabel,
  getSplitShiftSegmentsForEntry,
  sortScheduleEntries,
  type FeaturedMeScheduleSegment,
} from "./schedule";
import {
  getLocalDateTimeMinutes,
  getSegmentEndTime,
  getSegmentStartTime,
} from "./scheduleScreenHelpers";
import { type AvatarTone } from "@dubgrid/design-tokens";

// Chip/label builders and me-hero segment matching for the schedule screen,
// extracted from ScheduleScreen.tsx. Pure functions only: theme colors come in
// as arguments (MobileColors / isDark), never from hooks.

type JobColorSource = {
  jobColor?: string | null;
  jobBorderColor?: string | null;
  jobTextColor?: string | null;
  isMentored?: boolean | null;
};

type JobChipKind = "job" | "general" | "absence";

type AbsenceColorSource = Pick<
  MobileScheduleEntry["presentation"],
  "shiftColor" | "shiftBorderColor" | "shiftTextColor"
>;

export function joinMetaParts(parts: Array<string | null | undefined>): string | null {
  const values = parts.filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );

  return values.length > 0 ? values.join(" • ") : null;
}

export function getScheduleItemShiftName(item: FeaturedMeScheduleSegment["item"]): string {
  if (!item) {
    return "Nothing scheduled this week";
  }

  return item.segment.shiftName || getScheduleEntryTitle(item.entry);
}

function areScheduleSegmentsEqual(
  current: MobileScheduleEntrySegment,
  previous: MobileScheduleEntrySegment,
): boolean {
  return (
    current.shiftId === previous.shiftId &&
    current.jobId === previous.jobId &&
    current.label === previous.label &&
    current.shiftName === previous.shiftName &&
    current.jobName === previous.jobName &&
    current.startTime === previous.startTime &&
    current.endTime === previous.endTime &&
    current.focusAreaId === previous.focusAreaId &&
    current.displayFocusAreaName === previous.displayFocusAreaName &&
    current.isMentored === previous.isMentored
  );
}

export function getScheduleEntrySegmentChange(
  entry: MobileScheduleEntry,
  segment: MobileScheduleEntrySegment,
): MobileScheduleEntry["change"] {
  const change = entry.change;
  if (!change || change.kind !== "modified") {
    return change;
  }

  const segmentIndex = getScheduleEntrySegments(entry).indexOf(segment);
  const previousSegment = change.previousPresentation?.segments[segmentIndex] ?? null;

  return previousSegment && areScheduleSegmentsEqual(segment, previousSegment) ? null : change;
}

export function getScheduleItemJobName(item: FeaturedMeScheduleSegment["item"]): string | null {
  if (!item || getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return null;
  }

  return item.segment.jobName ?? null;
}

export function getScheduleItemFocusArea(item: FeaturedMeScheduleSegment["item"]): string | null {
  if (
    !item ||
    getScheduleEntryAbsenceTypeId(item.entry) != null ||
    isGeneralShiftSegment(item.segment)
  ) {
    return null;
  }

  return getMobileScheduleEntrySegmentFocusAreaName(item.entry, item.segment);
}

export type JobChip = AvatarTone & {
  kind: JobChipKind;
  label: string;
  eyebrowLabel?: string | null;
  isMentored?: boolean;
};

export function readOptionalColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.toLowerCase() === "transparent" ? null : trimmedValue;
}

export function readOptionalStyleColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function normalizeScheduleLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildAbsenceChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: AbsenceColorSource | null,
): JobChip | null {
  const trimmedLabel = label?.trim() ?? "";
  const absenceColor = readOptionalStyleColor(colorSource?.shiftColor);
  const absenceBorderColor = readOptionalStyleColor(colorSource?.shiftBorderColor);
  const absenceTextColor = readOptionalStyleColor(colorSource?.shiftTextColor);

  if (!trimmedLabel) {
    return null;
  }

  if (absenceColor) {
    return {
      kind: "absence",
      eyebrowLabel: "Absence",
      label: trimmedLabel,
      ...mobileDarkenTone(
        {
          backgroundColor: absenceColor,
          borderColor: mobileVisiblePillBorder(
            absenceBorderColor,
            absenceTextColor ?? mobileColors.textMuted,
          ),
          textColor: absenceTextColor ?? mobileColors.textMuted,
        },
        isDark,
      ),
    };
  }

  return {
    kind: "absence",
    eyebrowLabel: "Absence",
    label: trimmedLabel,
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.border,
    textColor: mobileColors.textMuted,
  };
}

export function hasMentoredSegments(
  segments: ReadonlyArray<{ isMentored?: boolean | null }> | null | undefined,
): boolean {
  return segments?.some((segment) => segment.isMentored === true) ?? false;
}

export function buildGeneralShiftChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const chip = buildJobChip(mobileColors, isDark, label, colorSource);

  if (!chip) {
    return null;
  }

  return {
    ...chip,
    kind: "general",
    eyebrowLabel: "General shift",
  };
}

export function isGeneralShiftSegment(
  segment: { shiftId?: number | null } | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

export function buildJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const trimmedLabel = label?.trim() ?? "";
  const jobColor = readOptionalColor(colorSource?.jobColor);
  const jobBorderColor = readOptionalColor(colorSource?.jobBorderColor);
  const jobTextColor = readOptionalColor(colorSource?.jobTextColor);

  if (!trimmedLabel) {
    return null;
  }

  if (jobColor || jobBorderColor || jobTextColor) {
    return {
      kind: "job",
      label: trimmedLabel,
      ...mobileDarkenTone(
        {
          backgroundColor: jobColor ?? mobileColors.surfaceSecondary,
          borderColor: jobBorderColor ?? mobileColors.border,
          textColor: jobTextColor ?? mobileColors.textMuted,
        },
        isDark,
      ),
      isMentored: colorSource?.isMentored === true,
    };
  }

  const normalizedLabel = trimmedLabel.toLowerCase();
  const tone =
    normalizedLabel.includes("supervisor") ||
    normalizedLabel.includes("lead") ||
    normalizedLabel.includes("manager")
      ? mobileDarkenTone(
          {
            backgroundColor: "#FCE7F3",
            borderColor: "#FBCFE8",
            textColor: "#BE185D",
          },
          isDark,
        )
      : normalizedLabel.includes("mentor") || normalizedLabel.includes("trainer")
        ? {
            backgroundColor: mobileColors.warningSoft,
            borderColor: mobileColors.warningBorder,
            textColor: isDark ? mobileColors.warningText : "#B45309",
          }
        : normalizedLabel.includes("nurse") ||
            normalizedLabel.includes("rn") ||
            normalizedLabel.includes("lpn")
          ? mobileDarkenTone(
              {
                backgroundColor: "#ECFEFF",
                borderColor: "#A5F3FC",
                textColor: "#0E7490",
              },
              isDark,
            )
          : {
              backgroundColor: mobileColors.surfaceSecondary,
              borderColor: mobileColors.border,
              textColor: mobileColors.textMuted,
            };

  return {
    kind: "job",
    label: trimmedLabel,
    isMentored: colorSource?.isMentored === true,
    ...tone,
  };
}

export function getScheduleItemJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  if (!item) {
    return null;
  }

  if (getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return buildAbsenceChip(
      mobileColors,
      isDark,
      getScheduleItemShiftName(item),
      item.entry.presentation,
    );
  }

  if (isGeneralShiftSegment(item.segment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getScheduleItemShiftName(item),
      item.segment,
    );
  }

  const jobName = getScheduleItemJobName(item);
  return buildJobChip(mobileColors, isDark, jobName, item.segment);
}

export function getSegmentJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  segment: MobileScheduleEntrySegment,
): JobChip | null {
  if (isGeneralShiftSegment(segment)) {
    return buildGeneralShiftChip(mobileColors, isDark, segment.shiftName ?? segment.label, segment);
  }

  return buildJobChip(mobileColors, isDark, segment.jobName ?? null, segment);
}

export function getScheduleItemTypeChip(
  mobileColors: MobileColors,
  isDark: boolean,
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  return getScheduleItemJobChip(mobileColors, isDark, item);
}

export function getVisibleScheduleItemTypeChip(
  mobileColors: MobileColors,
  isDark: boolean,
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  const typeChip = getScheduleItemTypeChip(mobileColors, isDark, item);

  if (!item || !typeChip) {
    return typeChip;
  }

  if (typeChip.kind !== "job") {
    return typeChip;
  }

  const chipLabel = normalizeScheduleLabel(typeChip.label);
  const shiftLabels = [
    getScheduleItemShiftName(item),
    item.segment.shiftName,
    item.segment.label,
    item.entry.presentation?.label,
  ].map(normalizeScheduleLabel);

  return chipLabel.length > 0 && shiftLabels.includes(chipLabel) ? null : typeChip;
}

export function shouldShowMePrimaryTitle(
  title: string | null | undefined,
  chip: JobChip | null,
): boolean {
  if (!chip?.eyebrowLabel) {
    return true;
  }

  return normalizeScheduleLabel(title) !== normalizeScheduleLabel(chip.label);
}

export function getScheduleItemTimeRange(item: FeaturedMeScheduleSegment["item"]): string | null {
  if (!item) {
    return null;
  }

  const segmentCount = getScheduleEntrySegments(item.entry).length;

  if (segmentCount <= 1) {
    return (
      getScheduleEntryCustomTimeRange(item.entry) ??
      getScheduleEntrySegmentTimeRange(item.segment) ??
      getScheduleEntryBaseTimeRange(item.entry)
    );
  }

  return (
    getScheduleEntrySegmentTimeRange(item.segment) ?? getScheduleEntryBaseTimeRange(item.entry)
  );
}

export function getScheduleItemSplitShiftLabel(
  item: FeaturedMeScheduleSegment["item"],
): string | null {
  if (!item) {
    return null;
  }

  const splitSegments = getSplitShiftSegmentsForEntry(item.entry);
  const segmentIndex = splitSegments.indexOf(item.segment);
  if (splitSegments.length <= 1 || segmentIndex < 0) {
    return null;
  }

  return getSplitShiftSegmentLabel(segmentIndex, splitSegments.length);
}

export function doScheduleSegmentsMatch(
  left: MobileScheduleEntrySegment,
  right: MobileScheduleEntrySegment,
): boolean {
  return (
    left === right ||
    (left.shiftId === right.shiftId &&
      left.jobId === right.jobId &&
      left.shiftName === right.shiftName &&
      left.jobName === right.jobName &&
      left.startTime === right.startTime &&
      left.endTime === right.endTime)
  );
}

export function getMeHeroSupplementalSplitSegments(
  item: FeaturedMeScheduleSegment["item"],
  splitSegments: ReadonlyArray<MobileScheduleEntrySegment>,
  currentDate: string,
  currentTime: string,
): {
  segments: MobileScheduleEntrySegment[];
  segmentLabelIndices: number[];
} {
  if (!item || splitSegments.length <= 1) {
    return { segments: [], segmentLabelIndices: [] };
  }

  const featuredSegmentIndex = splitSegments.findIndex((segment) =>
    doScheduleSegmentsMatch(segment, item.segment),
  );
  const hiddenSegmentIndex = featuredSegmentIndex >= 0 ? featuredSegmentIndex : 0;
  const segments: MobileScheduleEntrySegment[] = [];
  const segmentLabelIndices: number[] = [];

  splitSegments.forEach((segment, index) => {
    if (index === hiddenSegmentIndex) {
      return;
    }

    if (isHeroSplitSegmentComplete(item.entry, segment, currentDate, currentTime)) {
      return;
    }

    segments.push(segment);
    segmentLabelIndices.push(index);
  });

  return { segments, segmentLabelIndices };
}

export function isHeroSplitSegmentComplete(
  entry: MobileScheduleEntry,
  segment: MobileScheduleEntrySegment,
  currentDate: string,
  currentTime: string,
): boolean {
  const segmentStartTime = getSegmentStartTime(segment);
  const segmentEndTime = getSegmentEndTime(segment);

  if (!segmentStartTime || !segmentEndTime) {
    return false;
  }

  const segmentStartMinutes = getLocalDateTimeMinutes(entry.date, segmentStartTime);
  const segmentEndMinutes = getLocalDateTimeMinutes(entry.date, segmentEndTime);
  const currentMinutes = getLocalDateTimeMinutes(currentDate, currentTime);

  if (segmentStartMinutes == null || segmentEndMinutes == null || currentMinutes == null) {
    return false;
  }

  const normalizedEndMinutes =
    segmentEndMinutes <= segmentStartMinutes ? segmentEndMinutes + 24 * 60 : segmentEndMinutes;

  return currentMinutes >= normalizedEndMinutes;
}

export function getScheduleSegmentMatchKey(segment: MobileScheduleEntrySegment): string | null {
  if (segment.shiftId != null) {
    return `shift:${segment.shiftId}`;
  }

  const title = segment.shiftName?.trim() || segment.label?.trim();
  return title
    ? `segment:${title}:${segment.startTime ?? "none"}:${segment.endTime ?? "none"}`
    : null;
}

export function entriesShareWorkedSegment(
  left: MobileScheduleEntry,
  rightEntry: MobileScheduleEntry,
  rightSegment: MobileScheduleEntrySegment,
  rightKey: string | null,
): boolean {
  if (!rightKey) {
    return false;
  }

  for (const segment of getScheduleEntrySegments(left)) {
    if (
      getScheduleSegmentMatchKey(segment) === rightKey &&
      doScheduleEntrySegmentsShareShiftAndFocusArea(rightEntry, rightSegment, left, segment)
    ) {
      return true;
    }
  }

  return false;
}

export function getMeHeroShiftmates(
  item: FeaturedMeScheduleSegment["item"],
  teamEntries: MobileScheduleEntry[],
): MobileScheduleEntry[] {
  if (
    !item ||
    getScheduleEntryAbsenceTypeId(item.entry) != null ||
    isGeneralShiftSegment(item.segment)
  ) {
    return [];
  }

  const featuredSegmentKey = getScheduleSegmentMatchKey(item.segment);
  const matchingEntries = teamEntries.filter(
    (entry) =>
      entry.date === item.date &&
      entry.employeeId !== item.entry.employeeId &&
      getScheduleEntryAbsenceTypeId(entry) == null &&
      entriesShareWorkedSegment(entry, item.entry, item.segment, featuredSegmentKey),
  );

  return sortScheduleEntries(
    matchingEntries.filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.employeeId === entry.employeeId) === index,
    ),
  );
}

export function getRequestDateLabel(request: MobileShiftRequest): string {
  return formatCompactScheduleDate(request.requesterShiftDate);
}
