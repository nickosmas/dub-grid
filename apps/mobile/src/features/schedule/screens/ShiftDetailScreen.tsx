import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "../../../shared/components/Text";
import { Pressable } from "../../../shared/components/Pressable";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_MOBILE_SCHEDULE_RANGE_DAYS,
  type MobileScheduleEntry,
  type MobileScheduleEntrySegment,
  type MobileShiftRequest,
} from "@dubgrid/contracts";
import { indefiniteArticle } from "@dubgrid/domain";
import { getAvatarTone } from "@dubgrid/design-tokens";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { PressableRow } from "../../../shared/components/PressableRow";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { FullPageSheet } from "../../../shared/components/FullPageSheet";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { InlineError } from "../../../shared/components/InlineError";
import { Card, Screen } from "../../../shared/components/Screen";
import { SkeletonCardSurface, SkeletonLine } from "../../../shared/components/skeleton";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { CardRowListSkeleton } from "../../../shared/components/skeleton/CardRowListSkeleton";
import { ShiftDetailSkeleton } from "../components/ShiftDetailSkeleton";
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
import {
  getClientFriendlyErrorMessage,
  pushClientFriendlyErrorToast,
} from "../../../shared/lib/errors";
import { getQueryErrorMessage } from "../../../shared/lib/query-state";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import {
  useIsDarkMode,
  useMobileColors,
  useThemeMode,
} from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  MAX_FONT_SCALE,
  mobileBorderColorFromText,
  mobileDarkenTone,
  mobileRadii,
  mobileText,
  mobileVisiblePillBorder,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  buildScheduleSections,
  buildScheduleShiftGroups,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  formatCompactScheduleDate,
  formatScheduleTimeRange,
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
  getMobileScheduleEntryDisplayFocusAreaName,
  getMobileScheduleEntrySegmentFocusAreaName,
  getScheduleWeekStartDate,
  getSplitShiftSegmentsForEntry,
  getScheduleEntryTitle,
  sortScheduleEntries,
} from "../lib/schedule";
import {
  describeScheduleEntryChanges,
  getScheduleEntrySegmentChange,
} from "../lib/scheduleScreenChips";
import { ShiftChangeBadge, getShiftChangeLabel } from "../components/ShiftChangeBadge";
import {
  addDaysIso,
  buildShiftmateSegmentGroups,
  canWorkRequiredFocusAreas,
  entriesHaveMatchingShiftAndFocusArea,
  entriesHaveOverlappingTimes,
  formatPublishedAt,
  formatPublishedSummary,
  formatShiftDate,
  formatShiftRequestStatus,
  formatShiftRequestType,
  formatWeekRangeLabel,
  getAbsenceTypeLabelForEntry,
  getAbsenceTypeOptionLabel,
  getActionSegmentLabel,
  getActionSegmentOptions,
  getCurrentDateTimeParts,
  getDateRange,
  getInitials,
  getRequestModeTitle,
  getScheduleEntryIdentityKey,
  getScheduleEntryRequiredFocusAreaIds,
  getWeekDates,
  hasAnyRequestableScheduleEntrySegment,
  hasScheduleEntrySegmentStarted,
  hasScheduledWorkedAssignment,
  hasWorkedAssignment,
  isGeneralDetailEntry,
  isGeneralDetailSegment,
  readOptionalColor,
  readOptionalStyleColor,
  readParam,
  type RequestMode,
  type ShiftmateSegmentGroup,
} from "../lib/shiftDetailHelpers";
// The chip vocabulary is shared with the schedule home card rather than
// re-derived here. The two had drifted: the local copies dropped the
// supervisor/nurse/mentor tone heuristics, so the same job rendered coloured on
// the home card and flat grey on this one.
import {
  buildAbsenceChip,
  buildGeneralShiftChip,
  buildJobChip,
  hasMentoredSegments,
  shouldShowMePrimaryTitle,
  type JobChip,
} from "../lib/scheduleScreenChips";
import {
  ACTION_SEGMENT_OPTION_RADIUS,
  ACTION_SEGMENT_PANEL_PADDING,
  ACTION_SEGMENT_PANEL_RADIUS,
  createStyles,
} from "./shiftDetailScreenStyles";

type CoverageRequestType = "pickup" | "calloff" | null;
type ShiftDetailConfirmation = {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  onConfirm: () => void;
} | null;
const SWAP_SCHEDULE_LOOKAHEAD_DAYS = MAX_MOBILE_SCHEDULE_RANGE_DAYS;
const ACTIVE_SHIFT_REQUEST_STATUSES = new Set<MobileShiftRequest["status"]>([
  "open",
  "pending_approval",
]);
type EyebrowDisplay = "inside" | "outside";

function getEntryJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  entry: MobileScheduleEntry,
): JobChip | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return buildAbsenceChip(mobileColors, isDark, getScheduleEntryTitle(entry), entry.presentation);
  }

  const primarySegment = getScheduleEntrySegments(entry)[0] ?? null;

  if (isGeneralDetailSegment(primarySegment)) {
    return buildGeneralShiftChip(
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

  return buildJobChip(mobileColors, isDark, label, segment);
}

function buildSegmentJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  segment: MobileScheduleEntrySegment,
): JobChip | null {
  if (isGeneralDetailSegment(segment)) {
    return buildGeneralShiftChip(
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

  return buildJobChip(mobileColors, isDark, label, segment);
}

function MentoredPill() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text fit="compact" style={styles.mentoredPillText}>
        Mentored
      </Text>
    </View>
  );
}

export default function ShiftDetailScreen() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
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
    queryKey: mobileQueryKeys.schedule(accessToken, "mine", myScheduleRange),
    queryFn: ({ signal }) => getMySchedule(accessToken!, myScheduleRange, signal),
    enabled:
      Boolean(accessToken) &&
      Boolean(myScheduleRange.startDate) &&
      Boolean(myScheduleRange.endDate),
  });
  // Named rather than inline so the content-state gate below can ask the same
  // question: a query that is never enabled is also never "resolved".
  const canLoadTeamSchedule =
    Boolean(accessToken) &&
    Boolean(teamScheduleRange.startDate) &&
    Boolean(teamScheduleRange.endDate) &&
    (canViewTeamSchedule || needsTeamScheduleForShift);
  const teamScheduleQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", teamScheduleRange),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, teamScheduleRange, signal),
    enabled: canLoadTeamSchedule,
  });
  useEffect(() => {
    if (teamScheduleQuery.error) {
      pushClientFriendlyErrorToast(pushToast, {
        error: teamScheduleQuery.error,
        title: "Could not load working-with list",
        fallbackMessage: "We couldn't load who is working with you right now.",
      });
    }
  }, [teamScheduleQuery.error, pushToast]);
  const swapOptionsQuery = useQuery({
    queryKey: mobileQueryKeys.shiftSwapOptions(accessToken, {
      requesterEmpId: linkedEmployeeId,
      requesterShiftDate: shiftDate,
      startDate: teamScheduleRange.startDate,
      endDate: teamScheduleRange.endDate,
    }),
    queryFn: ({ signal }) =>
      getShiftSwapOptions(
        accessToken!,
        {
          requesterEmpId: linkedEmployeeId!,
          requesterShiftDate: shiftDate!,
          startDate: teamScheduleRange.startDate,
          endDate: teamScheduleRange.endDate,
        },
        signal,
      ),
    enabled:
      Boolean(accessToken) &&
      Boolean(linkedEmployeeId) &&
      Boolean(shiftDate) &&
      Boolean(teamScheduleRange.startDate) &&
      Boolean(teamScheduleRange.endDate) &&
      requestMode === "swap",
  });
  const requestsQuery = useQuery({
    queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
    queryFn: ({ signal }) => getShiftRequests(accessToken!, range, signal),
    enabled:
      Boolean(accessToken) &&
      Boolean(linkedEmployeeId) &&
      Boolean(range.startDate) &&
      Boolean(range.endDate),
  });
  const peopleQuery = useQuery({
    queryKey: mobileQueryKeys.people(accessToken),
    queryFn: ({ signal }) => getPeople(accessToken!, signal),
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
    // No `onError` toast: the request is sent from inside the sheet, which is
    // its own native window, and a toast lands in the root window behind it
    // where nobody sees it. The error renders in the sheet's footer instead.
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
  useEffect(() => {
    if (shouldCheckExistingRequests && requestsQuery.error) {
      pushClientFriendlyErrorToast(pushToast, {
        error: requestsQuery.error,
        title: "Could not verify existing requests",
        fallbackMessage: "We couldn't verify existing requests for this shift.",
      });
    }
  }, [shouldCheckExistingRequests, requestsQuery.error, pushToast]);
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
    shiftEntry.change?.kind !== "deleted" &&
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
  // The team schedule counts even when it isn't strictly needed to resolve
  // *this* shift: the "Working with" section reads from it, so leaving it out
  // cleared the page skeleton and then painted a second one inside that
  // section — on your own shift, every single time. Its error is "resolved"
  // too, because that section renders its own banner for it.
  // `!canLoadTeamSchedule` first: the query is disabled for a user viewing
  // their own shift without team-schedule permission, and a disabled query
  // never resolves, so `hasData` would stay false forever and hand the error
  // and offline branches a page that had actually loaded fine.
  const teamScheduleResolved =
    !canLoadTeamSchedule ||
    teamScheduleQuery.data !== undefined ||
    Boolean(teamScheduleQuery.error);
  const contentState = useMobileContentState({
    hasData: Boolean(shiftEntry) && Boolean(bootstrapQuery.data) && teamScheduleResolved,
    isLoading: bootstrapQuery.isLoading || myScheduleQuery.isLoading || teamScheduleQuery.isLoading,
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
  const focusAreaName = shiftEntry ? getMobileScheduleEntryDisplayFocusAreaName(shiftEntry) : null;
  const jobChip = shiftEntry ? getEntryJobChip(mobileColors, isDark, shiftEntry) : null;
  const detailCardTitle = hasSplitShift
    ? "Multiple Shifts"
    : shiftEntry
      ? getScheduleEntryTitle(shiftEntry)
      : "";
  const isViewingOtherEmployee = Boolean(shiftEntry && shiftEntry.employeeId !== linkedEmployeeId);
  const detailTitleChip = !hasMultipleSegments ? jobChip : null;
  // Same rule the home card applies: when the chip already names the thing (an
  // absence type, a general shift), the heading above it would only repeat the
  // word, so the eyebrow and the pill carry it alone.
  const shouldShowDetailTitle =
    hasSplitShift || shouldShowMePrimaryTitle(detailCardTitle, detailTitleChip);
  const shouldRenderTitlePills = Boolean(
    !hasSplitShift && (detailTitleChip || primarySegment?.isMentored),
  );

  const shouldShowShiftmates = Boolean(
    canViewTeamSchedule &&
    shiftEntry &&
    getScheduleEntryAbsenceTypeId(shiftEntry) == null &&
    !isGeneralDetailEntry(shiftEntry),
  );
  // No `isLoading` term: the screen's own gate now waits on the team schedule,
  // so by the time this renders the list is either populated or the load
  // failure has already been toasted (see the effect near `teamScheduleQuery`)
  // and there is nothing left for this section to show.
  const shouldRenderShiftmatesSection = Boolean(
    shouldShowShiftmates && (shiftmates.length > 0 || hasGroupedShiftmates),
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

  // Selections only, never the mode: the unsaved-changes guard runs this on
  // every exit, and closing the sheet from inside it would tear the sheet and
  // the discard confirmation down in one commit. UIKit drops the second of two
  // simultaneous modal dismissals and the sheet stays on screen.
  function resetRequestSelections() {
    setCoverageRequestType(null);
    setSelectedTargetShift(null);
    setSelectedRequesterSegmentIndex(firstRequestableRequesterSegmentIndex);
    setSelectedSwapDate(null);
    setSelectedTargetedPickupEmployeeId(null);
    setSelectedCalloffAbsenceTypeId(null);
  }

  function resetRequestMode(nextMode: RequestMode) {
    setRequestMode(nextMode);
    resetRequestSelections();
    createRequestMutation.reset();
    setSwapWeekStartDate(
      nextMode === "swap"
        ? range.startDate
          ? getScheduleWeekStartDate(range.startDate)
          : shiftDate
            ? getScheduleWeekStartDate(shiftDate)
            : null
        : null,
    );
  }

  /**
   * Work the user cannot redo in one tap, which is the only thing worth a
   * discard question. A swap target is found by browsing weeks and teammates;
   * every other choice in the sheet (drop or pick up, an absence type, a
   * segment, a targeted teammate) is a single tap, and asking "Discard this
   * request?" after one tap read as the close button being broken.
   */
  const hasUnsavedRequestInput = requestMode != null && selectedTargetShift != null;

  // Leaving the sheet open is what makes this a guard: a dragged sheet settles
  // back into place while the confirmation sits on top of it. `onClose` is
  // what closes the sheet, kept apart from `onDiscard` so the guard can
  // sequence the confirmation's dismissal before the sheet's.
  const requestGuard = useUnsavedChangesGuard({
    isDirty: hasUnsavedRequestInput,
    disabled: createRequestMutation.isPending,
    title: "Discard this request?",
    body: "Your selections won't be saved.",
    onDiscard: resetRequestSelections,
    onClose: () => resetRequestMode(null),
  });
  const createRequestError = createRequestMutation.error
    ? getClientFriendlyErrorMessage(createRequestMutation.error, "We couldn't create that request.")
    : null;

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

  // Only a call-off asks twice: it takes the requester off the roster, and
  // the absence is what a manager sees. A pickup offer or a swap is a request
  // the other party still has to accept, so its Submit is the commitment.
  function confirmCoverageRequest(
    type: "pickup" | "calloff",
    options?: { absenceTypeId?: number; absenceTypeLabel?: string },
  ) {
    if (!shiftEntry) {
      return;
    }

    if (type === "pickup") {
      submitCoverageRequest("pickup", { absenceTypeId: options?.absenceTypeId });
      return;
    }

    const shiftLabel = selectedRequesterShiftLabel;
    const shiftDateLabel = formatShiftDate(shiftEntry.date);
    const absenceTypeLabel = options?.absenceTypeLabel ?? "selected";

    setPendingConfirmation({
      title: "Submit this call-off?",
      body: `${indefiniteArticle(absenceTypeLabel) === "an" ? "An" : "A"} ${absenceTypeLabel} absence will be submitted for your ${shiftLabel} shift on ${shiftDateLabel}.`,
      confirmLabel: "Submit Call-off",
      confirmTone: "danger",
      onConfirm: () =>
        submitCoverageRequest("calloff", {
          absenceTypeId: options?.absenceTypeId,
        }),
    });
  }

  function confirmTargetedPickupRequest(entry: MobileScheduleEntry) {
    if (!shiftEntry) {
      return;
    }

    const absenceTypeId = getScheduleEntryAbsenceTypeId(entry);

    if (absenceTypeId == null) {
      return;
    }

    submitCoverageRequest("pickup", {
      targetEmpId: entry.employeeId,
      targetShiftDate: shiftEntry.date,
      absenceTypeId,
    });
  }

  function handleSubmitRequest() {
    if (!shiftEntry || !selectedTargetShift || !selectedTargetEntry) {
      return;
    }

    submitSwapRequest();
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

  // The sheets draw a footer shell (hairline, padding) whenever a footer is
  // passed, so an always-truthy fragment left an empty band under the body
  // until a choice was made. Only hand the footer over when it has content.
  const hasRequestSheetFooter =
    !!createRequestError ||
    (requestMode === "swap" && !!selectedTargetEntry && !!shiftEntry) ||
    (requestMode === "coverage" &&
      !!shiftEntry &&
      ((coverageRequestType === "pickup" && !!selectedTargetedPickupEntry) ||
        (coverageRequestType === "calloff" && !!selectedCalloffAbsenceType)));
  // Both confirmations a request sheet can raise: the descriptor one from
  // its Submit (call-off), the guard one from Close with a choice made. As
  // an overlay inside the sheet's own Modal, because UIKit refuses to
  // present a second controller while the sheet is up ("already
  // presenting"), so a root-level Modal never appeared and the button did
  // nothing.
  const requestConfirmations = (presentation: "modal" | "inline") => (
    <>
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
        presentation={presentation}
        title={pendingConfirmation?.title ?? "Confirm action?"}
        visible={pendingConfirmation != null}
      />
      <ConfirmationModal presentation={presentation} {...requestGuard.confirmationProps} />
    </>
  );
  const requestSheetOverlay = requestConfirmations("inline");

  const requestSheetFooter = hasRequestSheetFooter ? (
    <>
      {createRequestError ? <InlineError message={createRequestError} /> : null}
      {requestMode === "swap" && selectedTargetEntry && shiftEntry ? (
        <SheetActions
          primaryAction={
            <Button
              disabled={!canSubmitRequest || createRequestMutation.isPending}
              label="Submit"
              loading={createRequestMutation.isPending}
              onPress={handleSubmitRequest}
            />
          }
        >
          <Button
            disabled={createRequestMutation.isPending}
            label="Back"
            onPress={() => {
              setSelectedSwapDate(selectedTargetEntry.date);
              setSelectedTargetShift(null);
            }}
            tone="neutral"
          />
        </SheetActions>
      ) : null}

      {requestMode === "coverage" &&
      coverageRequestType === "pickup" &&
      selectedTargetedPickupEntry &&
      shiftEntry ? (
        <SheetActions
          primaryAction={
            <Button
              label="Submit"
              loading={createRequestMutation.isPending}
              onPress={() => confirmTargetedPickupRequest(selectedTargetedPickupEntry)}
            />
          }
        >
          <Button
            disabled={createRequestMutation.isPending}
            label="Back"
            onPress={() => setSelectedTargetedPickupEmployeeId(null)}
            tone="neutral"
          />
        </SheetActions>
      ) : null}

      {requestMode === "coverage" &&
      coverageRequestType === "calloff" &&
      selectedCalloffAbsenceType &&
      shiftEntry ? (
        <SheetActions
          primaryAction={
            <Button
              label="Submit"
              loading={createRequestMutation.isPending}
              onPress={() =>
                confirmCoverageRequest("calloff", {
                  absenceTypeId: selectedCalloffAbsenceType.id,
                  absenceTypeLabel: getAbsenceTypeOptionLabel(selectedCalloffAbsenceType),
                })
              }
            />
          }
        >
          <Button
            disabled={createRequestMutation.isPending}
            label="Back"
            onPress={() => setSelectedCalloffAbsenceTypeId(null)}
            tone="neutral"
          />
        </SheetActions>
      ) : null}
    </>
  ) : undefined;
  const requestSheetBody = (
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
                <Text style={styles.subsectionBody}>Review your call-off below, then submit.</Text>
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
                        selectedCalloffAbsenceTypeId === absenceType.id ? null : absenceType.id,
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
                {/* The app's only text-based loading state and only
                    icon-less, retry-less error lived here. Both now read
                    like every other surface. */}
                {swapOptionsQuery.isLoading ? (
                  <CardRowListSkeleton rows={2} />
                ) : swapOptionsQuery.error ? (
                  <StatusBanner
                    actionLabel="Try again"
                    body={getQueryErrorMessage(
                      swapOptionsQuery.error,
                      "We couldn't load teammate shifts.",
                    )}
                    title="Could not load teammate shifts"
                    onAction={() => {
                      void swapOptionsQuery.refetch();
                    }}
                  />
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
                            : { color: mobileColors.rippleNeutral }
                        }
                        disabled={previousEligibleSwapWeekStart == null}
                        onPress={() => handleSwapWeek(-1)}
                        style={({ pressed }) => [
                          styles.swapWeekNavButton,
                          pressed &&
                            previousEligibleSwapWeekStart != null &&
                            styles.swapWeekNavButtonPressed,
                          previousEligibleSwapWeekStart == null && styles.swapWeekNavButtonDisabled,
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
                            : { color: mobileColors.rippleNeutral }
                        }
                        disabled={nextEligibleSwapWeekStart == null}
                        onPress={() => handleSwapWeek(1)}
                        style={({ pressed }) => [
                          styles.swapWeekNavButton,
                          pressed &&
                            nextEligibleSwapWeekStart != null &&
                            styles.swapWeekNavButtonPressed,
                          nextEligibleSwapWeekStart == null && styles.swapWeekNavButtonDisabled,
                        ]}
                      >
                        <Ionicons
                          color={mobileColors.textSecondary}
                          name="chevron-forward"
                          size={20}
                        />
                      </Pressable>
                    </View>
                    <View accessibilityLabel="Eligible swap dates" style={styles.swapDateGrid}>
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
                                (selectedTargetShift.segmentIndex ?? 0) === option.segmentIndex
                              }
                              entry={entry}
                              segmentIndex={options.length > 1 ? option.segmentIndex : undefined}
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
    </View>
  );
  return (
    <Screen
      bottomPaddingMode="stack"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll, and there
      // is nothing to pull-to-refresh while the thing is already loading.
      // Everything else scrolls — `Screen`'s `flexGrow: 1` gives a `fillScreen`
      // state real space to centre in without leaving scroll mode.
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ShiftDetailSkeleton />
        ) : null
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
            <View style={styles.detailSummaryRow}>
              <View style={styles.detailSummaryContent}>
                <View style={styles.detailHeroHeader}>
                  <View style={styles.detailHeroCopy}>
                    {shouldShowDetailTitle ? (
                      <View style={styles.detailHeroTitleRow}>
                        <Text
                          maxFontSizeMultiplier={MAX_FONT_SCALE}
                          numberOfLines={1}
                          style={[styles.detailHeroTitle, styles.detailHeroTitleInline]}
                        >
                          {detailCardTitle}
                        </Text>
                        <ShiftChangeBadge change={hasSplitShift ? null : shiftEntry.change} />
                      </View>
                    ) : null}
                    {!hasSplitShift && (shouldRenderTitlePills || shiftEntry.change) ? (
                      <View style={styles.detailHeroPillRow}>
                        {detailTitleChip || primarySegment?.isMentored ? (
                          <DetailHeaderJobPill
                            chip={detailTitleChip}
                            isMentored={primarySegment?.isMentored === true}
                          />
                        ) : null}
                        {!shouldShowDetailTitle ? (
                          <ShiftChangeBadge change={hasSplitShift ? null : shiftEntry.change} />
                        ) : null}
                      </View>
                    ) : null}
                    {isViewingOtherEmployee && shiftEntry.employeeName ? (
                      <Text style={styles.detailEmployeeName}>{shiftEntry.employeeName}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
              <DetailDateTile date={shiftEntry.date} />
            </View>

            <View style={styles.detailInfoStack}>
              {hasSplitShift ? (
                <ShiftEntrySegmentList
                  entry={shiftEntry}
                  showSegmentLabels={false}
                  suppressCountAccessibilityLabel
                  variant="detail"
                />
              ) : null}
              {hasSplitShift && canCreateRequestsForShift ? (
                <Text style={styles.detailSplitNotice}>
                  Drop and swap actions apply to the shift you choose.
                </Text>
              ) : null}
              {!hasMultipleSegments && timeRange ? (
                <DetailInfoRow
                  iconName="time-outline"
                  label="Shift time"
                  value={timeRange}
                  prominent
                />
              ) : null}
              {!hasMultipleSegments && focusAreaName ? (
                <DetailInfoRow
                  iconName="location-outline"
                  label="Focus area"
                  value={focusAreaName}
                />
              ) : null}
            </View>

            {canCreateRequestsForShift ? (
              <View style={styles.detailActionsRow}>
                <View style={styles.detailActionButtonWrap}>
                  <Button
                    accessibilityLabel="Drop shift"
                    disabled={createRequestMutation.isPending}
                    fullWidth
                    icon="exit-outline"
                    label="Drop shift"
                    onPress={() => resetRequestMode("coverage")}
                    shape="pill"
                    size="md"
                    tone="neutral"
                  />
                </View>
                {canCreateSwapForShift ? (
                  <View style={styles.detailActionButtonWrap}>
                    <Button
                      accessibilityLabel="Swap"
                      disabled={createRequestMutation.isPending}
                      fullWidth
                      icon="swap-horizontal-outline"
                      label="Swap"
                      onPress={() => resetRequestMode("swap")}
                      shape="pill"
                      size="md"
                      tone="primary"
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <PreviousShiftFooter entry={shiftEntry} />

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
            </View>
          ) : null}

          {isCheckingExistingRequests ? (
            <SkeletonCardSurface>
              <SkeletonLine
                style={{ marginBottom: mobileSpace.sm }}
                variant="screenTitle"
                width="60%"
              />
              <SkeletonLine variant="body" width="90%" />
            </SkeletonCardSurface>
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
        </>
      )}
      {/* Drop and pickup are a short choice and stay in the bottom sheet.
          Swap browses weeks of teammates' shifts, which is a page's worth of
          task, so it takes the full-page sheet. Both read the same body and
          footer and exit through the same guard. */}
      <FullPageSheet
        dismissDisabled={createRequestMutation.isPending}
        footer={requestSheetFooter}
        hasUnsavedChanges={requestGuard.isDirty}
        title={getRequestModeTitle("swap")}
        visible={requestMode === "swap"}
        onDismiss={requestGuard.requestClose}
        overlay={requestSheetOverlay}
      >
        {requestSheetBody}
      </FullPageSheet>
      <BottomSheetModal
        // A request in flight can't be dragged, tapped or backed away from —
        // the same rule the old close button enforced on its own.
        dismissDisabled={createRequestMutation.isPending}
        footer={requestSheetFooter}
        header={<SheetHeader title={getRequestModeTitle(requestMode)} />}
        overlay={requestSheetOverlay}
        scrollable
        visible={requestMode === "coverage"}
        onDismiss={requestGuard.requestClose}
      >
        {requestSheetBody}
      </BottomSheetModal>
      {/* With no sheet up, the two confirmations are ordinary modals: the
          descriptor one routes the request list's own buttons, the guard one
          is only ever raised by a dismissal. While a sheet is up they ride
          inside it as overlays (see `requestSheetOverlay`). */}
      {requestMode == null ? requestConfirmations("modal") : null}
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
      <Text fit="fixed" style={styles.detailDateWeekday}>
        {dateParts.weekdayLabel}
      </Text>
      <Text fit="fixed" style={styles.detailDateDay}>
        {dateParts.dayLabel}
      </Text>
    </View>
  );
}

function DetailHeaderJobPill({
  chip,
  isMentored = false,
}: {
  chip: JobChip | null;
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  // Absences use the category as the main heading and keep the specific
  // absence name in its compact pill. General shifts emphasize their name.
  if (!chip.eyebrowLabel) {
    return <DetailJobPill chip={chip} isMentored={isMentored} />;
  }

  return (
    <View style={styles.detailHeaderJobPillStack}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={chip.kind === "absence" ? styles.detailHeroTitle : styles.detailHeaderJobPillEyebrow}
      >
        {chip.eyebrowLabel}
      </Text>
      <DetailJobPill
        chip={chip}
        eyebrowDisplay="outside"
        isMentored={isMentored}
        prominent={chip.kind !== "absence"}
      />
    </View>
  );
}

function DetailInfoRow({
  iconName,
  label,
  value,
  prominent = false,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  prominent?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityLabel={`${label} ${value}`} style={styles.detailInfoRow}>
      <View style={styles.detailInfoIcon}>
        <Ionicons color={mobileColors.textMuted} name={iconName} size={16} />
      </View>
      <View style={styles.detailInfoCopy}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.detailInfoLabel}>
          {label}
        </Text>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.detailInfoValue, prominent && styles.detailTimeValue]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function getPreviousPresentationTitle(
  presentation: NonNullable<MobileScheduleEntry["change"]>["previousPresentation"],
): string {
  return presentation?.shiftName?.trim() || presentation?.label?.trim() || "Shift";
}

function getPreviousSegmentTitle(segment: MobileScheduleEntrySegment): string {
  return segment.shiftName?.trim() || segment.label?.trim() || "Shift";
}

function getPreviousPresentationFocusAreaName(
  presentation: NonNullable<MobileScheduleEntry["change"]>["previousPresentation"],
): string | null {
  if (!presentation) {
    return null;
  }

  // A general-shift segment deliberately has no focus area. Keeping this
  // guard at the display boundary prevents an older cached payload from
  // putting the focus "wings" back on a general shift in the history sheet.
  const hasRegularSegment = presentation.segments.some((segment) => segment.shiftId !== null);
  if (presentation.segments.length > 0 && !hasRegularSegment) {
    return null;
  }

  return presentation.displayFocusAreaName?.trim() || null;
}

function PreviousShiftFooter({ entry }: { entry: MobileScheduleEntry }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [showPreviousShift, setShowPreviousShift] = useState(false);
  const previous = entry.change?.previousPresentation ?? null;
  const changeLines = useMemo(() => describeScheduleEntryChanges(entry), [entry]);

  if (!previous) {
    return null;
  }

  const previousSegments = previous.segments;
  const hasMultiplePreviousSegments = previousSegments.length > 1;
  const previousTimeRange = formatScheduleTimeRange(previous.startTime, previous.endTime);
  const previousFocusAreaName = getPreviousPresentationFocusAreaName(previous);

  return (
    <>
      <PressableRow
        accessibilityLabel="View previous shift"
        onPress={() => setShowPreviousShift(true)}
        style={styles.detailPreviousShiftFooter}
      >
        <Ionicons color={mobileColors.textSubtle} name="arrow-undo-outline" size={16} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.detailPreviousShiftText}>
          View previous shift
        </Text>
        <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={18} />
      </PressableRow>
      <BottomSheetModal
        accessibilityLabel="Dismiss previous shift details"
        debugName="Previous shift details"
        header={
          <SheetHeader title={hasMultiplePreviousSegments ? "Previous shifts" : "Previous shift"} />
        }
        visible={showPreviousShift}
        onDismiss={() => setShowPreviousShift(false)}
      >
        {changeLines.length > 0 ? (
          <View
            accessibilityLabel={`What changed: ${changeLines.join("; ")}`}
            style={styles.previousShiftChangeSummary}
          >
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.previousShiftChangeLabel}>
              What changed
            </Text>
            {changeLines.map((line) => (
              <Text
                key={line}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={styles.previousShiftChangeLine}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {hasMultiplePreviousSegments ? (
          <View style={styles.previousShiftSegmentList}>
            {previousSegments.map((segment, index) => {
              const segmentTimeRange = formatScheduleTimeRange(segment.startTime, segment.endTime);
              const segmentFocusAreaName =
                segment.shiftId === null ? null : segment.displayFocusAreaName?.trim() || null;
              const detailParts = [segmentTimeRange, segmentFocusAreaName].filter(
                (part): part is string => Boolean(part),
              );

              return (
                <View
                  key={`${index}-${segment.shiftName ?? segment.label ?? "shift"}`}
                  accessibilityLabel={`Previous shift ${getPreviousSegmentTitle(segment)}`}
                  style={[
                    styles.previousShiftSegment,
                    index > 0 && styles.previousShiftSegmentDivider,
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={styles.previousShiftSegmentTitle}
                  >
                    {getPreviousSegmentTitle(segment)}
                  </Text>
                  {detailParts.length > 0 ? (
                    <Text
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={styles.previousShiftSegmentMeta}
                    >
                      {detailParts.join(" · ")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.previousShiftSheetDetails}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.previousShiftSegmentTitle}>
              {getPreviousPresentationTitle(previous)}
            </Text>
            {previousTimeRange ? (
              <DetailInfoRow iconName="time-outline" label="Shift time" value={previousTimeRange} />
            ) : null}
            {previousFocusAreaName ? (
              <DetailInfoRow
                iconName="location-outline"
                label="Focus area"
                value={previousFocusAreaName}
              />
            ) : null}
          </View>
        )}
      </BottomSheetModal>
    </>
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
  const [showPublication, setShowPublication] = useState(false);

  return (
    <>
      <PressableRow
        accessibilityLabel={summary}
        onPress={() => setShowPublication(true)}
        style={styles.detailPublishedFooter}
      >
        <Ionicons color={mobileColors.textSubtle} name="information-circle" size={16} />
        {/* Two lines: one cut "Published Sep 18, 2026 at 3:3…" at a raised
            text size, and the time is the part worth reading. */}
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={styles.detailPublishedText}
        >
          {publishedAtLabel ? `Published ${publishedAtLabel}` : "Published"}
          {publishedByName ? (
            <>
              {" by "}
              <Text style={styles.detailPublishedName}>{publishedByName}</Text>
            </>
          ) : null}
        </Text>
      </PressableRow>
      <BottomSheetModal
        visible={showPublication}
        onDismiss={() => setShowPublication(false)}
        header={<SheetHeader title="Publication details" />}
      >
        <Text style={styles.detailPublicationSummary}>{summary}</Text>
      </BottomSheetModal>
    </>
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
  prominent = false,
}: {
  chip: JobChip | null;
  eyebrowDisplay?: EyebrowDisplay;
  isMentored?: boolean;
  prominent?: boolean;
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
        prominent && styles.detailHeaderNameChip,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: chipBorderColor,
        },
      ]}
    >
      {shouldRenderSingleLinePill ? (
        <View style={styles.detailJobChipInlineTextRow}>
          <Text
            fit="compact"
            style={[
              styles.detailJobChipText,
              prominent && styles.detailHeroTitle,
              prominent && styles.detailHeaderName,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text
              fit="compact"
              style={[styles.detailJobChipMentoredInlineText, { color: chip.textColor }]}
            >
              (Mentored)
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.detailJobChipTextStack}>
          {shouldRenderEyebrowInsidePill ? (
            <Text
              fit="compact"
              style={[styles.detailJobChipEyebrowText, { color: chip.textColor }]}
            >
              {chip.eyebrowLabel}
            </Text>
          ) : null}
          <Text fit="compact" style={[styles.detailJobChipValueText, { color: chip.textColor }]}>
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
                  <SplitShiftBadge count={groups.length} label={group.label} />
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
  const stackJobPill = useWindowDimensions().fontScale > 1;
  const avatarTone = getAvatarTone(entry.employeeId, resolvedTheme === "dark");
  const displayName = entry.employeeId === linkedEmployeeId ? "You" : entry.employeeName;
  const jobChip = matchedSegment
    ? buildSegmentJobChip(mobileColors, resolvedTheme === "dark", matchedSegment)
    : getEntryJobChip(mobileColors, resolvedTheme === "dark", entry);
  const entryTimeRange = matchedSegment
    ? getScheduleEntrySegmentTimeRange(matchedSegment)
    : getScheduleEntryTimeRange(entry);
  const entryFocusAreaName = matchedSegment
    ? getMobileScheduleEntrySegmentFocusAreaName(entry, matchedSegment)
    : getMobileScheduleEntryDisplayFocusAreaName(entry);
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
        <Text fit="fixed" style={[styles.shiftmateAvatarText, { color: avatarTone.textColor }]}>
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.shiftmateContent}>
        {/* At a raised text size the pill moves under the name, the same
            way the Schedule tab's team rows do, so neither squeezes the other. */}
        <View style={[styles.shiftmateHeader, stackJobPill && styles.shiftmateHeaderStacked]}>
          <Text style={styles.shiftmateName}>{displayName}</Text>
          {jobChip || isMentored ? (
            <View style={[styles.shiftmateChipRow, stackJobPill && styles.shiftmateChipRowStacked]}>
              <DetailJobPill chip={jobChip} eyebrowDisplay="outside" isMentored={isMentored} />
            </View>
          ) : null}
        </View>
        {shouldShowSegments ? (
          <ShiftEntrySegmentList entry={entry} showChangeLabels={false} variant="supporting" />
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
      android_ripple={disabled ? undefined : { color: mobileColors.rippleNeutral }}
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
      android_ripple={disabled ? undefined : { color: mobileColors.rippleNeutral }}
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
  const focusAreaName = primarySegment
    ? getMobileScheduleEntrySegmentFocusAreaName(entry, primarySegment)
    : getMobileScheduleEntryDisplayFocusAreaName(entry);
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
      android_ripple={disabled ? undefined : { color: mobileColors.rippleNeutral }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.swapDateChip,
        active && styles.swapDateChipActive,
        disabled && styles.swapDateChipDisabled,
      ]}
    >
      <Text
        fit="fixed"
        style={[styles.swapDateChipWeekday, active && styles.swapDateChipTextActive]}
      >
        {dateParts.weekdayLabel}
      </Text>
      <Text fit="fixed" style={[styles.swapDateChipDay, active && styles.swapDateChipTextActive]}>
        {dateParts.dayLabel}
      </Text>
      <View
        accessibilityLabel={`${count} eligible teammate${count === 1 ? "" : "s"}`}
        style={[styles.swapDateChipCount, active && styles.swapDateChipCountActive]}
      >
        <Ionicons color={countColor} name="person-outline" size={11} />
        <Text
          fit="fixed"
          style={[styles.swapDateChipCountText, active && styles.swapDateChipCountTextActive]}
        >
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
        <ShiftEntrySegmentList
          entry={entry}
          showChangeLabels={false}
          showSegmentLabels={false}
          variant="supporting"
        />
      ) : null}
    </Pressable>
  );
}

function ShiftEntrySegmentList({
  entry,
  /**
   * Off for someone else's shifts listed as context (a swap candidate, a
   * shiftmate): what matters there is what they work, not what changed.
   */
  showChangeLabels = true,
  showSegmentLabels = true,
  suppressCountAccessibilityLabel = false,
  variant,
}: {
  entry: MobileScheduleEntry;
  showChangeLabels?: boolean;
  showSegmentLabels?: boolean;
  suppressCountAccessibilityLabel?: boolean;
  variant: "detail" | "supporting";
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const segments = getScheduleEntrySegments(entry);

  return (
    <SplitShiftSegmentList
      getSegmentStatusLabel={
        showChangeLabels
          ? (segment) => getShiftChangeLabel(getScheduleEntrySegmentChange(entry, segment))
          : undefined
      }
      includeSegmentLabelInStatus={variant === "supporting"}
      renderSegmentChip={(segment) => (
        <DetailJobPill
          chip={buildSegmentJobChip(mobileColors, isDark, segment)}
          isMentored={segment.isMentored === true}
        />
      )}
      segments={segments}
      showSegmentLabels={showSegmentLabels}
      showWhenSingle={variant === "supporting"}
      suppressCountAccessibilityLabel={suppressCountAccessibilityLabel}
      variant={variant}
    />
  );
}
