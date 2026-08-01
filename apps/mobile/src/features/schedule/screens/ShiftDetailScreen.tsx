import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_MOBILE_SCHEDULE_RANGE_DAYS,
  type MobileScheduleEntry,
  type MobileScheduleEntrySegment,
  type MobileShiftRequest,
} from "@dubgrid/contracts";
import { indefiniteArticle } from "@dubgrid/domain";
import { getAvatarTone, resolveShiftPillColors } from "@dubgrid/design-tokens";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ModalHeader } from "../../../shared/components/ModalHeader";
import { DetailSkeleton, ListSkeleton } from "../../../shared/components/Skeleton";
import { Card, Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { SplitShiftBadge, SplitShiftSegmentList } from "../components/SplitShift";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  createShiftRequest,
  getPeople,
  getMySchedule,
  getOrgSchedule,
  getShiftRequests,
  getShiftSwapOptions,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { getMobileQueryContentState, getQueryErrorMessage } from "../../../shared/lib/query-state";
import {
  useIsDarkMode,
  useMobileColors,
  useThemeMode,
} from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileBorderColorFromText,
  mobileRadii,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  buildScheduleSections,
  buildScheduleShiftGroups,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  formatCompactScheduleDate,
  getCompactScheduleDateParts,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryCategoryKey,
  getScheduleEntryCustomEndTime,
  getScheduleEntryCustomStartTime,
  getScheduleEntryEndTime,
  getScheduleEntryTimeRange,
  getScheduleEntryStartTime,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryDisplayFocusAreaName,
  getScheduleWeekStartDate,
  getSplitShiftSegmentsForEntry,
  getScheduleEntryTitle,
  sortScheduleEntries,
} from "../lib/schedule";
import {
  type RequestMode,
  type ShiftTimeRange,
  type ShiftmateSegmentMatch,
  type ShiftmateSegmentGroup,
} from "../lib/shiftDetailHelpers";

type CoverageRequestType = "pickup" | "calloff" | null;
type ShiftDetailConfirmation = {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: "primary" | "dangerFilled";
  onConfirm: () => void;
} | null;
const SWAP_SCHEDULE_LOOKAHEAD_DAYS = MAX_MOBILE_SCHEDULE_RANGE_DAYS;
const ACTION_SEGMENT_PANEL_RADIUS = mobileRadii.card;
const ACTION_SEGMENT_PANEL_PADDING = 14;
const ACTION_SEGMENT_OPTION_RADIUS = Math.min(
  ACTION_SEGMENT_PANEL_RADIUS - 4,
  Math.max(8, ACTION_SEGMENT_PANEL_RADIUS - ACTION_SEGMENT_PANEL_PADDING / 2),
);
const ACTIVE_SHIFT_REQUEST_STATUSES = new Set<MobileShiftRequest["status"]>([
  "open",
  "pending_approval",
]);
type ChipTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};
type DetailChipKind = "job" | "general" | "absence";
type DetailChip = ChipTone & {
  kind: DetailChipKind;
  label: string;
  eyebrowLabel?: string | null;
};
type AbsenceColorSource = Pick<
  MobileScheduleEntry["presentation"],
  "shiftColor" | "shiftBorderColor" | "shiftTextColor"
>;
type EyebrowDisplay = "inside" | "outside";

function readOptionalColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.toLowerCase() === "transparent" ? null : trimmedValue;
}

function readOptionalStyleColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatShiftDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekDates(startDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysIso(startDate, index));
}

function getDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const dates: string[] = [];
  for (
    let currentDate = startDate;
    currentDate <= endDate;
    currentDate = addDaysIso(currentDate, 1)
  ) {
    dates.push(currentDate);
  }

  return dates;
}

function formatWeekRangeLabel(startDate: string): string {
  const formatRangeDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));

  return `${formatRangeDate(startDate)} - ${formatRangeDate(addDaysIso(startDate, 6))}`;
}

function formatPublishedAt(value: string | null, timeZone?: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
  }).format(new Date(value));
}

function formatPublishedSummary(
  publishedByName: string | null,
  publishedAtLabel: string | null,
): string | null {
  if (publishedByName && publishedAtLabel) {
    return `Published ${publishedAtLabel} by ${publishedByName}`;
  }

  if (publishedAtLabel) {
    return `Published ${publishedAtLabel}`;
  }

  if (publishedByName) {
    return `Published by ${publishedByName}`;
  }

  return null;
}

function getSegmentSortTime(segment: MobileScheduleEntrySegment): string {
  return segment.startTime ?? segment.shiftStartTime ?? "99:99:99";
}

function getSegmentTitle(segment: MobileScheduleEntrySegment): string {
  return segment.shiftName?.trim() || segment.label?.trim() || "Shift";
}

function getSegmentTimeKey(segment: MobileScheduleEntrySegment): string {
  return `${segment.startTime ?? segment.shiftStartTime ?? ""}-${
    segment.endTime ?? segment.shiftEndTime ?? ""
  }`;
}

function doShiftmateSegmentsMatch(
  sourceEntry: MobileScheduleEntry,
  sourceSegment: MobileScheduleEntrySegment,
  candidateEntry: MobileScheduleEntry,
  candidateSegment: MobileScheduleEntrySegment,
): boolean {
  return doScheduleEntrySegmentsShareShiftAndFocusArea(
    sourceEntry,
    sourceSegment,
    candidateEntry,
    candidateSegment,
  );
}

function entriesHaveMatchingShiftAndFocusArea(
  sourceEntry: MobileScheduleEntry,
  candidateEntry: MobileScheduleEntry,
): boolean {
  const sourceSegments = getSortedEntrySegments(sourceEntry);
  const candidateSegments = getSortedEntrySegments(candidateEntry);

  return sourceSegments.some((sourceSegment) =>
    candidateSegments.some((candidateSegment) =>
      doShiftmateSegmentsMatch(sourceEntry, sourceSegment, candidateEntry, candidateSegment),
    ),
  );
}

function isGeneralDetailEntry(entry: MobileScheduleEntry): boolean {
  const segments = getScheduleEntrySegments(entry);

  return segments.length > 0 && segments.every(isGeneralDetailSegment);
}

function getSortedEntrySegments(entry: MobileScheduleEntry): MobileScheduleEntrySegment[] {
  return getScheduleEntrySegments(entry)
    .map((segment, originalIndex) => ({ segment, originalIndex }))
    .sort((left, right) => {
      const timeComparison = getSegmentSortTime(left.segment).localeCompare(
        getSegmentSortTime(right.segment),
      );

      return timeComparison === 0 ? left.originalIndex - right.originalIndex : timeComparison;
    })
    .map(({ segment }) => segment);
}

function buildShiftmateSegmentGroups(
  shiftEntry: MobileScheduleEntry | null,
  teamEntries: ReadonlyArray<MobileScheduleEntry>,
): ShiftmateSegmentGroup[] {
  const splitSegments = shiftEntry ? getSplitShiftSegmentsForEntry(shiftEntry) : [];

  if (!shiftEntry || splitSegments.length <= 1) {
    return [];
  }

  const teammateEntries = sortScheduleEntries(
    teamEntries.filter(
      (entry) =>
        entry.date === shiftEntry.date &&
        entry.employeeId !== shiftEntry.employeeId &&
        getScheduleEntryAbsenceTypeId(entry) == null,
    ),
  );

  return splitSegments.map((sourceSegment, segmentIndex) => {
    const entries: ShiftmateSegmentMatch[] = [];

    for (const teammateEntry of teammateEntries) {
      const matchingSegment = getSortedEntrySegments(teammateEntry).find((candidateSegment) =>
        doShiftmateSegmentsMatch(shiftEntry, sourceSegment, teammateEntry, candidateSegment),
      );

      if (matchingSegment) {
        entries.push({
          entry: teammateEntry,
          segment: matchingSegment,
        });
      }
    }

    return {
      key: `${segmentIndex}-${getSegmentTitle(sourceSegment)}-${getSegmentTimeKey(sourceSegment)}`,
      label: `Shift ${segmentIndex + 1}`,
      title: getSegmentTitle(sourceSegment),
      timeRange: getScheduleEntrySegmentTimeRange(sourceSegment),
      entries,
    };
  });
}

function getScheduleEntryIdentityKey(entry: MobileScheduleEntry): string {
  return [
    entry.employeeId,
    entry.date,
    getScheduleEntryCategoryKey(entry),
    getScheduleEntryStartTime(entry) ?? "none",
    getScheduleEntryEndTime(entry) ?? "none",
    getScheduleEntryCustomStartTime(entry) ?? "none",
    getScheduleEntryCustomEndTime(entry) ?? "none",
  ].join(":");
}

function getActionSegmentOptions(entry: MobileScheduleEntry) {
  return getSortedEntrySegments(entry).map((segment, index) => ({ segment, segmentIndex: index }));
}

function getActionSegmentLabel(entry: MobileScheduleEntry, segmentIndex: number): string {
  const options = getActionSegmentOptions(entry);
  const option = options[segmentIndex] ?? options[0] ?? null;

  if (!option) {
    return getScheduleEntryTitle(entry);
  }

  const title =
    option.segment.shiftName?.trim() ||
    option.segment.label?.trim() ||
    getScheduleEntryTitle(entry);
  const timeRange = getScheduleEntrySegmentTimeRange(option.segment);

  return timeRange ? `${title} (${timeRange})` : title;
}

function getCurrentDateTimeParts(timeZone?: string | null): {
  dateKey: string;
  timeKey: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    timeKey: `${getPart("hour")}:${getPart("minute")}`,
  };
}

function isPastScheduleDate(date: string, timeZone?: string | null): boolean {
  return date < getCurrentDateTimeParts(timeZone).dateKey;
}

function formatShiftRequestStatus(status: MobileShiftRequest["status"]): string {
  return status === "pending_approval"
    ? "Pending approval"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function formatShiftRequestType(type: MobileShiftRequest["type"]): string {
  if (type === "pickup") {
    return "Pickup";
  }

  if (type === "swap") {
    return "Swap";
  }

  return "Calloff";
}

function getRequestModeTitle(mode: RequestMode): string {
  if (mode === "coverage") {
    return "Drop shift";
  }

  if (mode === "swap") {
    return "Swap";
  }

  return "Shift action";
}

function getRequestModalPresentationStyle(mode: RequestMode) {
  if (Platform.OS !== "ios") {
    return "fullScreen" as const;
  }

  if (mode === "coverage") {
    return "formSheet" as const;
  }

  return "pageSheet" as const;
}

function getAbsenceTypeOptionLabel(absenceType: { label: string; name?: string | null }) {
  const trimmedName = absenceType.name?.trim() ?? "";

  return trimmedName.length > 0 ? trimmedName : absenceType.label;
}

function getAbsenceTypeLabelForEntry(
  absenceTypes: Array<{ id: number; label: string; name?: string | null }>,
  entry: MobileScheduleEntry,
) {
  const absenceTypeId = getScheduleEntryAbsenceTypeId(entry);
  const absenceType =
    absenceTypeId == null ? null : (absenceTypes.find((item) => item.id === absenceTypeId) ?? null);

  return absenceType ? getAbsenceTypeOptionLabel(absenceType) : getScheduleEntryTitle(entry);
}

function getEntryTimeRanges(entry: MobileScheduleEntry): ShiftTimeRange[] {
  return getScheduleEntrySegments(entry).flatMap((segment) => {
    if (!segment.startTime || !segment.endTime) {
      return [];
    }

    return [
      {
        start: segment.startTime,
        end: segment.endTime,
      },
    ];
  });
}

function hasWorkedAssignment(entry: MobileScheduleEntry): boolean {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return false;
  }

  return entry.state
    ? entry.state.kind === "worked" && entry.state.segments.length > 0
    : getScheduleEntrySegments(entry).length > 0;
}

function hasScheduledWorkedAssignment(entry: MobileScheduleEntry): boolean {
  if (!hasWorkedAssignment(entry)) {
    return false;
  }

  if (entry.state) {
    return (
      entry.state.kind === "worked" &&
      entry.state.segments.length > 0 &&
      entry.state.segments.every((segment) => segment.shiftId != null)
    );
  }

  const segments = getScheduleEntrySegments(entry);
  if (segments.length === 0) {
    return true;
  }

  return segments.every(
    (segment) =>
      !Object.prototype.hasOwnProperty.call(segment, "shiftId") || segment.shiftId != null,
  );
}

function getMinutesSinceMidnight(value: string): number | null {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function expandTimeRange(range: ShiftTimeRange): Array<{ start: number; end: number }> {
  const startMinutes = getMinutesSinceMidnight(range.start);
  const endMinutes = getMinutesSinceMidnight(range.end);

  if (startMinutes == null || endMinutes == null) {
    return [];
  }

  if (endMinutes <= startMinutes) {
    return [
      { start: startMinutes, end: 24 * 60 },
      { start: 0, end: endMinutes },
    ];
  }

  return [{ start: startMinutes, end: endMinutes }];
}

function entriesHaveOverlappingTimes(
  left: MobileScheduleEntry | null,
  right: MobileScheduleEntry | null,
): boolean {
  if (!left || !right) {
    return false;
  }

  const leftRanges = getEntryTimeRanges(left).flatMap(expandTimeRange);
  const rightRanges = getEntryTimeRanges(right).flatMap(expandTimeRange);

  if (leftRanges.length === 0 || rightRanges.length === 0) {
    return false;
  }

  return leftRanges.some((leftRange) =>
    rightRanges.some(
      (rightRange) => leftRange.start < rightRange.end && rightRange.start < leftRange.end,
    ),
  );
}

function getScheduleEntryRequiredFocusAreaIds(entry: MobileScheduleEntry): number[] {
  const focusAreaIds = new Set<number>();
  const presentationFocusAreaId = entry.presentation?.focusAreaId ?? null;

  if (presentationFocusAreaId != null) {
    focusAreaIds.add(presentationFocusAreaId);
  }

  for (const segment of entry.presentation?.segments ?? []) {
    const segmentFocusAreaId = segment.focusAreaId ?? null;
    if (segmentFocusAreaId != null) {
      focusAreaIds.add(segmentFocusAreaId);
    }
  }

  return [...focusAreaIds];
}

function getEarliestScheduleEntryStartTime(entry: MobileScheduleEntry): string | null {
  let earliestStartTime = entry.presentation?.startTime ?? null;

  for (const segment of getScheduleEntrySegments(entry)) {
    if (segment.startTime && (!earliestStartTime || segment.startTime < earliestStartTime)) {
      earliestStartTime = segment.startTime;
    }
  }

  return earliestStartTime;
}

function hasScheduleEntrySegmentStarted(
  entry: MobileScheduleEntry,
  timeZone: string | null | undefined,
  segmentIndex: number,
): boolean {
  const option = getActionSegmentOptions(entry)[segmentIndex];
  const startTime = option?.segment.startTime ?? option?.segment.shiftStartTime ?? null;

  const { dateKey: todayDateKey, timeKey: currentTimeKey } = getCurrentDateTimeParts(timeZone);

  if (entry.date < todayDateKey) {
    return true;
  }

  if (entry.date > todayDateKey) {
    return false;
  }

  if (!startTime) {
    return true;
  }

  const currentMinutes = getMinutesSinceMidnight(currentTimeKey);
  const startMinutes = getMinutesSinceMidnight(startTime);

  if (currentMinutes == null || startMinutes == null) {
    return true;
  }

  return currentMinutes >= startMinutes;
}

function hasScheduleEntryStarted(entry: MobileScheduleEntry, timeZone?: string | null): boolean {
  const { dateKey: todayDateKey, timeKey: currentTimeKey } = getCurrentDateTimeParts(timeZone);

  if (entry.date < todayDateKey) {
    return true;
  }

  if (entry.date > todayDateKey) {
    return false;
  }

  const earliestStartTime = getEarliestScheduleEntryStartTime(entry);
  if (!earliestStartTime) {
    return true;
  }

  const currentMinutes = getMinutesSinceMidnight(currentTimeKey);
  const startMinutes = getMinutesSinceMidnight(earliestStartTime);

  if (currentMinutes == null || startMinutes == null) {
    return true;
  }

  return currentMinutes >= startMinutes;
}

function hasAnyRequestableScheduleEntrySegment(
  entry: MobileScheduleEntry,
  timeZone?: string | null,
): boolean {
  const options = getActionSegmentOptions(entry);

  if (options.length === 0) {
    return false;
  }

  return options.some(
    (option) => !hasScheduleEntrySegmentStarted(entry, timeZone, option.segmentIndex),
  );
}

function canWorkRequiredFocusAreas(
  employeeFocusAreaIds: ReadonlyArray<number> | null | undefined,
  requiredFocusAreaIds: ReadonlyArray<number>,
): boolean {
  if (requiredFocusAreaIds.length === 0) {
    return true;
  }

  const employeeFocusAreaIdSet = new Set(employeeFocusAreaIds ?? []);
  return requiredFocusAreaIds.every((focusAreaId) => employeeFocusAreaIdSet.has(focusAreaId));
}

function getInitials(name: string): string {
  const parts = name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "") : "";

  return `${first}${last}` || "?";
}

// User-picked hex colors from the backend are tuned for a white page and
// read as washed-out on a dark surface — remap through the shared HSV
// darkener. Theme tokens (mobileColors.*) are already theme-correct and
// must NOT be passed through this a second time.
function darkenTone(
  tone: { backgroundColor: string; borderColor: string; textColor: string },
  isDark: boolean,
): { backgroundColor: string; borderColor: string; textColor: string } {
  if (!isDark) return tone;

  const resolved = resolveShiftPillColors(
    { color: tone.backgroundColor, text: tone.textColor, border: tone.borderColor },
    true,
  );
  return {
    backgroundColor: resolved.color,
    borderColor: resolved.border,
    textColor: resolved.text,
  };
}

function buildDetailJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: {
    jobColor?: string | null;
    jobBorderColor?: string | null;
    jobTextColor?: string | null;
  } | null,
): DetailChip | null {
  const trimmedLabel = label?.trim() ?? "";
  const jobColor = readOptionalColor(colorSource?.jobColor);
  const jobBorderColor = readOptionalColor(colorSource?.jobBorderColor);
  const jobTextColor = readOptionalColor(colorSource?.jobTextColor);

  if (!trimmedLabel) {
    return null;
  }

  if (jobColor) {
    return {
      kind: "job",
      label: trimmedLabel,
      ...darkenTone(
        {
          backgroundColor: jobColor,
          borderColor: jobBorderColor ?? jobColor,
          textColor: jobTextColor ?? mobileColors.textMuted,
        },
        isDark,
      ),
    };
  }

  return {
    kind: "job",
    label: trimmedLabel,
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.border,
    textColor: mobileColors.textMuted,
  };
}

function buildDetailGeneralShiftChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: {
    jobColor?: string | null;
    jobBorderColor?: string | null;
    jobTextColor?: string | null;
  } | null,
): DetailChip | null {
  const chip = buildDetailJobChip(mobileColors, isDark, label, colorSource);

  if (!chip) {
    return null;
  }

  return {
    ...chip,
    kind: "general",
    eyebrowLabel: "General shift",
  };
}

function buildDetailAbsenceChip(
  mobileColors: MobileColors,
  isDark: boolean,
  label: string | null | undefined,
  colorSource?: AbsenceColorSource | null,
): DetailChip | null {
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
      label: trimmedLabel,
      eyebrowLabel: "Absence",
      ...darkenTone(
        {
          backgroundColor: absenceColor,
          borderColor: absenceBorderColor ?? absenceColor,
          textColor: absenceTextColor ?? mobileColors.textMuted,
        },
        isDark,
      ),
    };
  }

  return {
    kind: "absence",
    label: trimmedLabel,
    eyebrowLabel: "Absence",
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.border,
    textColor: mobileColors.textMuted,
  };
}

function isGeneralDetailSegment(segment: { shiftId?: number | null } | null | undefined): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

function hasMentoredSegments(
  segments: ReadonlyArray<{ isMentored?: boolean | null }> | null | undefined,
): boolean {
  return segments?.some((segment) => segment.isMentored === true) ?? false;
}

function getEntryJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  entry: MobileScheduleEntry,
): DetailChip | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return buildDetailAbsenceChip(
      mobileColors,
      isDark,
      getScheduleEntryTitle(entry),
      entry.presentation,
    );
  }

  const primarySegment = getScheduleEntrySegments(entry)[0] ?? null;

  if (isGeneralDetailSegment(primarySegment)) {
    return buildDetailGeneralShiftChip(
      mobileColors,
      isDark,
      getScheduleEntryTitle(entry),
      primarySegment,
    );
  }

  const segment = getScheduleEntrySegments(entry).find((item) => item.jobName) ?? null;
  const label = segment?.jobName?.trim() ?? "";

  if (!label) {
    return null;
  }

  return buildDetailJobChip(mobileColors, isDark, label, segment);
}

function buildSegmentJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  segment: MobileScheduleEntrySegment,
): DetailChip | null {
  if (isGeneralDetailSegment(segment)) {
    return buildDetailGeneralShiftChip(
      mobileColors,
      isDark,
      segment.shiftName ?? segment.label ?? null,
      segment,
    );
  }

  const label = segment.jobName?.trim() ?? "";

  if (!label) {
    return null;
  }

  return buildDetailJobChip(mobileColors, isDark, label, segment);
}

function MentoredPill() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text style={styles.mentoredPillText}>Mentored</Text>
    </View>
  );
}

export default function ShiftDetailScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDark = useIsDarkMode();
  const params = useLocalSearchParams<{
    employeeId?: string;
    date?: string;
    rangeStart?: string;
    rangeEnd?: string;
    source?: string;
  }>();
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [requestMode, setRequestMode] = useState<RequestMode>(null);
  const [coverageRequestType, setCoverageRequestType] = useState<CoverageRequestType>(null);
  const [selectedTargetShift, setSelectedTargetShift] = useState<{
    employeeId: string;
    date: string;
    segmentIndex?: number;
  } | null>(null);
  const [selectedRequesterSegmentIndex, setSelectedRequesterSegmentIndex] = useState(0);
  const [selectedSwapDate, setSelectedSwapDate] = useState<string | null>(null);
  const [swapWeekStartDate, setSwapWeekStartDate] = useState<string | null>(null);
  const [selectedTargetedPickupEmployeeId, setSelectedTargetedPickupEmployeeId] = useState<
    string | null
  >(null);
  const [selectedCalloffAbsenceTypeId, setSelectedCalloffAbsenceTypeId] = useState<number | null>(
    null,
  );
  const [pendingConfirmation, setPendingConfirmation] = useState<ShiftDetailConfirmation>(null);

  const employeeId = readParam(params.employeeId);
  const shiftDate = readParam(params.date);
  const range = {
    startDate: readParam(params.rangeStart) ?? shiftDate ?? "",
    endDate: readParam(params.rangeEnd) ?? shiftDate ?? "",
  };
  const activeSwapWeekStart =
    swapWeekStartDate ??
    (range.startDate
      ? getScheduleWeekStartDate(range.startDate)
      : shiftDate
        ? getScheduleWeekStartDate(shiftDate)
        : null);
  const source = readParam(params.source) === "team" ? "team" : "mine";
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const linkedEmployeeFocusAreaIds = bootstrapQuery.data?.linkedEmployee?.focusAreaIds ?? [];
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const todayDateKey = getCurrentDateTimeParts(timeZone).dateKey;
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.permissions.canViewSchedule
    : false;
  const absenceTypes = bootstrapQuery.data?.absenceTypes ?? [];
  const activeAbsenceTypes = absenceTypes;
  const needsTeamScheduleForShift = source === "team" || employeeId !== linkedEmployeeId;
  const myScheduleRange = range;
  const teamScheduleRange = useMemo(() => {
    if (requestMode !== "swap") {
      return range;
    }

    return {
      startDate: range.startDate,
      endDate: addDaysIso(range.startDate, SWAP_SCHEDULE_LOOKAHEAD_DAYS - 1),
    };
  }, [range, requestMode]);

  const myScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      accessToken,
      myScheduleRange.startDate,
      myScheduleRange.endDate,
    ],
    queryFn: () => getMySchedule(accessToken!, myScheduleRange),
    enabled:
      Boolean(accessToken) &&
      Boolean(myScheduleRange.startDate) &&
      Boolean(myScheduleRange.endDate),
  });
  const teamScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      "team",
      accessToken,
      teamScheduleRange.startDate,
      teamScheduleRange.endDate,
    ],
    queryFn: () => getOrgSchedule(accessToken!, teamScheduleRange),
    enabled:
      Boolean(accessToken) &&
      Boolean(teamScheduleRange.startDate) &&
      Boolean(teamScheduleRange.endDate) &&
      (canViewTeamSchedule || needsTeamScheduleForShift),
  });
  const swapOptionsQuery = useQuery({
    queryKey: [
      "mobile",
      "shift-swap-options",
      accessToken,
      linkedEmployeeId,
      shiftDate,
      teamScheduleRange.startDate,
      teamScheduleRange.endDate,
    ],
    queryFn: () =>
      getShiftSwapOptions(accessToken!, {
        requesterEmpId: linkedEmployeeId!,
        requesterShiftDate: shiftDate!,
        startDate: teamScheduleRange.startDate,
        endDate: teamScheduleRange.endDate,
      }),
    enabled:
      Boolean(accessToken) &&
      Boolean(linkedEmployeeId) &&
      Boolean(shiftDate) &&
      Boolean(teamScheduleRange.startDate) &&
      Boolean(teamScheduleRange.endDate) &&
      requestMode === "swap",
  });
  const requestsQuery = useQuery({
    queryKey: ["mobile", "requests", accessToken, range.startDate, range.endDate],
    queryFn: () => getShiftRequests(accessToken!, range),
    enabled:
      Boolean(accessToken) &&
      Boolean(linkedEmployeeId) &&
      Boolean(range.startDate) &&
      Boolean(range.endDate),
  });
  const peopleQuery = useQuery({
    queryKey: ["mobile", "people", accessToken],
    queryFn: () => getPeople(accessToken!),
    enabled: Boolean(accessToken) && requestMode === "coverage" && coverageRequestType === "pickup",
  });
  const createRequestMutation = useMutation({
    mutationFn: (input: {
      type: "pickup" | "swap" | "calloff";
      requesterEmpId: string;
      requesterShiftDate: string;
      requesterSegmentIndex?: number;
      targetEmpId?: string;
      targetShiftDate?: string;
      targetSegmentIndex?: number;
      absenceTypeId?: number;
    }) => createShiftRequest(accessToken!, input),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not create request",
        fallbackMessage: "We couldn't create that request.",
      });
    },
    onSuccess: async (_, variables) => {
      pushToast({
        tone: "success",
        title: "Request sent",
        message:
          variables.type === "calloff"
            ? "Calloff request sent."
            : variables.type === "swap"
              ? "Swap request sent."
              : "Pickup request sent.",
      });
      setRequestMode(null);
      setCoverageRequestType(null);
      setSelectedTargetShift(null);
      setSelectedRequesterSegmentIndex(0);
      setSelectedSwapDate(null);
      setSwapWeekStartDate(null);
      setSelectedTargetedPickupEmployeeId(null);
      setSelectedCalloffAbsenceTypeId(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile", "requests"] });
    },
  });

  const scheduleEntries = useMemo(() => {
    const entries = [
      ...(myScheduleQuery.data?.entries ?? []),
      ...(teamScheduleQuery.data?.entries ?? []),
      ...(swapOptionsQuery.data?.entries ?? []),
    ];

    return entries.filter((entry, index, collection) => {
      const entryKey = getScheduleEntryIdentityKey(entry);

      return (
        collection.findIndex((candidate) => getScheduleEntryIdentityKey(candidate) === entryKey) ===
        index
      );
    });
  }, [
    myScheduleQuery.data?.entries,
    swapOptionsQuery.data?.entries,
    teamScheduleQuery.data?.entries,
  ]);

  const shiftEntry =
    scheduleEntries.find((entry) => {
      return entry.employeeId === employeeId && entry.date === shiftDate;
    }) ?? null;
  const shouldCheckExistingRequests = Boolean(
    shiftEntry && linkedEmployeeId && shiftEntry.employeeId === linkedEmployeeId,
  );
  const activeShiftRequest = useMemo(() => {
    if (!shouldCheckExistingRequests || !shiftEntry || !linkedEmployeeId) {
      return null;
    }

    return (
      (requestsQuery.data?.requests ?? []).find(
        (request) =>
          request.requesterEmpId === linkedEmployeeId &&
          request.requesterShiftDate === shiftEntry.date &&
          ACTIVE_SHIFT_REQUEST_STATUSES.has(request.status),
      ) ?? null
    );
  }, [linkedEmployeeId, requestsQuery.data?.requests, shiftEntry, shouldCheckExistingRequests]);
  const isCheckingExistingRequests = shouldCheckExistingRequests && requestsQuery.isLoading;
  const shiftRequestCheckError =
    shouldCheckExistingRequests && requestsQuery.error
      ? getQueryErrorMessage(
          requestsQuery.error,
          "We couldn't verify existing requests for this shift.",
        )
      : null;
  const shiftmates = useMemo(() => {
    if (!shiftEntry) {
      return [];
    }

    const matchingEntries = scheduleEntries.filter((entry) => {
      return (
        entry.date === shiftEntry.date &&
        entry.employeeId !== shiftEntry.employeeId &&
        getScheduleEntryAbsenceTypeId(entry) == null &&
        entriesHaveMatchingShiftAndFocusArea(shiftEntry, entry)
      );
    });
    const activeCategoryKey = getScheduleEntryCategoryKey(shiftEntry);
    const matchingGroup = buildScheduleShiftGroups(matchingEntries).find(
      (group) => group.key === activeCategoryKey,
    );

    return matchingGroup?.entries ?? sortScheduleEntries(matchingEntries);
  }, [scheduleEntries, shiftEntry]);
  const employeeSeniorityById = useMemo(() => {
    const seniorityById = new Map<string, number>();

    for (const person of peopleQuery.data?.people ?? []) {
      seniorityById.set(person.id, person.seniority);
    }

    for (const entry of teamScheduleQuery.data?.entries ?? []) {
      if (entry.employeeSeniority == null) {
        continue;
      }

      const existing = seniorityById.get(entry.employeeId);
      if (existing == null || entry.employeeSeniority < existing) {
        seniorityById.set(entry.employeeId, entry.employeeSeniority);
      }
    }

    return seniorityById;
  }, [peopleQuery.data?.people, teamScheduleQuery.data?.entries]);
  const swapTargetOptions = useMemo(() => {
    if (!shiftEntry || !linkedEmployeeId) {
      return [];
    }

    const requesterCategoryKey = getScheduleEntryCategoryKey(shiftEntry);
    const requesterRequiredFocusAreaIds = getScheduleEntryRequiredFocusAreaIds(shiftEntry);

    return (swapOptionsQuery.data?.entries ?? []).filter((entry) => {
      if (
        entry.employeeId === linkedEmployeeId ||
        !hasAnyRequestableScheduleEntrySegment(entry, timeZone) ||
        getScheduleEntryAbsenceTypeId(entry) != null ||
        !hasScheduledWorkedAssignment(entry)
      ) {
        return false;
      }

      if (
        !canWorkRequiredFocusAreas(
          linkedEmployeeFocusAreaIds,
          getScheduleEntryRequiredFocusAreaIds(entry),
        )
      ) {
        return false;
      }

      if (!canWorkRequiredFocusAreas(entry.employeeFocusAreaIds, requesterRequiredFocusAreaIds)) {
        return false;
      }

      if (entry.date === shiftEntry.date) {
        if (getScheduleEntryCategoryKey(entry) === requesterCategoryKey) {
          return false;
        }

        return !entriesHaveOverlappingTimes(shiftEntry, entry);
      }

      const requesterExistingShift =
        scheduleEntries.find(
          (candidate) => candidate.employeeId === linkedEmployeeId && candidate.date === entry.date,
        ) ?? null;
      if (entriesHaveOverlappingTimes(requesterExistingShift, entry)) {
        return false;
      }

      const targetExistingShift =
        scheduleEntries.find(
          (candidate) =>
            candidate.employeeId === entry.employeeId && candidate.date === shiftEntry.date,
        ) ?? null;

      return !entriesHaveOverlappingTimes(targetExistingShift, shiftEntry);
    });
  }, [
    linkedEmployeeId,
    linkedEmployeeFocusAreaIds,
    scheduleEntries,
    shiftEntry,
    swapOptionsQuery.data?.entries,
    timeZone,
  ]);
  const swapSections = useMemo(
    () => buildScheduleSections(swapTargetOptions, "team", timeZone),
    [swapTargetOptions, timeZone],
  );
  const swapCountsByDate = useMemo(
    () => new Map(swapSections.map((section) => [section.date, section.entries.length])),
    [swapSections],
  );
  const swapNavigationDates = useMemo(
    () =>
      getDateRange(teamScheduleRange.startDate, teamScheduleRange.endDate).filter(
        (date) => date >= todayDateKey,
      ),
    [teamScheduleRange.endDate, teamScheduleRange.startDate, todayDateKey],
  );
  const eligibleSwapWeekStarts = useMemo(() => {
    const seen = new Set<string>();
    const weekStarts: string[] = [];

    for (const date of swapNavigationDates) {
      if ((swapCountsByDate.get(date) ?? 0) === 0) {
        continue;
      }

      const weekStart = getScheduleWeekStartDate(date);
      if (!seen.has(weekStart)) {
        seen.add(weekStart);
        weekStarts.push(weekStart);
      }
    }

    return weekStarts.sort();
  }, [swapCountsByDate, swapNavigationDates]);
  const previousEligibleSwapWeekStart =
    activeSwapWeekStart == null
      ? null
      : ([...eligibleSwapWeekStarts]
          .reverse()
          .find((weekStart) => weekStart < activeSwapWeekStart) ?? null);
  const nextEligibleSwapWeekStart =
    activeSwapWeekStart == null
      ? null
      : (eligibleSwapWeekStarts.find((weekStart) => weekStart > activeSwapWeekStart) ?? null);
  const swapWeekDates = useMemo(
    () => (activeSwapWeekStart ? getWeekDates(activeSwapWeekStart) : []),
    [activeSwapWeekStart],
  );
  const swapSectionsByDate = useMemo(
    () => new Map(swapSections.map((section) => [section.date, section])),
    [swapSections],
  );
  const selectedTargetEntry =
    selectedTargetShift == null
      ? null
      : (swapTargetOptions.find((entry) => {
          return (
            entry.employeeId === selectedTargetShift.employeeId &&
            entry.date === selectedTargetShift.date
          );
        }) ?? null);
  const selectedSwapDateIsAvailable = selectedSwapDate
    ? swapWeekDates.includes(selectedSwapDate)
    : false;
  const firstEligibleSwapDate =
    swapWeekDates.find((date) => swapSectionsByDate.has(date)) ?? swapWeekDates[0] ?? null;
  const activeSwapDate =
    selectedTargetEntry?.date ??
    (selectedSwapDateIsAvailable ? selectedSwapDate : null) ??
    firstEligibleSwapDate ??
    null;
  const activeSwapSection =
    activeSwapDate == null ? null : (swapSectionsByDate.get(activeSwapDate) ?? null);
  const visibleSwapTargetOptions = activeSwapSection?.entries ?? [];
  const targetedPickupOptions = useMemo(() => {
    if (!shiftEntry || !linkedEmployeeId) {
      return [];
    }

    const requesterRequiredFocusAreaIds = getScheduleEntryRequiredFocusAreaIds(shiftEntry);

    return (teamScheduleQuery.data?.entries ?? [])
      .filter((entry) => {
        return (
          entry.date === shiftEntry.date &&
          entry.employeeId !== linkedEmployeeId &&
          entry.publishedAt != null &&
          getScheduleEntryAbsenceTypeId(entry) != null &&
          canWorkRequiredFocusAreas(entry.employeeFocusAreaIds, requesterRequiredFocusAreaIds)
        );
      })
      .sort((left, right) => {
        const seniorityComparison =
          (employeeSeniorityById.get(left.employeeId) ??
            left.employeeSeniority ??
            Number.MAX_SAFE_INTEGER) -
          (employeeSeniorityById.get(right.employeeId) ??
            right.employeeSeniority ??
            Number.MAX_SAFE_INTEGER);

        if (seniorityComparison !== 0) {
          return seniorityComparison;
        }

        return left.employeeName.localeCompare(right.employeeName);
      });
  }, [employeeSeniorityById, linkedEmployeeId, shiftEntry, teamScheduleQuery.data?.entries]);
  const selectedTargetedPickupEntry = selectedTargetedPickupEmployeeId
    ? (targetedPickupOptions.find(
        (entry) => entry.employeeId === selectedTargetedPickupEmployeeId,
      ) ?? null)
    : null;
  const selectedCalloffAbsenceType =
    selectedCalloffAbsenceTypeId == null
      ? null
      : (activeAbsenceTypes.find(
          (absenceType) => absenceType.id === selectedCalloffAbsenceTypeId,
        ) ?? null);
  const canCreateRequestsForShift = Boolean(
    shiftEntry &&
    linkedEmployeeId &&
    shiftEntry.employeeId === linkedEmployeeId &&
    hasAnyRequestableScheduleEntrySegment(shiftEntry, timeZone) &&
    getScheduleEntryAbsenceTypeId(shiftEntry) == null &&
    hasWorkedAssignment(shiftEntry) &&
    !isCheckingExistingRequests &&
    !shiftRequestCheckError &&
    !activeShiftRequest,
  );
  const canCreateSwapForShift = Boolean(
    canCreateRequestsForShift && shiftEntry && hasScheduledWorkedAssignment(shiftEntry),
  );
  const canSubmitRequest = Boolean(
    linkedEmployeeId && shiftEntry && requestMode === "swap" && selectedTargetEntry,
  );
  const contentState = getMobileQueryContentState({
    hasData: Boolean(shiftEntry) && Boolean(bootstrapQuery.data),
    isLoading:
      bootstrapQuery.isLoading ||
      myScheduleQuery.isLoading ||
      (needsTeamScheduleForShift && teamScheduleQuery.isLoading),
    error:
      bootstrapQuery.error ??
      myScheduleQuery.error ??
      (needsTeamScheduleForShift ? teamScheduleQuery.error : null),
  });
  const timeRange = shiftEntry ? getScheduleEntryTimeRange(shiftEntry) : null;
  const shiftSegments = shiftEntry ? getScheduleEntrySegments(shiftEntry) : [];
  const actionSegmentOptions = shiftEntry ? getActionSegmentOptions(shiftEntry) : [];
  const firstRequestableRequesterSegmentIndex =
    shiftEntry == null
      ? 0
      : (actionSegmentOptions.find(
          (option) => !hasScheduleEntrySegmentStarted(shiftEntry, timeZone, option.segmentIndex),
        )?.segmentIndex ?? 0);
  const requesterSegmentIndexForRequest =
    actionSegmentOptions.length > 1 ? selectedRequesterSegmentIndex : undefined;
  const selectedRequesterShiftLabel = shiftEntry
    ? getActionSegmentLabel(shiftEntry, selectedRequesterSegmentIndex)
    : "";
  const splitSegments = shiftEntry ? getSplitShiftSegmentsForEntry(shiftEntry) : [];
  const hasSplitShift = splitSegments.length > 1;
  const shiftmateSegmentGroups = useMemo(
    () => (hasSplitShift ? buildShiftmateSegmentGroups(shiftEntry, scheduleEntries) : []),
    [hasSplitShift, scheduleEntries, shiftEntry],
  );
  const hasGroupedShiftmates = shiftmateSegmentGroups.some((group) => group.entries.length > 0);
  const hasMultipleSegments = shiftSegments.length > 1;
  const primarySegment = shiftSegments[0] ?? null;
  const primarySegmentTimeRange = primarySegment
    ? getScheduleEntrySegmentTimeRange(primarySegment)
    : null;
  const publishedAtLabel = shiftEntry ? formatPublishedAt(shiftEntry.publishedAt, timeZone) : null;
  const publishedSummary = shiftEntry
    ? formatPublishedSummary(shiftEntry.publishedByName, publishedAtLabel)
    : null;
  const focusAreaName = shiftEntry ? getScheduleEntryDisplayFocusAreaName(shiftEntry) : null;
  const jobChip = shiftEntry ? getEntryJobChip(mobileColors, isDark, shiftEntry) : null;
  let detailCardTitle = shiftEntry ? getScheduleEntryTitle(shiftEntry) : "";

  if (hasSplitShift) {
    detailCardTitle = "Multiple Shifts";
  } else if (hasMultipleSegments) {
    detailCardTitle = "Shifts";
  }
  const isViewingOtherEmployee = Boolean(shiftEntry && shiftEntry.employeeId !== linkedEmployeeId);
  const detailTitleChip = !hasMultipleSegments ? jobChip : null;
  const shouldRenderTitlePills = Boolean(
    hasSplitShift || detailTitleChip || primarySegment?.isMentored,
  );

  const shouldShowShiftmates = Boolean(
    canViewTeamSchedule &&
    shiftEntry &&
    getScheduleEntryAbsenceTypeId(shiftEntry) == null &&
    !isGeneralDetailEntry(shiftEntry),
  );
  const shouldRenderShiftmatesSection = Boolean(
    shouldShowShiftmates &&
    (teamScheduleQuery.isLoading ||
      teamScheduleQuery.error ||
      shiftmates.length > 0 ||
      hasGroupedShiftmates),
  );
  const manualRefresh = useManualRefresh(() =>
    Promise.all([
      bootstrapQuery.refetch(),
      myScheduleQuery.refetch(),
      teamScheduleQuery.refetch(),
      requestsQuery.refetch(),
      swapOptionsQuery.refetch(),
    ]),
  );

  function resetRequestMode(nextMode: RequestMode) {
    setRequestMode(nextMode);
    setCoverageRequestType(null);
    setSelectedTargetShift(null);
    setSelectedRequesterSegmentIndex(firstRequestableRequesterSegmentIndex);
    setSelectedSwapDate(null);
    setSwapWeekStartDate(
      nextMode === "swap"
        ? range.startDate
          ? getScheduleWeekStartDate(range.startDate)
          : shiftDate
            ? getScheduleWeekStartDate(shiftDate)
            : null
        : null,
    );
    setSelectedTargetedPickupEmployeeId(null);
    setSelectedCalloffAbsenceTypeId(null);
  }

  function submitSwapRequest() {
    if (!linkedEmployeeId || !shiftEntry || requestMode !== "swap") {
      return;
    }

    if (!selectedTargetShift) {
      return;
    }

    createRequestMutation.mutate({
      type: "swap",
      requesterEmpId: linkedEmployeeId,
      requesterShiftDate: shiftEntry.date,
      requesterSegmentIndex: requesterSegmentIndexForRequest,
      targetEmpId: selectedTargetShift?.employeeId,
      targetShiftDate: selectedTargetShift?.date,
      targetSegmentIndex: selectedTargetShift?.segmentIndex,
    });
  }

  function submitCoverageRequest(
    type: "pickup" | "calloff",
    options?: {
      absenceTypeId?: number;
      targetEmpId?: string;
      targetShiftDate?: string;
    },
  ) {
    if (!linkedEmployeeId || !shiftEntry) {
      return;
    }

    if (type === "calloff" && options?.absenceTypeId == null) {
      return;
    }

    createRequestMutation.mutate({
      type,
      requesterEmpId: linkedEmployeeId,
      requesterShiftDate: shiftEntry.date,
      requesterSegmentIndex: requesterSegmentIndexForRequest,
      targetEmpId: options?.targetEmpId,
      targetShiftDate: options?.targetShiftDate,
      absenceTypeId: options?.absenceTypeId,
    });
  }

  function confirmCoverageRequest(
    type: "pickup" | "calloff",
    options?: { absenceTypeId?: number; absenceTypeLabel?: string },
  ) {
    if (!shiftEntry) {
      return;
    }

    const shiftLabel = selectedRequesterShiftLabel;
    const shiftDateLabel = formatShiftDate(shiftEntry.date);

    setPendingConfirmation({
      title: type === "pickup" ? "Offer this shift for pickup?" : "Submit this call-off?",
      body:
        type === "pickup"
          ? `Your ${shiftLabel} shift on ${shiftDateLabel} will be offered to teammates for pickup.`
          : `${indefiniteArticle(options?.absenceTypeLabel ?? "selected") === "an" ? "An" : "A"} ${options?.absenceTypeLabel ?? "selected"} absence will be submitted for your ${shiftLabel} shift on ${shiftDateLabel}.`,
      confirmLabel: type === "pickup" ? "Offer Shift" : "Submit Call-off",
      confirmTone: type === "calloff" ? "dangerFilled" : "primary",
      onConfirm: () =>
        submitCoverageRequest(type, {
          absenceTypeId: options?.absenceTypeId,
        }),
    });
  }

  function confirmTargetedPickupRequest(entry: MobileScheduleEntry) {
    if (!shiftEntry) {
      return;
    }

    const shiftLabel = selectedRequesterShiftLabel;
    const shiftDateLabel = formatShiftDate(shiftEntry.date);
    const absenceTypeId = getScheduleEntryAbsenceTypeId(entry);
    const absenceTypeLabel = getAbsenceTypeLabelForEntry(activeAbsenceTypes, entry);

    if (absenceTypeId == null) {
      return;
    }

    setPendingConfirmation({
      title: "Send a pickup request?",
      body: `${entry.employeeName} will be asked to pick up your ${shiftLabel} shift on ${shiftDateLabel} so you can use ${absenceTypeLabel}.`,
      confirmLabel: "Send Request",
      onConfirm: () =>
        submitCoverageRequest("pickup", {
          targetEmpId: entry.employeeId,
          targetShiftDate: shiftEntry.date,
          absenceTypeId,
        }),
    });
  }

  function handleSubmitRequest() {
    if (!shiftEntry || !selectedTargetShift || !selectedTargetEntry) {
      return;
    }

    const requesterLabel = selectedRequesterShiftLabel;
    const targetLabel = getActionSegmentLabel(
      selectedTargetEntry,
      selectedTargetShift.segmentIndex ?? 0,
    );

    setPendingConfirmation({
      title: "Send this swap request?",
      body: `You'll swap your ${requesterLabel} shift on ${formatShiftDate(shiftEntry.date)} for ${selectedTargetEntry.employeeName}'s ${targetLabel} shift on ${formatShiftDate(selectedTargetEntry.date)}.`,
      confirmLabel: "Send Swap",
      onConfirm: submitSwapRequest,
    });
  }

  function handleSwapWeek(delta: 1 | -1) {
    const nextWeekStart = delta < 0 ? previousEligibleSwapWeekStart : nextEligibleSwapWeekStart;

    if (!nextWeekStart) {
      return;
    }

    const firstEligibleDate =
      getWeekDates(nextWeekStart).find((date) => swapSectionsByDate.has(date)) ?? nextWeekStart;

    setSwapWeekStartDate(nextWeekStart);
    setSelectedSwapDate(firstEligibleDate);
    setSelectedTargetShift(null);
  }

  return (
    <Screen
      bottomPaddingMode="stack"
      title="Shift Detail"
      subtitle="Shift Detail"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading shift</Text>
          <Text style={styles.loadingBody}>Getting the latest shift details.</Text>
          <DetailSkeleton sections={2} />
        </View>
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load shift"
          variant="centered"
          onAction={() => {
            void Promise.all([
              bootstrapQuery.refetch(),
              myScheduleQuery.refetch(),
              teamScheduleQuery.refetch(),
            ]);
          }}
        />
      ) : !employeeId || !shiftDate || !shiftEntry ? (
        <EmptyStateCard
          fillScreen
          body="This shift isn't in the schedule range you're viewing."
          iconName="calendar-clear-outline"
          title="Shift not found"
        />
      ) : (
        <>
          <View style={styles.shiftDetailCard} testID="shift-detail-card">
            <View style={styles.detailHeroHeader}>
              <View style={styles.detailHeroCopy}>
                <Text style={styles.detailHeroTitle}>{detailCardTitle}</Text>
                {shouldRenderTitlePills ? (
                  <View style={styles.detailHeroPillRow}>
                    {hasSplitShift ? (
                      <SplitShiftBadge count={splitSegments.length} compact />
                    ) : detailTitleChip || primarySegment?.isMentored ? (
                      <DetailHeaderJobPill
                        chip={detailTitleChip}
                        isMentored={primarySegment?.isMentored === true}
                      />
                    ) : null}
                  </View>
                ) : null}
                {isViewingOtherEmployee && shiftEntry.employeeName ? (
                  <Text style={styles.detailEmployeeName}>{shiftEntry.employeeName}</Text>
                ) : null}
              </View>
              <DetailDateTile date={shiftEntry.date} />
            </View>

            <View style={styles.detailInfoStack}>
              {hasSplitShift ? (
                <ShiftEntrySegmentList
                  entry={shiftEntry}
                  showSegmentLabels={false}
                  variant="detail"
                />
              ) : null}
              {hasSplitShift && canCreateRequestsForShift ? (
                <Text style={styles.detailSplitNotice}>
                  Drop and swap actions apply to the shift you choose.
                </Text>
              ) : null}
              {!hasMultipleSegments && focusAreaName ? (
                <DetailInfoRow
                  iconBackgroundColor={mobileColors.successSoft}
                  iconColor="#059669"
                  iconName="location-outline"
                  label="Focus area"
                  value={focusAreaName}
                />
              ) : null}
              {!hasMultipleSegments && timeRange ? (
                <DetailInfoRow
                  iconBackgroundColor={mobileColors.brandSoft}
                  iconColor={mobileColors.brand}
                  iconName="time-outline"
                  label="Shift time"
                  value={timeRange}
                />
              ) : null}
            </View>

            {canCreateRequestsForShift ? (
              <View style={styles.detailActionsRow}>
                <DetailActionButton
                  disabled={createRequestMutation.isPending}
                  iconName="exit-outline"
                  label="Drop shift"
                  onPress={() => resetRequestMode("coverage")}
                  tone="neutral"
                />
                {canCreateSwapForShift ? (
                  <DetailActionButton
                    disabled={createRequestMutation.isPending}
                    iconName="swap-horizontal-outline"
                    label="Swap"
                    onPress={() => resetRequestMode("swap")}
                    tone="secondary"
                  />
                ) : null}
              </View>
            ) : null}

            {publishedSummary ? (
              <DetailPublishedFooter
                publishedAtLabel={publishedAtLabel}
                publishedByName={shiftEntry.publishedByName}
                summary={publishedSummary}
              />
            ) : null}
          </View>

          {shouldRenderShiftmatesSection ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Working with</Text>
              {teamScheduleQuery.isLoading ? (
                <ListSkeleton rows={2} showSectionHeader={false} />
              ) : teamScheduleQuery.error ? (
                <StatusBanner
                  body={getQueryErrorMessage(
                    teamScheduleQuery.error,
                    "We couldn't load who is working with you right now.",
                  )}
                  title="Could not load working-with list"
                />
              ) : (
                <>
                  {hasSplitShift ? (
                    <ShiftmateSegmentGroups
                      groups={shiftmateSegmentGroups}
                      linkedEmployeeId={linkedEmployeeId}
                    />
                  ) : (
                    <View style={styles.shiftmatesList}>
                      {shiftmates.map((entry, index) => (
                        <ShiftmateRow
                          key={`${entry.employeeId}-${entry.date}`}
                          entry={entry}
                          groupFocusAreaName={focusAreaName}
                          groupTimeRange={timeRange}
                          isFirst={index === 0}
                          linkedEmployeeId={linkedEmployeeId}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          ) : null}

          {isCheckingExistingRequests ? (
            <StatusBanner
              body="Making sure this shift does not already have a request in progress."
              tone="info"
              title="Checking existing requests"
            />
          ) : null}
          {activeShiftRequest ? (
            <Card
              title="Request already in progress"
              body={`Your ${formatShiftRequestType(activeShiftRequest.type).toLowerCase()} request is ${formatShiftRequestStatus(activeShiftRequest.status).toLowerCase()} for this shift.`}
              detail={
                activeShiftRequest.adminNote ? (
                  <Text style={styles.detailFootnote}>
                    Manager note: {activeShiftRequest.adminNote}
                  </Text>
                ) : undefined
              }
            />
          ) : null}
          {shiftRequestCheckError ? (
            <StatusBanner
              actionLabel="Refresh"
              body={shiftRequestCheckError}
              title="Could not verify existing requests"
              onAction={() => {
                void requestsQuery.refetch();
              }}
            />
          ) : null}
        </>
      )}
      <Modal
        animationType="slide"
        allowSwipeDismissal
        onRequestClose={() => resetRequestMode(null)}
        presentationStyle={getRequestModalPresentationStyle(requestMode)}
        visible={requestMode != null}
      >
        <Screen
          bottomPaddingMode="modal"
          stickyHeader={
            <ModalHeader
              closeDisabled={createRequestMutation.isPending}
              title={getRequestModeTitle(requestMode)}
              onClose={() => resetRequestMode(null)}
            />
          }
          stickyHeaderTopPadding={15}
        >
          <View style={styles.modalContent}>
            {actionSegmentOptions.length > 1 && shiftEntry ? (
              <ActionSegmentSelector
                disabled={createRequestMutation.isPending}
                entry={shiftEntry}
                isOptionDisabled={(segmentIndex) =>
                  hasScheduleEntrySegmentStarted(shiftEntry, timeZone, segmentIndex)
                }
                options={actionSegmentOptions}
                selectedIndex={selectedRequesterSegmentIndex}
                onSelect={setSelectedRequesterSegmentIndex}
              />
            ) : null}
            {requestMode === "coverage" ? (
              <View style={styles.subsection}>
                <Text style={styles.subsectionBody}>Choose how you want to drop this shift.</Text>
                <View style={styles.coverageOptionList}>
                  <CoverageOptionCard
                    active={coverageRequestType === "pickup"}
                    body="Post the shift for teammates to claim. It stays yours unless someone claims it and approval completes."
                    disabled={createRequestMutation.isPending}
                    onPress={() => {
                      setCoverageRequestType("pickup");
                      setSelectedCalloffAbsenceTypeId(null);
                    }}
                    title="Offer for pickup"
                    tone="neutral"
                  />
                  <CoverageOptionCard
                    active={coverageRequestType === "calloff"}
                    body="Use this when you cannot work the shift yourself. Approval records the absence and opens coverage automatically."
                    disabled={createRequestMutation.isPending || activeAbsenceTypes.length === 0}
                    onPress={() => {
                      setCoverageRequestType("calloff");
                      setSelectedTargetedPickupEmployeeId(null);
                    }}
                    title="Call off"
                    tone="danger"
                  />
                </View>
                {activeAbsenceTypes.length === 0 ? (
                  <Text style={styles.coverageNotice}>
                    Call off is unavailable until at least one active absence type is set up.
                  </Text>
                ) : null}
                {coverageRequestType === "pickup" ? (
                  <View style={styles.modalInlinePanel}>
                    <Text style={styles.subsectionLabel}>Offer for pickup</Text>
                    {selectedTargetedPickupEntry ? null : (
                      <Button
                        disabled={createRequestMutation.isPending}
                        label="Offer to everyone"
                        onPress={() => confirmCoverageRequest("pickup")}
                      />
                    )}
                    <Text style={styles.subsectionLabel}>Request specific person</Text>
                    <Text style={styles.subsectionBody}>
                      {selectedTargetedPickupEntry
                        ? "Review your request below, then submit."
                        : "Only teammates with an absence on this date are shown."}
                    </Text>
                    <View style={styles.swapDateFilteredList}>
                      {targetedPickupOptions.length === 0 ? (
                        <EmptyStateCard
                          compact
                          iconName="person-remove-outline"
                          title="No absent teammates on this date"
                        />
                      ) : (
                        <View style={styles.swapOptions}>
                          {(selectedTargetedPickupEntry
                            ? [selectedTargetedPickupEntry]
                            : targetedPickupOptions
                          ).map((entry) => (
                            <SwapOptionCard
                              key={`${entry.employeeId}-${entry.date}`}
                              active={selectedTargetedPickupEmployeeId === entry.employeeId}
                              disabled={createRequestMutation.isPending}
                              detailLabel={getPickupTargetDetailLabel(activeAbsenceTypes, entry)}
                              entry={entry}
                              showSegments={false}
                              onPress={() => {
                                setSelectedTargetedPickupEmployeeId(
                                  selectedTargetedPickupEmployeeId === entry.employeeId
                                    ? null
                                    : entry.employeeId,
                                );
                              }}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}
                {coverageRequestType === "calloff" ? (
                  <View style={styles.modalInlinePanel}>
                    <Text style={styles.subsectionLabel}>
                      {selectedCalloffAbsenceType ? "Absence reason" : "Select absence reason"}
                    </Text>
                    {selectedCalloffAbsenceType ? (
                      <Text style={styles.subsectionBody}>
                        Review your call-off below, then submit.
                      </Text>
                    ) : null}
                    <View style={styles.selectorWrap}>
                      {(selectedCalloffAbsenceType
                        ? [selectedCalloffAbsenceType]
                        : activeAbsenceTypes
                      ).map((absenceType) => (
                        <SelectorChip
                          key={absenceType.id}
                          active={selectedCalloffAbsenceTypeId === absenceType.id}
                          disabled={createRequestMutation.isPending}
                          label={getAbsenceTypeOptionLabel(absenceType)}
                          onPress={() =>
                            setSelectedCalloffAbsenceTypeId(
                              selectedCalloffAbsenceTypeId === absenceType.id
                                ? null
                                : absenceType.id,
                            )
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {requestMode === "swap" ? (
              <View style={styles.subsection}>
                <Text style={styles.subsectionBody}>
                  {selectedTargetEntry
                    ? "Review the trade below, then submit your swap request."
                    : "Choose a teammate's published shift to trade dates or shift types. Same-code swaps are allowed when the date changes."}
                </Text>
                {shiftEntry ? (
                  <>
                    <View style={styles.swapSummaryList}>
                      <SwapSummaryCard
                        entry={shiftEntry}
                        label={selectedTargetEntry ? "You give" : "Your shift"}
                        segmentIndex={selectedRequesterSegmentIndex}
                      />
                      {selectedTargetEntry ? (
                        <SwapSummaryCard
                          entry={selectedTargetEntry}
                          label="You get"
                          segmentIndex={selectedTargetShift?.segmentIndex ?? 0}
                          summaryNote={`From ${selectedTargetEntry.employeeName}`}
                        />
                      ) : null}
                    </View>
                    <View style={styles.modalInlinePanel}>
                      <Text style={styles.subsectionLabel}>Eligible teammates</Text>
                      {swapOptionsQuery.isLoading ? (
                        <Text style={styles.subsectionBody}>
                          Loading teammate shifts for this range.
                        </Text>
                      ) : swapOptionsQuery.error ? (
                        <Text style={styles.subsectionBody}>
                          {getQueryErrorMessage(
                            swapOptionsQuery.error,
                            "We couldn't load teammate shifts.",
                          )}
                        </Text>
                      ) : swapTargetOptions.length === 0 ? (
                        <EmptyStateCard
                          compact
                          iconName="swap-horizontal-outline"
                          title="No eligible shifts"
                          body="Eligible teammate shifts will appear here once published."
                        />
                      ) : selectedTargetEntry ? (
                        <View style={styles.swapSelectedPanel}>
                          <Text style={styles.subsectionBody}>
                            {selectedTargetEntry.employeeName} is selected for{" "}
                            {formatShiftDate(selectedTargetEntry.date)}.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.swapDateFilteredList}>
                          <View style={styles.swapWeekNav}>
                            <Pressable
                              accessibilityLabel="Go to previous week"
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: previousEligibleSwapWeekStart == null,
                              }}
                              android_ripple={
                                previousEligibleSwapWeekStart == null
                                  ? undefined
                                  : { color: "rgba(15, 23, 42, 0.08)" }
                              }
                              disabled={previousEligibleSwapWeekStart == null}
                              onPress={() => handleSwapWeek(-1)}
                              style={({ pressed }) => [
                                styles.swapWeekNavButton,
                                pressed &&
                                  previousEligibleSwapWeekStart != null &&
                                  styles.swapWeekNavButtonPressed,
                                previousEligibleSwapWeekStart == null &&
                                  styles.swapWeekNavButtonDisabled,
                              ]}
                            >
                              <Ionicons
                                color={mobileColors.textSecondary}
                                name="chevron-back"
                                size={20}
                              />
                            </Pressable>
                            <Text style={styles.swapWeekRangeLabel}>
                              {activeSwapWeekStart ? formatWeekRangeLabel(activeSwapWeekStart) : ""}
                            </Text>
                            <Pressable
                              accessibilityLabel="Go to next week"
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: nextEligibleSwapWeekStart == null,
                              }}
                              android_ripple={
                                nextEligibleSwapWeekStart == null
                                  ? undefined
                                  : { color: "rgba(15, 23, 42, 0.08)" }
                              }
                              disabled={nextEligibleSwapWeekStart == null}
                              onPress={() => handleSwapWeek(1)}
                              style={({ pressed }) => [
                                styles.swapWeekNavButton,
                                pressed &&
                                  nextEligibleSwapWeekStart != null &&
                                  styles.swapWeekNavButtonPressed,
                                nextEligibleSwapWeekStart == null &&
                                  styles.swapWeekNavButtonDisabled,
                              ]}
                            >
                              <Ionicons
                                color={mobileColors.textSecondary}
                                name="chevron-forward"
                                size={20}
                              />
                            </Pressable>
                          </View>
                          <View
                            accessibilityLabel="Eligible swap dates"
                            style={styles.swapDateGrid}
                          >
                            {swapWeekDates.map((date) => (
                              <SwapDateChip
                                key={date}
                                active={date === activeSwapDate}
                                count={swapSectionsByDate.get(date)?.entries.length ?? 0}
                                date={date}
                                onPress={() => {
                                  setSelectedSwapDate(date);
                                  setSelectedTargetShift(null);
                                }}
                              />
                            ))}
                          </View>
                          {activeSwapSection ? (
                            <View style={styles.swapOptions}>
                              {visibleSwapTargetOptions.flatMap((entry) => {
                                const options = getActionSegmentOptions(entry);
                                const targetOptions =
                                  options.length > 1
                                    ? options.filter(
                                        (option) =>
                                          !hasScheduleEntrySegmentStarted(
                                            entry,
                                            timeZone,
                                            option.segmentIndex,
                                          ),
                                      )
                                    : options[0]
                                      ? hasScheduleEntrySegmentStarted(
                                          entry,
                                          timeZone,
                                          options[0].segmentIndex,
                                        )
                                        ? []
                                        : [options[0]]
                                      : [];

                                return targetOptions.map((option) => (
                                  <SwapOptionCard
                                    key={`${entry.employeeId}-${entry.date}-${option.segmentIndex}`}
                                    active={
                                      selectedTargetShift?.employeeId === entry.employeeId &&
                                      selectedTargetShift?.date === entry.date &&
                                      (selectedTargetShift.segmentIndex ?? 0) ===
                                        option.segmentIndex
                                    }
                                    entry={entry}
                                    segmentIndex={
                                      options.length > 1 ? option.segmentIndex : undefined
                                    }
                                    onPress={() =>
                                      setSelectedTargetShift({
                                        employeeId: entry.employeeId,
                                        date: entry.date,
                                        segmentIndex:
                                          options.length > 1 ? option.segmentIndex : undefined,
                                      })
                                    }
                                  />
                                ));
                              })}
                            </View>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </>
                ) : (
                  <Text style={styles.subsectionBody}>Refreshing shift details.</Text>
                )}
              </View>
            ) : null}

            {requestMode === "swap" && selectedTargetEntry && shiftEntry ? (
              <View style={styles.modalActionButtons}>
                <Button
                  disabled={createRequestMutation.isPending}
                  label="Back"
                  onPress={() => {
                    setSelectedSwapDate(selectedTargetEntry.date);
                    setSelectedTargetShift(null);
                  }}
                  tone="neutral"
                />
                <Button
                  disabled={!canSubmitRequest || createRequestMutation.isPending}
                  label={createRequestMutation.isPending ? "Submitting..." : "Submit"}
                  onPress={handleSubmitRequest}
                />
              </View>
            ) : null}

            {requestMode === "coverage" &&
            coverageRequestType === "pickup" &&
            selectedTargetedPickupEntry &&
            shiftEntry ? (
              <View style={styles.modalActionButtons}>
                <Button
                  disabled={createRequestMutation.isPending}
                  label="Back"
                  onPress={() => setSelectedTargetedPickupEmployeeId(null)}
                  tone="neutral"
                />
                <Button
                  disabled={createRequestMutation.isPending}
                  label={createRequestMutation.isPending ? "Submitting..." : "Submit"}
                  onPress={() => confirmTargetedPickupRequest(selectedTargetedPickupEntry)}
                />
              </View>
            ) : null}

            {requestMode === "coverage" &&
            coverageRequestType === "calloff" &&
            selectedCalloffAbsenceType &&
            shiftEntry ? (
              <View style={styles.modalActionButtons}>
                <Button
                  disabled={createRequestMutation.isPending}
                  label="Back"
                  onPress={() => setSelectedCalloffAbsenceTypeId(null)}
                  tone="neutral"
                />
                <Button
                  disabled={createRequestMutation.isPending}
                  label={createRequestMutation.isPending ? "Submitting..." : "Submit"}
                  onPress={() =>
                    confirmCoverageRequest("calloff", {
                      absenceTypeId: selectedCalloffAbsenceType.id,
                      absenceTypeLabel: getAbsenceTypeOptionLabel(selectedCalloffAbsenceType),
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        </Screen>
      </Modal>
      <ConfirmationModal
        body={pendingConfirmation?.body}
        confirmLabel={pendingConfirmation?.confirmLabel ?? "Confirm"}
        confirmTone={pendingConfirmation?.confirmTone ?? "primary"}
        loading={createRequestMutation.isPending}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={() => {
          const action = pendingConfirmation?.onConfirm;
          setPendingConfirmation(null);
          action?.();
        }}
        title={pendingConfirmation?.title ?? "Confirm action?"}
        visible={pendingConfirmation != null}
      />
    </Screen>
  );
}

function getPickupTargetDetailLabel(
  absenceTypes: Array<{ id: number; label: string; name?: string | null }>,
  entry: MobileScheduleEntry,
) {
  return getAbsenceTypeLabelForEntry(absenceTypes, entry);
}

function DetailDateTile({ date }: { date: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const dateLabel = formatCompactScheduleDate(date);
  const dateParts = getCompactScheduleDateParts(date);

  return (
    <View accessibilityLabel={dateLabel} style={styles.detailDateTile}>
      <Text style={styles.detailDateWeekday}>{dateParts.weekdayLabel}</Text>
      <Text style={styles.detailDateDay}>{dateParts.dayLabel}</Text>
    </View>
  );
}

function DetailHeaderJobPill({
  chip,
  isMentored = false,
}: {
  chip: DetailChip | null;
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${isMentored ? " mentored assignment" : ""}`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const label = chip.eyebrowLabel ?? chip.label;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.detailHeaderJobPill,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: chip.borderColor,
        },
      ]}
    >
      <Text style={[styles.detailHeaderJobPillText, { color: chip.textColor }]}>{label}</Text>
      {isMentored ? (
        <Text style={[styles.detailHeaderJobPillMentoredText, { color: chip.textColor }]}>
          (Mentored)
        </Text>
      ) : null}
    </View>
  );
}

function DetailInfoRow({
  iconBackgroundColor,
  iconColor,
  iconName,
  label,
  value,
}: {
  iconBackgroundColor: string;
  iconColor: string;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityLabel={`${label} ${value}`} style={styles.detailInfoRow}>
      <View style={[styles.detailInfoIconBox, { backgroundColor: iconBackgroundColor }]}>
        <Ionicons color={iconColor} name={iconName} size={21} />
      </View>
      <View style={styles.detailInfoCopy}>
        <Text style={styles.detailInfoLabel}>{label}</Text>
        <Text style={styles.detailInfoValue}>{value}</Text>
      </View>
    </View>
  );
}

function DetailActionButton({
  disabled,
  iconName,
  label,
  onPress,
  tone,
}: {
  disabled?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone: "neutral" | "secondary";
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isSecondary = tone === "secondary";
  const contentColor = isSecondary ? mobileColors.brand : mobileColors.dangerText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={disabled ? undefined : { color: "rgba(15, 23, 42, 0.08)" }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.detailActionButton,
        isSecondary && styles.detailActionButtonSecondary,
        pressed && !disabled && styles.detailActionButtonPressed,
        disabled && styles.detailActionButtonDisabled,
      ]}
    >
      <View style={styles.detailActionButtonContent}>
        {iconName ? <Ionicons color={contentColor} name={iconName} size={21} /> : null}
        <Text style={[styles.detailActionButtonText, { color: contentColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function DetailPublishedFooter({
  publishedAtLabel,
  publishedByName,
  summary,
}: {
  publishedAtLabel: string | null;
  publishedByName: string | null;
  summary: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.detailPublishedFooter}>
      <Ionicons color={mobileColors.textSubtle} name="information-circle-outline" size={18} />
      <Text accessibilityLabel={summary} style={styles.detailPublishedText}>
        {publishedAtLabel ? `Published ${publishedAtLabel}` : "Published"}
        {publishedByName ? (
          <>
            {" by "}
            <Text style={styles.detailPublishedName}>{publishedByName}</Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}

function ActionSegmentSelector({
  disabled,
  entry,
  isOptionDisabled,
  options,
  selectedIndex,
  onSelect,
}: {
  disabled?: boolean;
  entry: MobileScheduleEntry;
  isOptionDisabled?: (segmentIndex: number) => boolean;
  options: ReturnType<typeof getActionSegmentOptions>;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.actionSegmentPanel}>
      <Text style={styles.subsectionLabel}>Choose shift</Text>
      <View style={styles.actionSegmentOptions}>
        {options.map((option) => {
          const optionDisabled = disabled || isOptionDisabled?.(option.segmentIndex) === true;

          return (
            <SelectorChip
              key={option.segmentIndex}
              active={selectedIndex === option.segmentIndex}
              disabled={optionDisabled}
              label={`Shift ${option.segmentIndex + 1}: ${getActionSegmentLabel(
                entry,
                option.segmentIndex,
              )}${optionDisabled && !disabled ? " · In progress" : ""}`}
              onPress={() => onSelect(option.segmentIndex)}
              showCheck={selectedIndex === option.segmentIndex}
              variant="segment"
            />
          );
        })}
      </View>
    </View>
  );
}

function DetailJobPill({
  chip,
  eyebrowDisplay = "inside",
  isMentored = false,
}: {
  chip: DetailChip | null;
  eyebrowDisplay?: EyebrowDisplay;
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${isMentored ? " mentored assignment" : ""}`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const shouldRenderEyebrowInsidePill = eyebrowDisplay === "inside" && chip.eyebrowLabel;
  const shouldRenderSingleLinePill = !chip.eyebrowLabel || eyebrowDisplay === "outside";
  const chipBorderColor =
    chip.kind === "general" ? mobileBorderColorFromText(chip.textColor) : chip.borderColor;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.detailJobChip,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: chipBorderColor,
        },
      ]}
    >
      {shouldRenderSingleLinePill ? (
        <View style={styles.detailJobChipInlineTextRow}>
          <Text style={[styles.detailJobChipText, { color: chip.textColor }]}>{chip.label}</Text>
          {isMentored ? (
            <Text style={[styles.detailJobChipMentoredText, { color: chip.textColor }]}>
              (Mentored)
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.detailJobChipTextStack}>
          {shouldRenderEyebrowInsidePill ? (
            <Text style={[styles.detailJobChipEyebrowText, { color: chip.textColor }]}>
              {chip.eyebrowLabel}
            </Text>
          ) : null}
          <Text style={[styles.detailJobChipValueText, { color: chip.textColor }]}>
            {chip.label}
            {isMentored ? (
              <Text style={[styles.detailJobChipMentoredText, { color: chip.textColor }]}>
                {" "}
                (Mentored)
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

function ShiftmateSegmentGroups({
  groups,
  linkedEmployeeId,
}: {
  groups: ShiftmateSegmentGroup[];
  linkedEmployeeId: string | null;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.shiftmateSegmentGroups}>
      {groups.map((group) => (
        <View key={group.key} style={styles.shiftmateSegmentGroup}>
          <View style={styles.shiftmateSegmentHeader}>
            <View style={styles.shiftmateSegmentHeaderCopy}>
              <View style={styles.shiftmateSegmentTitleRow}>
                <View style={styles.shiftmateSegmentTitleMeta}>
                  <Text style={styles.shiftmateSegmentTitle}>{group.title}</Text>
                  <SplitShiftBadge compact count={groups.length} label={group.label} />
                </View>
                {group.timeRange ? (
                  <Text style={styles.shiftmateSegmentTime}>{group.timeRange}</Text>
                ) : null}
              </View>
            </View>
          </View>
          {group.entries.length > 0 ? (
            <View style={styles.shiftmatesList}>
              {group.entries.map(({ entry, segment }, index) => (
                <ShiftmateRow
                  key={`${group.key}-${entry.employeeId}-${index}`}
                  entry={entry}
                  groupFocusAreaName={null}
                  groupTimeRange={group.timeRange}
                  isFirst={index === 0}
                  linkedEmployeeId={linkedEmployeeId}
                  matchedSegment={segment}
                />
              ))}
            </View>
          ) : (
            <EmptyStateCard
              compact
              iconName="people-outline"
              title={`No one in ${group.label} yet`}
            />
          )}
        </View>
      ))}
    </View>
  );
}

function ShiftmateRow({
  entry,
  groupFocusAreaName,
  groupTimeRange,
  isFirst,
  linkedEmployeeId,
  matchedSegment,
}: {
  entry: MobileScheduleEntry;
  groupFocusAreaName: string | null;
  groupTimeRange: string | null;
  isFirst: boolean;
  linkedEmployeeId: string | null;
  matchedSegment?: MobileScheduleEntrySegment | null;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { resolvedTheme } = useThemeMode();
  const avatarTone = getAvatarTone(entry.employeeId, resolvedTheme === "dark");
  const displayName = entry.employeeId === linkedEmployeeId ? "Me" : entry.employeeName;
  const jobChip = matchedSegment
    ? buildSegmentJobChip(mobileColors, resolvedTheme === "dark", matchedSegment)
    : getEntryJobChip(mobileColors, resolvedTheme === "dark", entry);
  const entryTimeRange = matchedSegment
    ? getScheduleEntrySegmentTimeRange(matchedSegment)
    : getScheduleEntryTimeRange(entry);
  const entryFocusAreaName = matchedSegment
    ? (matchedSegment.displayFocusAreaName ?? getScheduleEntryDisplayFocusAreaName(entry))
    : getScheduleEntryDisplayFocusAreaName(entry);
  const segments = getScheduleEntrySegments(entry);
  const shouldShowSegments = !matchedSegment && segments.length > 1;
  const isMentored = matchedSegment
    ? matchedSegment.isMentored === true
    : hasMentoredSegments(segments);
  const metaItems = [
    entryTimeRange && entryTimeRange !== groupTimeRange ? entryTimeRange : null,
    entryFocusAreaName && entryFocusAreaName !== groupFocusAreaName ? entryFocusAreaName : null,
  ].filter(Boolean);

  return (
    <View style={[styles.shiftmateRow, !isFirst && styles.shiftmateRowBorder]}>
      <View
        style={[
          styles.shiftmateAvatar,
          {
            backgroundColor: avatarTone.backgroundColor,
            borderColor: avatarTone.borderColor,
          },
        ]}
      >
        <Text style={[styles.shiftmateAvatarText, { color: avatarTone.textColor }]}>
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.shiftmateContent}>
        <View style={styles.shiftmateHeader}>
          <Text style={styles.shiftmateName}>{displayName}</Text>
          {jobChip || isMentored ? (
            <View style={styles.shiftmateChipRow}>
              <DetailJobPill chip={jobChip} eyebrowDisplay="outside" isMentored={isMentored} />
            </View>
          ) : null}
        </View>
        {shouldShowSegments ? (
          <ShiftEntrySegmentList entry={entry} variant="supporting" />
        ) : metaItems.length > 0 ? (
          <Text style={styles.shiftmateMeta}>{metaItems.join(" · ")}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SelectorChip({
  label,
  active,
  disabled = false,
  onPress,
  showCheck = false,
  variant = "chip",
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  showCheck?: boolean;
  variant?: "chip" | "segment";
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isSegment = variant === "segment";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      android_ripple={disabled ? undefined : { color: "rgba(15, 23, 42, 0.08)" }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.selectorChip,
        isSegment && styles.selectorSegment,
        active && styles.selectorChipActive,
        isSegment && active && styles.selectorSegmentActive,
        disabled && !isSegment && styles.selectorChipDisabled,
        disabled && isSegment && styles.selectorSegmentDisabled,
      ]}
    >
      <View style={isSegment ? styles.selectorSegmentContent : undefined}>
        <Text
          style={[
            styles.selectorChipText,
            isSegment && styles.selectorSegmentText,
            active && styles.selectorChipTextActive,
            disabled && isSegment && styles.selectorSegmentTextDisabled,
          ]}
        >
          {label}
        </Text>
        {showCheck ? (
          <View style={styles.selectorSegmentCheckmark}>
            <Ionicons color={mobileColors.surface} name="checkmark" size={15} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function CoverageOptionCard({
  title,
  body,
  tone,
  active = false,
  disabled = false,
  onPress,
}: {
  title: string;
  body: string;
  tone: "neutral" | "danger";
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      android_ripple={disabled ? undefined : { color: "rgba(15, 23, 42, 0.08)" }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.coverageOptionCard,
        tone === "danger" && styles.coverageOptionCardDanger,
        active &&
          (tone === "danger"
            ? styles.coverageOptionCardActiveDanger
            : styles.coverageOptionCardActive),
        disabled && styles.coverageOptionCardDisabled,
      ]}
    >
      {active ? (
        <View
          style={[
            styles.coverageOptionCheckmark,
            tone === "danger" && styles.coverageOptionCheckmarkDanger,
          ]}
        >
          <Ionicons color={mobileColors.textInverse} name="checkmark" size={14} />
        </View>
      ) : null}
      <Text
        style={[
          styles.coverageOptionTitle,
          tone === "danger" && styles.coverageOptionTitleDanger,
          active && styles.coverageOptionTitleWithCheck,
        ]}
      >
        {title}
      </Text>
      <Text style={styles.coverageOptionBody}>{body}</Text>
    </Pressable>
  );
}

function SwapSummaryCard({
  entry,
  label,
  segmentIndex,
  summaryNote,
}: {
  entry: MobileScheduleEntry;
  label: string;
  segmentIndex?: number;
  summaryNote?: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDark = useIsDarkMode();
  const segments = getScheduleEntrySegments(entry);
  const primarySegment =
    segmentIndex != null
      ? (getActionSegmentOptions(entry)[segmentIndex]?.segment ?? null)
      : (segments[0] ?? null);
  const primarySegmentTimeRange = primarySegment
    ? getScheduleEntrySegmentTimeRange(primarySegment)
    : null;
  const timeRange = getScheduleEntryTimeRange(entry);
  const focusAreaName =
    primarySegment?.displayFocusAreaName ?? getScheduleEntryDisplayFocusAreaName(entry);
  const jobChip = getEntryJobChip(mobileColors, isDark, entry);
  const summaryMeta = [primarySegmentTimeRange ?? timeRange ?? "Time unavailable", focusAreaName]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.swapSummaryCard}>
      <Text style={styles.swapSummaryLabel}>{label}</Text>
      <Text style={styles.swapSummaryTitle}>
        {segmentIndex != null
          ? getActionSegmentLabel(entry, segmentIndex)
          : getScheduleEntryTitle(entry)}
      </Text>
      {jobChip || primarySegment?.isMentored ? (
        <View style={styles.detailJobPillRow}>
          <DetailJobPill chip={jobChip} isMentored={primarySegment?.isMentored === true} />
        </View>
      ) : null}
      <Text style={styles.swapSummaryDate}>{formatShiftDate(entry.date)}</Text>
      {summaryNote ? <Text style={styles.swapSummaryNote}>{summaryNote}</Text> : null}
      <Text style={styles.swapSummaryMeta}>{summaryMeta}</Text>
    </View>
  );
}

function SwapDateChip({
  active,
  count,
  date,
  disabled = false,
  onPress,
}: {
  active: boolean;
  count: number;
  date: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const dateParts = getCompactScheduleDateParts(date);
  const countColor = active ? mobileColors.brand : mobileColors.textMuted;

  return (
    <Pressable
      accessibilityLabel={`Show eligible teammates for ${formatShiftDate(date)}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      android_ripple={disabled ? undefined : { color: "rgba(15, 23, 42, 0.08)" }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.swapDateChip,
        active && styles.swapDateChipActive,
        disabled && styles.swapDateChipDisabled,
      ]}
    >
      <Text style={[styles.swapDateChipWeekday, active && styles.swapDateChipTextActive]}>
        {dateParts.weekdayLabel}
      </Text>
      <Text style={[styles.swapDateChipDay, active && styles.swapDateChipTextActive]}>
        {dateParts.dayLabel}
      </Text>
      <View
        accessibilityLabel={`${count} eligible teammate${count === 1 ? "" : "s"}`}
        style={[styles.swapDateChipCount, active && styles.swapDateChipCountActive]}
      >
        <Ionicons color={countColor} name="person-outline" size={11} />
        <Text style={[styles.swapDateChipCountText, active && styles.swapDateChipCountTextActive]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function SwapOptionCard({
  entry,
  active,
  disabled = false,
  detailLabel,
  onPress,
  segmentIndex,
  showSegments = true,
}: {
  entry: MobileScheduleEntry;
  active: boolean;
  disabled?: boolean;
  detailLabel?: string | null;
  onPress: () => void;
  segmentIndex?: number;
  showSegments?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const optionLabel = segmentIndex != null ? getActionSegmentLabel(entry, segmentIndex) : null;

  return (
    <Pressable
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.swapOptionCard,
        active && styles.swapOptionCardActive,
        disabled && styles.swapOptionCardDisabled,
      ]}
    >
      <View style={styles.swapOptionHeader}>
        <Text style={styles.swapOptionName}>{entry.employeeName}</Text>
      </View>
      {optionLabel ? (
        <Text style={styles.swapOptionDetail}>
          Shift {(segmentIndex ?? 0) + 1}: {optionLabel}
        </Text>
      ) : null}
      {detailLabel ? <Text style={styles.swapOptionDetail}>{detailLabel}</Text> : null}
      {showSegments && segmentIndex == null ? (
        <ShiftEntrySegmentList entry={entry} showSegmentLabels={false} variant="supporting" />
      ) : null}
    </Pressable>
  );
}

function ShiftEntrySegmentList({
  entry,
  showSegmentLabels = true,
  variant,
}: {
  entry: MobileScheduleEntry;
  showSegmentLabels?: boolean;
  variant: "detail" | "supporting";
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const segments = getScheduleEntrySegments(entry);

  return (
    <SplitShiftSegmentList
      renderSegmentChip={(segment) => (
        <DetailJobPill
          chip={buildSegmentJobChip(mobileColors, isDark, segment)}
          isMentored={segment.isMentored === true}
        />
      )}
      segments={segments}
      showSegmentLabels={showSegmentLabels}
      showWhenSingle={variant === "supporting"}
      variant={variant}
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    loadingState: {
      gap: 14,
    },
    loadingTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    loadingBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    shiftDetailCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 16,
      shadowColor: mobileColors.shadowStrong,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 2,
    },
    detailHeroHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },
    detailHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 7,
    },
    detailHeroPillRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: 10,
    },
    detailHeroTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    detailEmployeeName: {
      ...mobileText.rowTitle,
      color: mobileColors.textSubtle,
    },
    detailHeaderJobPill: {
      minHeight: 28,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    detailHeaderJobPillText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    detailHeaderJobPillMentoredText: {
      ...mobileText.badge,
      textTransform: "none",
    },
    detailInfoStack: {
      gap: 14,
    },
    detailSplitNotice: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    detailActionsRow: {
      flexDirection: "row",
      gap: 10,
    },
    detailActionButton: {
      flex: 1,
      minHeight: 56,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: mobileColors.dangerBorder,
      backgroundColor: mobileColors.dangerSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    detailActionButtonSecondary: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    detailActionButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    detailActionButtonDisabled: {
      opacity: 0.5,
    },
    detailActionButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    detailActionButtonText: {
      ...mobileText.bodyStrong,
    },
    detailPublishedFooter: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    detailPublishedText: {
      flex: 1,
      minWidth: 0,
      ...mobileText.meta,
      color: mobileColors.textSubtle,
    },
    detailPublishedName: {
      fontWeight: "600",
      color: mobileColors.textMuted,
    },
    detailInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    detailInfoIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    detailInfoCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    detailInfoLabel: {
      ...mobileText.label,
      textTransform: "uppercase",
      color: mobileColors.textSubtle,
    },
    detailInfoValue: {
      ...mobileText.rowTitle,
      color: mobileColors.textSecondary,
    },
    detailGroup: {
      gap: 10,
      alignItems: "flex-start",
    },
    detailDateTile: {
      width: 60,
      minHeight: 68,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    detailDateWeekday: {
      ...mobileText.badge,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    detailDateDay: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
    },
    detailShiftTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    detailSummaryText: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    detailFocusAreaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    detailFocusAreaText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    detailFootnote: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
      paddingTop: 2,
    },
    detailJobChip: {
      alignSelf: "flex-start",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    detailJobPillRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    detailJobChipTextStack: {
      gap: 2,
    },
    detailJobChipInlineTextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    detailJobChipEyebrowText: {
      ...mobileText.micro,
    },
    detailJobChipText: {
      ...mobileText.badge,
      textTransform: "uppercase",
    },
    detailJobChipMentoredText: {
      textTransform: "none",
    },
    detailJobChipValueText: {
      ...mobileText.badge,
      fontWeight: "600",
    },
    mentoredPill: {
      alignSelf: "flex-start",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    mentoredPillText: {
      ...mobileText.badge,
      color: mobileColors.textSecondary,
    },
    detailSegmentList: {
      gap: 12,
    },
    detailSegmentBlock: {
      gap: 5,
    },
    detailSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 12,
    },
    detailSegmentTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    detailSegmentMeta: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    sectionBlock: {
      gap: 12,
    },
    sectionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    shiftmatesList: {
      gap: 0,
    },
    shiftmateSegmentGroups: {
      gap: 24,
    },
    shiftmateSegmentGroup: {
      gap: 6,
    },
    shiftmateSegmentHeader: {
      paddingBottom: 2,
    },
    shiftmateSegmentHeaderCopy: {
      gap: 2,
      minWidth: 0,
    },
    shiftmateSegmentTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    shiftmateSegmentTitleMeta: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    shiftmateSegmentTitle: {
      flexShrink: 1,
      minWidth: 0,
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    shiftmateSegmentTime: {
      flexShrink: 0,
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "600",
    },
    shiftmateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 0,
      paddingVertical: 13,
    },
    shiftmateRowBorder: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
    },
    shiftmateAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    shiftmateAvatarText: {
      ...mobileText.bodyStrong,
    },
    shiftmateContent: {
      flex: 1,
      gap: 5,
      minWidth: 0,
    },
    shiftmateHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    shiftmateName: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    shiftmateChipRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: 8,
    },
    shiftmateMeta: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    supportingSegmentList: {
      gap: 8,
    },
    supportingSegmentBlock: {
      gap: 4,
    },
    supportingSegmentDivider: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: 8,
    },
    supportingSegmentTitle: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    supportingSegmentMeta: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    sectionTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    modalContent: {
      gap: 18,
    },
    modalActionButtons: {
      gap: 10,
      paddingTop: 2,
    },
    subsection: {
      gap: 14,
    },
    subsectionLabel: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    subsectionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    modalInlinePanel: {
      gap: 12,
      padding: 16,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
    },
    actionSegmentPanel: {
      gap: 10,
      padding: ACTION_SEGMENT_PANEL_PADDING,
      borderRadius: ACTION_SEGMENT_PANEL_RADIUS,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    actionSegmentOptions: {
      gap: 8,
    },
    swapSummaryList: {
      gap: 10,
    },
    swapSummaryCard: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderRadius: mobileRadii.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
    },
    swapSummaryLabel: {
      ...mobileText.label,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    swapSummaryTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    swapSummaryDate: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    swapSummaryNote: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      fontWeight: "500",
    },
    swapSummaryMeta: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
      fontWeight: "500",
    },
    coverageOptionList: {
      gap: 10,
    },
    coverageOptionCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 16,
      gap: 8,
      position: "relative",
    },
    coverageOptionCardDanger: {
      borderColor: mobileColors.dangerBorder,
      backgroundColor: mobileColors.dangerSoft,
    },
    coverageOptionCardActive: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    coverageOptionCardActiveDanger: {
      borderColor: mobileColors.dangerText,
    },
    coverageOptionCardDisabled: {
      opacity: 0.5,
    },
    coverageOptionTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    coverageOptionTitleWithCheck: {
      paddingRight: 28,
    },
    coverageOptionTitleDanger: {
      color: mobileColors.dangerText,
    },
    coverageOptionBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    coverageOptionCheckmark: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 20,
      height: 20,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brand,
    },
    coverageOptionCheckmarkDanger: {
      backgroundColor: mobileColors.dangerText,
    },
    coverageNotice: {
      ...mobileText.body,
      color: mobileColors.warningText,
    },
    selectorWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    selectorChip: {
      borderRadius: mobileRadii.pill,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    selectorSegment: {
      minHeight: 56,
      borderRadius: ACTION_SEGMENT_OPTION_RADIUS,
      backgroundColor: mobileColors.surfaceSecondary,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      paddingHorizontal: 14,
      paddingVertical: 13,
      justifyContent: "center",
    },
    selectorChipDisabled: {
      opacity: 0.5,
    },
    selectorSegmentDisabled: {
      backgroundColor: mobileColors.surfaceMuted,
      borderColor: mobileColors.borderSubtle,
    },
    selectorChipActive: {
      backgroundColor: mobileColors.brandSoft,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
    },
    selectorSegmentActive: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.brand,
      shadowColor: mobileColors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 2,
    },
    selectorSegmentContent: {
      width: "100%",
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    selectorChipText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textSecondary,
    },
    selectorSegmentText: {
      flex: 1,
      minWidth: 0,
    },
    selectorSegmentTextDisabled: {
      color: mobileColors.textSubtle,
    },
    selectorChipTextActive: {
      color: mobileColors.brand,
    },
    selectorSegmentCheckmark: {
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brand,
    },
    swapSelectedPanel: {
      gap: 12,
    },
    swapDateFilteredList: {
      gap: 12,
    },
    swapWeekNav: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    swapWeekNavButton: {
      width: 44,
      height: 44,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    swapWeekNavButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    swapWeekNavButtonDisabled: {
      opacity: 0.5,
    },
    swapWeekRangeLabel: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
      flex: 1,
      textAlign: "center",
      fontWeight: "800",
    },
    swapDateGrid: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 6,
    },
    swapDateChip: {
      flex: 1,
      minWidth: 0,
      minHeight: 68,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    swapDateChipActive: {
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
    },
    swapDateChipDisabled: {
      opacity: 0.5,
    },
    swapDateChipWeekday: {
      ...mobileText.micro,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    swapDateChipDay: {
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "800",
      color: mobileColors.textPrimary,
    },
    swapDateChipTextActive: {
      color: mobileColors.brand,
    },
    swapDateChipCount: {
      minWidth: 0,
      minHeight: 18,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 5,
      backgroundColor: mobileColors.surfaceSecondary,
    },
    swapDateChipCountActive: {
      backgroundColor: mobileColors.surface,
    },
    swapDateChipCountText: {
      ...mobileText.micro,
      color: mobileColors.textMuted,
    },
    swapDateChipCountTextActive: {
      color: mobileColors.brand,
    },
    swapOptions: {
      gap: 8,
    },
    swapOptionCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 14,
      gap: 8,
    },
    swapOptionCardActive: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
    },
    swapOptionCardDisabled: {
      opacity: 0.5,
    },
    swapOptionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    swapOptionName: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    swapOptionDetail: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
      fontWeight: "600",
    },
  });
