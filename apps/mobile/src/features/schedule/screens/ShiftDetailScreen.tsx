import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Text } from "../../../shared/components/Text";
import { Pressable } from "../../../shared/components/Pressable";
import { useLocalSearchParams } from "expo-router";
import { isNewShiftChange } from "@dubgrid/schedule-core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_MOBILE_SCHEDULE_RANGE_DAYS,
  type MobileScheduleEntry,
  type MobileScheduleEntrySegment,
  type MobileShiftRequest,
} from "@dubgrid/contracts";
import { capitalizeFirst, describeShiftRequestSubmitted, singularLabelNoun } from "@dubgrid/domain";
import { getAvatarTone } from "@dubgrid/design-tokens";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ScheduleNoteLabels } from "../../../shared/components/ScheduleNoteLabels";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { FullPageSheet } from "../../../shared/components/FullPageSheet";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { InlineError } from "../../../shared/components/InlineError";
import { Screen } from "../../../shared/components/Screen";
import { SkeletonCardSurface, SkeletonLine } from "../../../shared/components/skeleton";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { CardRowListSkeleton } from "../../../shared/components/skeleton/CardRowListSkeleton";
import { ShiftDetailListSkeleton } from "../components/shift-detail/ShiftDetailListSkeleton";
import { SplitShiftBadge, SplitShiftSegmentList } from "../components/SplitShift";
import { ShiftChangeButton } from "../components/ShiftChangeView";
import {
  DETAIL_ROW_INSET,
  DetailActionRow,
  DetailChoiceRow,
  DetailFieldRow,
  DetailGroup,
  DetailIntro,
  DetailNavLabel,
  DetailNavRow,
  DetailRowFrame,
} from "../components/shift-detail/DetailList";
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
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import {
  useIsDarkMode,
  useMobileColors,
  useThemeMode,
} from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { MAX_FONT_SCALE, type MobileColors, mobileSpace } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  buildScheduleSections,
  buildScheduleShiftGroups,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  formatScheduleTimeRange,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  isDeletedScheduleHistory,
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
import { scheduleNoteGroups } from "../lib/scheduleNotes";
import {
  buildRestOfDayAbsenceChip,
  restOfDayAbsenceTimeLabel,
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
import { createStyles } from "./shiftDetailScreenStyles";

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
  const focusAreaFieldLabel = capitalizeFirst(
    singularLabelNoun(bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas"),
  );
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
  const canApproveShiftRequests = Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests);
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
  // Opening Swap widens the range, which re-keys this query. Without the
  // previous data the page dropped to `loading` behind the sheet it had just
  // presented: its content blanked, scrolling locked, and the whole tree
  // remounted once the wider range landed. The narrow range is a prefix of
  // the wide one, so the shift and its shiftmates read the same from either.
  const teamScheduleQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", teamScheduleRange),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, teamScheduleRange, signal),
    enabled: canLoadTeamSchedule,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  useEffect(() => {
    if (teamScheduleQuery.error) {
      pushClientFriendlyErrorToast(pushToast, {
        error: teamScheduleQuery.error,
        title: "Couldn't load working-with list",
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
    onSuccess: async (data, variables) => {
      pushToast({
        tone: "success",
        ...describeShiftRequestSubmitted(
          { action: "created", type: variables.type, targeted: variables.targetEmpId != null },
          { autoApproved: data.autoApproved, viewerCanApprove: canApproveShiftRequests },
        ),
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
        title: "Couldn't verify existing requests",
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
    ? "Multiple shifts"
    : shiftEntry
      ? getScheduleEntryTitle(shiftEntry)
      : "";
  const isViewingOtherEmployee = Boolean(shiftEntry && shiftEntry.employeeId !== linkedEmployeeId);
  const detailTitleChip = !hasMultipleSegments ? jobChip : null;
  // A worked cell's absence for the rest of the day (item 45), after its shifts.
  const restOfDayChip = buildRestOfDayAbsenceChip(mobileColors, isDark, shiftEntry);
  // Same rule the home card applies: when the chip already names the thing (an
  // absence type, a general shift), the heading above it would only repeat the
  // word, so the eyebrow and the pill carry it alone.
  const shouldShowDetailTitle =
    hasSplitShift || shouldShowMePrimaryTitle(detailCardTitle, detailTitleChip);
  // A job is a row of its own. An absence or a general shift names itself
  // under its kind ("Absence", "General shift"), so that pill stays in the
  // title row, where it is the title.
  const jobRowChip = detailTitleChip && !detailTitleChip.eyebrowLabel ? detailTitleChip : null;
  const heroChip = detailTitleChip?.eyebrowLabel ? detailTitleChip : null;
  const heroIsMentored = !jobRowChip && primarySegment?.isMentored === true;
  const badgeInPillRow = Boolean(!shouldShowDetailTitle && shiftEntry?.change);
  const restOfDayTimeLabel = restOfDayAbsenceTimeLabel(shiftEntry);
  const scheduleNoteGroupsForEntry =
    !shiftEntry || isDeletedScheduleHistory(shiftEntry)
      ? []
      : scheduleNoteGroups(shiftEntry.indicators, getScheduleEntrySegments(shiftEntry));
  const shiftChangeForHistory = shiftEntry?.change?.shiftChange ?? null;
  // Mirrors PreviousShiftRow: the whole-day change when the server sent one,
  // else the older previous presentation.
  const hasPreviousShift =
    shiftChangeForHistory && shiftChangeForHistory.kind !== "none"
      ? !isNewShiftChange(shiftChangeForHistory)
      : Boolean(shiftEntry?.change?.previousPresentation);

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

  // A request that is one tap from being sent is the thing worth a discard
  // question, and it is the same moment the footer offers Submit: a swap
  // target, an absence reason, or the teammate a pickup names. The steps
  // before it (drop or pick up, which segment) are one tap to redo, and asking
  // "Discard this request?" after those read as the close button being broken.
  const hasSubmittableRequest =
    (requestMode === "swap" && !!selectedTargetEntry && !!shiftEntry) ||
    (requestMode === "coverage" &&
      !!shiftEntry &&
      ((coverageRequestType === "pickup" && !!selectedTargetedPickupEntry) ||
        (coverageRequestType === "calloff" && !!selectedCalloffAbsenceType)));

  // Leaving the sheet open is what makes this a guard: a dragged sheet settles
  // back into place while the confirmation sits on top of it. `onClose` is
  // what closes the sheet, kept apart from `onDiscard` so the guard can
  // sequence the confirmation's dismissal before the sheet's.
  const requestGuard = useUnsavedChangesGuard({
    isDirty: hasSubmittableRequest,
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
      body: `You'll be marked ${absenceTypeLabel} for your ${shiftLabel} shift on ${shiftDateLabel}.${
        canApproveShiftRequests
          ? " You can approve requests, so it goes on the schedule right away."
          : ""
      }`,
      confirmLabel: "Call off",
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
  const hasRequestSheetFooter = !!createRequestError || hasSubmittableRequest;
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
        <>
          <DetailIntro>Choose how you want to drop this shift.</DetailIntro>
          <DetailGroup
            footer={
              activeAbsenceTypes.length === 0 ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.coverageNotice}>
                  {"Calling off isn't set up for your organization yet. Ask an Admin."}
                </Text>
              ) : undefined
            }
          >
            <DetailChoiceRow
              detail="Teammates can claim it. It stays yours until a claim is approved."
              disabled={createRequestMutation.isPending}
              selected={coverageRequestType === "pickup"}
              title="Offer for pickup"
              onPress={() => {
                setCoverageRequestType("pickup");
                setSelectedCalloffAbsenceTypeId(null);
              }}
            />
            <DetailChoiceRow
              detail="For a shift you can't work. Once it's approved, you're marked absent and the shift opens for others to pick up."
              disabled={createRequestMutation.isPending || activeAbsenceTypes.length === 0}
              selected={coverageRequestType === "calloff"}
              title="Call off"
              tone="danger"
              onPress={() => {
                setCoverageRequestType("calloff");
                setSelectedTargetedPickupEmployeeId(null);
              }}
            />
          </DetailGroup>
          {coverageRequestType === "pickup" && !selectedTargetedPickupEntry ? (
            <DetailGroup>
              <DetailActionRow
                disabled={createRequestMutation.isPending}
                label="Offer to everyone"
                onPress={() => confirmCoverageRequest("pickup")}
              />
            </DetailGroup>
          ) : null}
          {coverageRequestType === "pickup" ? (
            <DetailGroup
              footer={
                selectedTargetedPickupEntry
                  ? "Review your request below, then submit."
                  : "Only teammates with an absence on this date are shown."
              }
              placeholder={
                <EmptyStateCard
                  compact
                  iconName="person-remove-outline"
                  title="No absent teammates on this date"
                />
              }
              title="Request specific person"
            >
              {(selectedTargetedPickupEntry
                ? [selectedTargetedPickupEntry]
                : targetedPickupOptions
              ).map((entry) => (
                <SwapOptionRow
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
            </DetailGroup>
          ) : null}
          {coverageRequestType === "calloff" ? (
            // Tapping the chosen reason again clears it.
            <DetailGroup
              footer={
                selectedCalloffAbsenceType ? "Review your call-off below, then submit." : undefined
              }
              title={selectedCalloffAbsenceType ? "Absence reason" : "Select absence reason"}
            >
              {activeAbsenceTypes.map((absenceType) => (
                <DetailChoiceRow
                  disabled={createRequestMutation.isPending}
                  key={absenceType.id}
                  selected={selectedCalloffAbsenceTypeId === absenceType.id}
                  title={getAbsenceTypeOptionLabel(absenceType)}
                  onPress={() =>
                    setSelectedCalloffAbsenceTypeId(
                      selectedCalloffAbsenceTypeId === absenceType.id ? null : absenceType.id,
                    )
                  }
                />
              ))}
            </DetailGroup>
          ) : null}
        </>
      ) : null}

      {requestMode === "swap" ? (
        <>
          <DetailIntro>
            {selectedTargetEntry
              ? "Review the trade below, then submit your swap request."
              : "Pick a teammate's published shift to trade for. The same shift on a different day works too."}
          </DetailIntro>
          {shiftEntry ? (
            <>
              <DetailGroup>
                <SwapSummaryRow
                  entry={shiftEntry}
                  label={selectedTargetEntry ? "You give" : "Your shift"}
                  segmentIndex={selectedRequesterSegmentIndex}
                />
                {selectedTargetEntry ? (
                  <SwapSummaryRow
                    entry={selectedTargetEntry}
                    label="You get"
                    segmentIndex={selectedTargetShift?.segmentIndex ?? 0}
                    summaryNote={`From ${selectedTargetEntry.employeeName}`}
                  />
                ) : null}
              </DetailGroup>
              {swapOptionsQuery.isLoading ? (
                <DetailGroup
                  placeholder={<CardRowListSkeleton rows={2} />}
                  title="Eligible teammates"
                />
              ) : swapOptionsQuery.error ? (
                <DetailGroup
                  placeholder={
                    <StatusBanner
                      actionLabel="Try again"
                      body={getQueryErrorMessage(
                        swapOptionsQuery.error,
                        "We couldn't load teammate shifts.",
                      )}
                      title="Couldn't load teammate shifts"
                      onAction={() => {
                        void swapOptionsQuery.refetch();
                      }}
                    />
                  }
                  title="Eligible teammates"
                />
              ) : swapTargetOptions.length === 0 ? (
                <DetailGroup
                  placeholder={
                    <EmptyStateCard
                      compact
                      iconName="swap-horizontal-outline"
                      title="No eligible shifts"
                      body="Eligible teammate shifts will appear here once published."
                    />
                  }
                  title="Eligible teammates"
                />
              ) : selectedTargetEntry ? (
                <DetailGroup title="Eligible teammates">
                  <DetailRowFrame>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.bodyText}>
                      {selectedTargetEntry.employeeName} is selected for{" "}
                      {formatShiftDate(selectedTargetEntry.date)}.
                    </Text>
                  </DetailRowFrame>
                </DetailGroup>
              ) : (
                <>
                  <View accessibilityLabel="Eligible swap dates">
                    <DetailGroup title="Eligible teammates">
                      <SwapWeekStepperRow
                        label={activeSwapWeekStart ? formatWeekRangeLabel(activeSwapWeekStart) : ""}
                        nextDisabled={nextEligibleSwapWeekStart == null}
                        previousDisabled={previousEligibleSwapWeekStart == null}
                        onNext={() => handleSwapWeek(1)}
                        onPrevious={() => handleSwapWeek(-1)}
                      />
                      {swapWeekDates.map((date) => (
                        <SwapDateRow
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
                    </DetailGroup>
                  </View>
                  {activeSwapSection && activeSwapDate ? (
                    <DetailGroup title={formatDetailDate(activeSwapDate)}>
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
                          <SwapOptionRow
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
                                segmentIndex: options.length > 1 ? option.segmentIndex : undefined,
                              })
                            }
                          />
                        ));
                      })}
                    </DetailGroup>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <DetailIntro>Refreshing shift details.</DetailIntro>
          )}
        </>
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
          // Drop and Swap belong to the viewer's own shift, and "Working
          // with" to a viewer who may see the team schedule; both are known
          // from bootstrap before the shift arrives. Unknown reads as absent,
          // the smaller page being the safer guess.
          <ShiftDetailListSkeleton
            showActions={Boolean(linkedEmployeeId) && employeeId === linkedEmployeeId}
            showShiftmates={canViewTeamSchedule}
          />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Couldn't load shift"
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
          <DetailGroup title={formatDetailDate(shiftEntry.date)} testID="shift-detail-card">
            <DetailRowFrame style={styles.heroRow}>
              {shouldShowDetailTitle ? (
                <View style={styles.heroTitleRow}>
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    numberOfLines={2}
                    style={[styles.heroTitle, styles.heroTitleInline]}
                  >
                    {detailCardTitle}
                  </Text>
                  <ShiftChangeBadge change={hasSplitShift ? null : shiftEntry.change} />
                </View>
              ) : null}
              {!hasSplitShift && (heroChip || heroIsMentored || restOfDayChip || badgeInPillRow) ? (
                <View style={styles.heroPillRow}>
                  {heroChip || heroIsMentored ? (
                    <DetailHeaderJobPill chip={heroChip} isMentored={heroIsMentored} />
                  ) : null}
                  {restOfDayChip ? <DetailJobPill chip={restOfDayChip} /> : null}
                  {badgeInPillRow ? <ShiftChangeBadge change={shiftEntry.change} /> : null}
                </View>
              ) : null}
              {isViewingOtherEmployee && shiftEntry.employeeName ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.heroEmployeeName}>
                  {shiftEntry.employeeName}
                </Text>
              ) : null}
            </DetailRowFrame>
            {hasSplitShift ? (
              <DetailRowFrame>
                <ShiftEntrySegmentList
                  entry={shiftEntry}
                  showSegmentLabels={false}
                  suppressCountAccessibilityLabel
                  variant="detail"
                />
              </DetailRowFrame>
            ) : null}
            {jobRowChip ? (
              <DetailFieldRow label="Job">
                <DetailJobPill chip={jobRowChip} isMentored={primarySegment?.isMentored === true} />
              </DetailFieldRow>
            ) : null}
            {!hasMultipleSegments && timeRange ? (
              <DetailFieldRow label="Shift time" prominent value={timeRange} />
            ) : null}
            {!hasMultipleSegments && focusAreaName ? (
              <DetailFieldRow label={focusAreaFieldLabel} value={focusAreaName} />
            ) : null}
            {restOfDayChip ? (
              <DetailFieldRow
                label={restOfDayTimeLabel ? "Absence" : "Part of the day"}
                value={
                  restOfDayTimeLabel
                    ? `${restOfDayChip.label}, ${restOfDayTimeLabel}, not worked`
                    : restOfDayChip.label
                }
              />
            ) : null}
            {scheduleNoteGroupsForEntry.length > 0 ? (
              <ScheduleNotesDetailRow groups={scheduleNoteGroupsForEntry} />
            ) : null}
          </DetailGroup>

          {canCreateRequestsForShift ? (
            <DetailGroup
              footer={
                hasSplitShift ? "Drop and swap actions apply to the shift you choose." : undefined
              }
            >
              <DetailActionRow
                disabled={createRequestMutation.isPending}
                label="Drop shift"
                onPress={() => resetRequestMode("coverage")}
              />
              {canCreateSwapForShift ? (
                <DetailActionRow
                  disabled={createRequestMutation.isPending}
                  label="Swap"
                  onPress={() => resetRequestMode("swap")}
                />
              ) : null}
            </DetailGroup>
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
            <DetailGroup title="Request already in progress">
              <DetailRowFrame style={styles.requestInProgressRow}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.bodyText}>
                  {`Your ${formatShiftRequestType(activeShiftRequest.type).toLowerCase()} request is ${formatShiftRequestStatus(activeShiftRequest.status).toLowerCase()} for this shift.`}
                </Text>
                {activeShiftRequest.adminNote ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.metaText}>
                    Manager note: {activeShiftRequest.adminNote}
                  </Text>
                ) : null}
              </DetailRowFrame>
            </DetailGroup>
          ) : null}

          {hasPreviousShift || publishedSummary ? (
            <DetailGroup>
              {hasPreviousShift ? (
                <PreviousShiftRow entry={shiftEntry} focusAreaFieldLabel={focusAreaFieldLabel} />
              ) : null}
              {publishedSummary ? (
                <DetailPublishedRow
                  publishedAtLabel={publishedAtLabel}
                  publishedByName={shiftEntry.publishedByName}
                  summary={publishedSummary}
                />
              ) : null}
            </DetailGroup>
          ) : null}

          {shouldRenderShiftmatesSection ? (
            hasSplitShift ? (
              <DetailGroup title="Working with">
                {shiftmateSegmentGroups.flatMap((group) => [
                  <ShiftmateSegmentHeaderRow
                    key={`${group.key}-header`}
                    group={group}
                    segmentCount={shiftmateSegmentGroups.length}
                  />,
                  ...(group.entries.length > 0
                    ? group.entries.map(({ entry, segment }, index) => (
                        <ShiftmateRow
                          key={`${group.key}-${entry.employeeId}-${index}`}
                          entry={entry}
                          groupFocusAreaName={null}
                          groupTimeRange={group.timeRange}
                          linkedEmployeeId={linkedEmployeeId}
                          matchedSegment={segment}
                        />
                      ))
                    : [
                        <DetailRowFrame key={`${group.key}-empty`}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.metaText}>
                            {`No one in ${group.label} yet`}
                          </Text>
                        </DetailRowFrame>,
                      ]),
                ])}
              </DetailGroup>
            ) : (
              <DetailGroup separatorInset={SHIFTMATE_TEXT_INSET} title="Working with">
                {shiftmates.map((entry) => (
                  <ShiftmateRow
                    key={`${entry.employeeId}-${entry.date}`}
                    entry={entry}
                    groupFocusAreaName={focusAreaName}
                    groupTimeRange={timeRange}
                    linkedEmployeeId={linkedEmployeeId}
                  />
                ))}
              </DetailGroup>
            )
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

/** The day a shift falls on, as the detail's section title: "Thursday, April 16". */
function formatDetailDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

/** A day row in the swap picker: "Fri, Apr 17". */
function formatSwapDayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

const SHIFTMATE_AVATAR_SIZE = 40;
/** Where a shiftmate row's text starts, past the avatar, for its separator. */
const SHIFTMATE_TEXT_INSET = DETAIL_ROW_INSET + SHIFTMATE_AVATAR_SIZE + mobileSpace.md;

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
    <View style={styles.headerJobPillStack}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={chip.kind === "absence" ? styles.heroTitle : styles.headerJobPillEyebrow}
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

/**
 * The shift's schedule notes, spelled out. A double shift lists each half's
 * notes under that half's shift.
 */
function ScheduleNotesDetailRow({ groups }: { groups: ReturnType<typeof scheduleNoteGroups> }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <DetailFieldRow label="Schedule notes" testID="shift-detail-schedule-notes">
      <View style={styles.noteGroups}>
        {groups.map((group) => (
          <View key={group.key} style={styles.noteGroup}>
            {group.title ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.noteGroupTitle}>
                {group.title}
              </Text>
            ) : null}
            <ScheduleNoteLabels notes={group.notes} showIcon={false} textVariant="body" />
          </View>
        ))}
      </View>
    </DetailFieldRow>
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

function PreviousShiftRow({
  entry,
  focusAreaFieldLabel,
}: {
  entry: MobileScheduleEntry;
  focusAreaFieldLabel: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [showPreviousShift, setShowPreviousShift] = useState(false);
  const previous = entry.change?.previousPresentation ?? null;
  const shiftChange = entry.change?.shiftChange ?? null;
  const changeLines = useMemo(() => describeScheduleEntryChanges(entry), [entry]);

  // The whole day Before and After (item 46d); older servers send only the
  // previous presentation, which keeps the sheet below.
  if (shiftChange && shiftChange.kind !== "none") {
    return <ShiftChangeButton change={shiftChange} variant="row" />;
  }

  if (!previous) {
    return null;
  }

  const previousSegments = previous.segments;
  const hasMultiplePreviousSegments = previousSegments.length > 1;
  const previousTimeRange = formatScheduleTimeRange(previous.startTime, previous.endTime);
  const previousFocusAreaName = getPreviousPresentationFocusAreaName(previous);

  return (
    <>
      <DetailNavRow
        accessibilityLabel="View previous shift"
        onPress={() => setShowPreviousShift(true)}
      >
        <DetailNavLabel>View previous shift</DetailNavLabel>
      </DetailNavRow>
      <BottomSheetModal
        accessibilityLabel="Dismiss previous shift details"
        debugName="Previous shift details"
        header={
          <SheetHeader title={hasMultiplePreviousSegments ? "Previous shifts" : "Previous shift"} />
        }
        visible={showPreviousShift}
        onDismiss={() => setShowPreviousShift(false)}
      >
        <View style={styles.sheetGroups}>
          {changeLines.length > 0 ? (
            <View accessibilityLabel={`What changed: ${changeLines.join("; ")}`}>
              <DetailGroup title="What changed">
                {changeLines.map((line) => (
                  <DetailRowFrame key={line}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.bodyText}>
                      {line}
                    </Text>
                  </DetailRowFrame>
                ))}
              </DetailGroup>
            </View>
          ) : null}
          {hasMultiplePreviousSegments ? (
            <DetailGroup>
              {previousSegments.map((segment, index) => {
                const segmentTimeRange = formatScheduleTimeRange(
                  segment.startTime,
                  segment.endTime,
                );
                const segmentFocusAreaName =
                  segment.shiftId === null ? null : segment.displayFocusAreaName?.trim() || null;
                const detailParts = [segmentTimeRange, segmentFocusAreaName].filter(
                  (part): part is string => Boolean(part),
                );

                return (
                  <DetailRowFrame
                    key={`${index}-${segment.shiftName ?? segment.label ?? "shift"}`}
                    accessibilityLabel={`Previous shift ${getPreviousSegmentTitle(segment)}`}
                    style={styles.previousSegmentRow}
                  >
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowTitleText}>
                      {getPreviousSegmentTitle(segment)}
                    </Text>
                    {detailParts.length > 0 ? (
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.secondaryText}>
                        {detailParts.join(" · ")}
                      </Text>
                    ) : null}
                  </DetailRowFrame>
                );
              })}
            </DetailGroup>
          ) : (
            <DetailGroup>
              <DetailRowFrame>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowTitleText}>
                  {getPreviousPresentationTitle(previous)}
                </Text>
              </DetailRowFrame>
              {previousTimeRange ? (
                <DetailFieldRow label="Shift time" prominent value={previousTimeRange} />
              ) : null}
              {previousFocusAreaName ? (
                <DetailFieldRow label={focusAreaFieldLabel} value={previousFocusAreaName} />
              ) : null}
            </DetailGroup>
          )}
        </View>
      </BottomSheetModal>
    </>
  );
}

function DetailPublishedRow({
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
      <DetailNavRow accessibilityLabel={summary} onPress={() => setShowPublication(true)}>
        {/* Two lines: one cut "Published Sep 18, 2026 at 3:3..." at a raised
            text size, and the time is the part worth reading. */}
        <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.publishedText}>
          {publishedAtLabel ? `Published ${publishedAtLabel}` : "Published"}
          {publishedByName ? (
            <>
              {" by "}
              <Text style={styles.publishedName}>{publishedByName}</Text>
            </>
          ) : null}
        </Text>
      </DetailNavRow>
      <BottomSheetModal
        visible={showPublication}
        onDismiss={() => setShowPublication(false)}
        header={<SheetHeader title="Publication details" />}
      >
        <Text style={styles.bodyText}>{summary}</Text>
      </BottomSheetModal>
    </>
  );
}

/**
 * Which half of a double shift a request is for: a pick-one list rather than
 * a segmented control, because each choice names its shift and times, and a
 * half that has started stays listed, disabled, with why.
 */
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
  return (
    <DetailGroup title="Choose shift">
      {options.map((option) => {
        const optionDisabled = disabled || isOptionDisabled?.(option.segmentIndex) === true;
        const inProgress = optionDisabled && !disabled;
        const title = `Shift ${option.segmentIndex + 1}: ${getActionSegmentLabel(
          entry,
          option.segmentIndex,
        )}`;

        return (
          <DetailChoiceRow
            key={option.segmentIndex}
            accessibilityLabel={inProgress ? `${title} · In progress` : title}
            detail={inProgress ? "In progress" : null}
            disabled={optionDisabled}
            selected={selectedIndex === option.segmentIndex}
            title={title}
            onPress={() => onSelect(option.segmentIndex)}
          />
        );
      })}
    </DetailGroup>
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

  // A tinted fill without an outline, like every other status capsule.
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.jobChip, { backgroundColor: chip.backgroundColor }]}
    >
      {shouldRenderSingleLinePill ? (
        <View style={styles.jobChipInlineTextRow}>
          <Text
            fit="compact"
            style={[
              styles.jobChipText,
              prominent && styles.jobChipTextProminent,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text fit="compact" style={[styles.jobChipMentoredText, { color: chip.textColor }]}>
              (Mentored)
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.jobChipTextStack}>
          {shouldRenderEyebrowInsidePill ? (
            <Text fit="compact" style={[styles.jobChipEyebrowText, { color: chip.textColor }]}>
              {chip.eyebrowLabel}
            </Text>
          ) : null}
          <Text fit="compact" style={[styles.jobChipText, { color: chip.textColor }]}>
            {chip.label}
            {isMentored ? (
              <Text style={[styles.jobChipMentoredText, { color: chip.textColor }]}>
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

/** A double shift's half, heading its shiftmates inside the one Working with card. */
function ShiftmateSegmentHeaderRow({
  group,
  segmentCount,
}: {
  group: ShiftmateSegmentGroup;
  segmentCount: number;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <DetailRowFrame style={styles.segmentHeaderRow}>
      <View style={styles.segmentHeaderTitle}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.segmentHeaderText}>
          {group.title}
        </Text>
        <SplitShiftBadge count={segmentCount} label={group.label} />
      </View>
      {group.timeRange ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.segmentHeaderTime}>
          {group.timeRange}
        </Text>
      ) : null}
    </DetailRowFrame>
  );
}

function ShiftmateRow({
  entry,
  groupFocusAreaName,
  groupTimeRange,
  linkedEmployeeId,
  matchedSegment,
}: {
  entry: MobileScheduleEntry;
  groupFocusAreaName: string | null;
  groupTimeRange: string | null;
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
    <DetailRowFrame style={styles.shiftmateRow}>
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
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.shiftmateName}>
            {displayName}
          </Text>
          {jobChip || isMentored ? (
            <View style={[styles.shiftmateChipRow, stackJobPill && styles.shiftmateChipRowStacked]}>
              <DetailJobPill chip={jobChip} eyebrowDisplay="outside" isMentored={isMentored} />
            </View>
          ) : null}
        </View>
        {shouldShowSegments ? (
          <ShiftEntrySegmentList entry={entry} showChangeLabels={false} variant="supporting" />
        ) : metaItems.length > 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.metaText}>
            {metaItems.join(" · ")}
          </Text>
        ) : null}
      </View>
    </DetailRowFrame>
  );
}

/** One side of a swap, as a row of the trade's card. */
function SwapSummaryRow({
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
    <DetailRowFrame style={styles.swapSummaryRow}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.fieldLabelText}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowTitleText}>
        {segmentIndex != null
          ? getActionSegmentLabel(entry, segmentIndex)
          : getScheduleEntryTitle(entry)}
      </Text>
      {jobChip || primarySegment?.isMentored ? (
        <View style={styles.jobPillRow}>
          <DetailJobPill chip={jobChip} isMentored={primarySegment?.isMentored === true} />
        </View>
      ) : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.secondaryTabularText}>
        {formatShiftDate(entry.date)}
      </Text>
      {summaryNote ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.secondaryText}>
          {summaryNote}
        </Text>
      ) : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.secondaryText}>
        {summaryMeta}
      </Text>
    </DetailRowFrame>
  );
}

/** The swap picker's week, stepped with the platform's bare chevrons. */
function SwapWeekStepperRow({
  label,
  previousDisabled,
  nextDisabled,
  onPrevious,
  onNext,
}: {
  label: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const chevron = (direction: "back" | "forward") => {
    const disabled = direction === "back" ? previousDisabled : nextDisabled;
    return (
      <Pressable
        accessibilityLabel={direction === "back" ? "Go to previous week" : "Go to next week"}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        android_ripple={
          disabled ? undefined : { color: mobileColors.rippleNeutral, borderless: true }
        }
        disabled={disabled}
        hitSlop={8}
        onPress={direction === "back" ? onPrevious : onNext}
        style={styles.weekChevron}
      >
        <Ionicons
          color={disabled ? mobileColors.textSubtle : mobileColors.brand}
          name={direction === "back" ? "chevron-back" : "chevron-forward"}
          size={22}
        />
      </Pressable>
    );
  };

  return (
    <DetailRowFrame style={styles.weekStepperRow}>
      {chevron("back")}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.weekStepperLabel}>
        {label}
      </Text>
      {chevron("forward")}
    </DetailRowFrame>
  );
}

function SwapDateRow({
  active,
  count,
  date,
  onPress,
}: {
  active: boolean;
  count: number;
  date: string;
  onPress: () => void;
}) {
  return (
    <DetailChoiceRow
      accessibilityLabel={`Show eligible teammates for ${formatShiftDate(date)}`}
      accessibilityValue={`${count} eligible teammate${count === 1 ? "" : "s"}`}
      selected={active}
      title={formatSwapDayLabel(date)}
      trailing={count === 0 ? "None" : `${count} ${count === 1 ? "teammate" : "teammates"}`}
      onPress={onPress}
    />
  );
}

function SwapOptionRow({
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
  const optionLabel =
    segmentIndex != null
      ? `Shift ${segmentIndex + 1}: ${getActionSegmentLabel(entry, segmentIndex)}`
      : null;
  const detail = [optionLabel, detailLabel].filter(Boolean).join("\n") || null;

  return (
    <DetailChoiceRow
      accessibilityLabel={[entry.employeeName, optionLabel, detailLabel].filter(Boolean).join(". ")}
      detail={detail}
      disabled={disabled}
      selected={active}
      title={entry.employeeName}
      onPress={onPress}
    >
      {showSegments && segmentIndex == null ? (
        <ShiftEntrySegmentList
          entry={entry}
          showChangeLabels={false}
          showSegmentLabels={false}
          variant="supporting"
        />
      ) : null}
    </DetailChoiceRow>
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
