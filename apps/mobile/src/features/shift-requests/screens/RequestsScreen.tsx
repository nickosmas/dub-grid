import { resolveJobChipTone } from "@dubgrid/design-tokens";
import { useFoldEntering } from "../../../shared/layout/FoldFade";
import {
  describeAwaitingRecipient,
  describeShiftRequest,
  describeShiftRequestNoteRecipients,
  describeShiftRequestPill,
  groupManagerQueue,
  isAwaitingRecipient,
  formatShiftRequestNote,
} from "@dubgrid/domain";
import {
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Stack, router, useIsFocused, useLocalSearchParams } from "expo-router";
import {
  createDetailStackOptions,
  createSplitTopLevelStackOptions,
} from "../../../shared/navigation/top-level-stack";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { shouldPushPickOnClose } from "../../../shared/layout/fold-rule";
import { SplitView, useSplitLayout } from "../../../shared/layout/SplitView";
import { NARROW_LIST_MAX_WIDTH } from "../../../shared/layout/split-layout";
import { PaneTitle } from "../../../shared/layout/PaneTitle";
import { RequestDetail, ShiftRoster, shiftRosterKey } from "../components/RequestDetail";
import { Text } from "../../../shared/components/Text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileOpenShift,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
  MobileShiftRequestHistoryCursor,
  ResolvedSchedulePresentation,
  ScheduleCellState,
} from "@dubgrid/contracts";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { SectionNotice } from "../../people/components/SectionNotice";
import { ProfileTextInput } from "../../profile/components/ProfilePrimitives";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import {
  getMySchedule,
  getShiftRequestHistory,
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { CardRowListSkeleton } from "../../../shared/components/skeleton";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import {
  optimisticPatch,
  useOptimisticMutation,
} from "../../../shared/hooks/useOptimisticMutation";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileBorderColorFromText,
  mobileDarkenTone,
  mobileRadii,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { isOnSchedule } from "../../auth/hooks/employmentStatus";
import { useMobileShiftRequestsRealtime } from "../hooks/useMobileShiftRequestsRealtime";
import {
  type MobileRequestActionFeedback,
  getMobileRequestActionFeedback,
  getMobileRequestActionKey,
  getMobileRequestActionSuccessToast,
} from "../lib/request-action-feedback";
import { getMineEmptyState } from "../lib/mine-empty-state";
import { SplitShiftBadge, SplitShiftSegmentList } from "../../schedule/components/SplitShift";
import {
  getOpenShiftFocusAreaName,
  getOpenShiftTimeRange,
} from "../../schedule/lib/openShiftPresentation";
import {
  addDaysToIsoDate,
  buildAvailableOpenShiftFeed,
  formatScheduleDayLabel,
  formatScheduleTimeRange,
  getIsoDateInTimeZone,
  getSplitShiftSegmentsFromPresentation,
  hasShiftRequestStarted,
} from "../../schedule/lib/schedule";
import { RequestCardActions, type RequestCardAction } from "../components/RequestCardActions";
import { RequestListActionRow, RequestListSection } from "../components/RequestListSection";
import { createStyles } from "./requestsScreenStyles";

const ACTIVE_REQUEST_STATUSES = new Set(["open", "pending_approval"]);
const HISTORY_PAGE_SIZE = 25;

type ShiftRequestsResponse = Awaited<ReturnType<typeof getShiftRequests>>;

/**
 * The status an action lands on, for the actions whose outcome the client can
 * state with certainty.
 *
 * `claim`, `respond` and `volunteer_open_shift` cascade into schedule cells,
 * coverage and open-shift availability that only the server resolves, so they
 * return null and wait rather than guessing. Being confidently wrong about
 * who is working is worse than being slow about it.
 */

function getOptimisticRequestStatus(body: RequestActionBody): MobileShiftRequest["status"] | null {
  if (body.action === "resolve") {
    return body.approved ? "approved" : "rejected";
  }

  if (body.action === "cancel") {
    return "cancelled";
  }

  return null;
}

type RequestTab = "available" | "all" | "mine" | "approval" | "history";
type RequestActionBody =
  | { action: "cancel"; empId: string; note?: string }
  | { action: "claim"; claimerEmpId: string }
  | { action: "respond"; empId: string; accept: boolean }
  | { action: "resolve"; approved: boolean; note?: string }
  | {
      action: "volunteer_open_shift";
      empId: string;
      shiftDate: string;
      focusAreaId: number;
      state: MobileOpenShift["state"];
    };
type PendingRequestAction = {
  key: string;
} | null;
type RequestActionConfirmation = {
  requestId: string;
  body: RequestActionBody;
  feedback: MobileRequestActionFeedback;
  /** A decision with an optional note to both people: a sheet, not a confirmation. */
  takesNote: boolean;
  requestType: MobileShiftRequest["type"] | null;
} | null;

type ShiftPillColors = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};
type JobColorSource = {
  jobColor?: string | null;
  jobBorderColor?: string | null;
  jobTextColor?: string | null;
  isMentored?: boolean | null;
};
type JobChipKind = "job" | "general";
type JobChip = ShiftPillColors & {
  kind: JobChipKind;
  label: string;
  eyebrowLabel?: string | null;
  isMentored?: boolean;
};

function hasMentoredSegments(
  segments: ReadonlyArray<{ isMentored?: boolean | null }> | null | undefined,
): boolean {
  return segments?.some((segment) => segment.isMentored === true) ?? false;
}

function MentoredPill() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text fit="compact" style={styles.mentoredPillText}>
        Mentored
      </Text>
    </View>
  );
}

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

function getPresentationShiftLabel(presentation: ResolvedSchedulePresentation | null): string {
  const primarySegment = presentation?.segments?.[0] ?? null;

  return primarySegment?.shiftName ?? presentation?.shiftName ?? presentation?.label ?? "Shift";
}

function getPresentationTimeRange(
  presentation: ResolvedSchedulePresentation | null,
  state: ScheduleCellState | null,
): string | null {
  const segments = presentation?.segments ?? [];
  const firstSegmentWithTime = segments.find((segment) => segment.startTime && segment.endTime);
  const lastSegmentWithTime =
    [...segments].reverse().find((segment) => segment.startTime && segment.endTime) ?? null;

  if (firstSegmentWithTime && lastSegmentWithTime) {
    return formatScheduleTimeRange(firstSegmentWithTime.startTime, lastSegmentWithTime.endTime);
  }

  if (presentation?.startTime && presentation.endTime) {
    return formatScheduleTimeRange(presentation.startTime, presentation.endTime);
  }

  return formatScheduleTimeRange(state?.customStartTime ?? null, state?.customEndTime ?? null);
}

function getOpenShiftLabel(openShift: MobileOpenShift): string {
  return getPresentationShiftLabel(openShift.presentation);
}

function buildJobChip(
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

  const tone = resolveJobChipTone(trimmedLabel, isDark, mobileColors);

  return {
    kind: "job",
    label: trimmedLabel,
    isMentored: colorSource?.isMentored === true,
    ...tone,
  };
}

function buildGeneralShiftChip(
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

function isGeneralShiftSegment(segment: { shiftId?: number | null } | null | undefined): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

function getOpenShiftJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  openShift: MobileOpenShift,
): JobChip | null {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getOpenShiftLabel(openShift),
      primarySegment,
    );
  }

  const segment = openShift.presentation.segments.find((item) => item.jobName) ?? null;

  return buildJobChip(mobileColors, isDark, segment?.jobName ?? null, segment);
}

function getSegmentJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  segment: MobileScheduleEntrySegment,
): JobChip | null {
  if (isGeneralShiftSegment(segment)) {
    return buildGeneralShiftChip(mobileColors, isDark, segment.shiftName ?? segment.label, segment);
  }

  return buildJobChip(mobileColors, isDark, segment.jobName ?? null, segment);
}

type ChipTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

// The one pill a card carries: a kind while open, in the tone Home's approval
// queue gives that kind (an open shift shares the brand tone), and a status
// tone once the request is waiting or decided. No red: a rejection is history.
function createChipTones(
  mobileColors: MobileColors,
): Record<MobileShiftRequest["type"] | "openShift" | "pending" | "approved" | "closed", ChipTone> {
  const brand = {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
    textColor: mobileColors.brand,
  };
  const success = {
    backgroundColor: mobileColors.successSoft,
    borderColor: mobileColors.successBorder,
    textColor: mobileColors.successText,
  };
  const warning = {
    backgroundColor: mobileColors.warningSoft,
    borderColor: mobileColors.warningBorder,
    textColor: mobileColors.warningText,
  };

  return {
    openShift: brand,
    pickup: brand,
    swap: success,
    calloff: warning,
    pending: warning,
    approved: success,
    closed: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textSecondary,
    },
  };
}

/**
 * The Requests tab, or with `page` one request as its own page: the closed
 * phone opens a request there, the same page the open iPhone Duo shows beside
 * its list, answers included.
 */
export default function RequestsScreen({ page = false }: { page?: boolean }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const params = useLocalSearchParams<{
    id?: string | string[];
    requestId?: string | string[];
    tab?: string | string[];
  }>();
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const { pushToast } = useToast();
  const now = useRealtimeNow();
  const [selectedTab, setSelectedTab] = useState<RequestTab | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingRequestAction>(null);
  const [requestActionConfirmation, setRequestActionConfirmation] =
    useState<RequestActionConfirmation>(null);
  // An approver may leave a note with either decision; it lives in the
  // confirmation and travels with the body when the decision is confirmed.
  const [resolveNote, setResolveNote] = useState("");
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const openShiftVisibility = bootstrapQuery.data?.currentOrg.openShiftVisibility;
  const todayDate = useMemo(() => getIsoDateInTimeZone(now, timeZone), [now, timeZone]);
  const requestRange = useMemo(
    () => ({
      startDate: todayDate,
      endDate: addDaysToIsoDate(todayDate, 13),
    }),
    [todayDate],
  );
  const canApprove = Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests);
  const canEditShifts = Boolean(bootstrapQuery.data?.permissions.canEditShifts);
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const canViewAllRequests = canApprove || canEditShifts || canManageEmployees;
  const canViewScheduleTab = Boolean(bootstrapQuery.data?.permissions.canViewSchedule);
  const hasOwnShifts = isOnSchedule(bootstrapQuery.data?.linkedEmployee?.focusAreaIds ?? []);
  const requestsQueryKey = useMemo(
    () => mobileQueryKeys.shiftRequests(accessToken, requestRange),
    [accessToken, requestRange.startDate, requestRange.endDate],
  );
  const requestsQuery = useQuery({
    queryKey: requestsQueryKey,
    queryFn: ({ signal }) => getShiftRequests(accessToken!, requestRange, signal),
    enabled: Boolean(accessToken),
    // Keyed by the visible range: hold the previous page rather than flashing a
    // skeleton when the user changes it.
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const historyQueryKey = useMemo(
    () => mobileQueryKeys.shiftRequestHistory(accessToken, HISTORY_PAGE_SIZE),
    [accessToken],
  );
  const historyQuery = useInfiniteQuery({
    queryKey: historyQueryKey,
    enabled: Boolean(accessToken),
    initialPageParam: null as MobileShiftRequestHistoryCursor | null,
    queryFn: ({ pageParam, signal }) =>
      getShiftRequestHistory(
        accessToken!,
        {
          limit: HISTORY_PAGE_SIZE,
          cursorCreatedAt: pageParam?.createdAt,
          cursorId: pageParam?.id,
        },
        signal,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  // Named rather than inline so the content-state gate below can ask the same
  // question: a query that is never enabled is also never "resolved".
  const canLoadAvailabilitySchedule =
    Boolean(accessToken) && Boolean(linkedEmployeeId) && !canViewAllRequests;
  const availabilityScheduleQuery = useQuery({
    queryKey: mobileQueryKeys.shiftRequestAvailability(accessToken, requestRange),
    queryFn: ({ signal }) => getMySchedule(accessToken!, requestRange, signal),
    enabled: canLoadAvailabilitySchedule,
  });
  const refreshRequests = useCallback(() => {
    const refreshes: Array<Promise<unknown>> = [requestsQuery.refetch(), historyQuery.refetch()];

    if (linkedEmployeeId && !canViewAllRequests) {
      refreshes.push(availabilityScheduleQuery.refetch());
    }

    return Promise.all(refreshes);
  }, [
    availabilityScheduleQuery,
    canViewAllRequests,
    historyQuery,
    linkedEmployeeId,
    requestsQuery,
  ]);
  const manualRefresh = useManualRefresh(refreshRequests);
  useMobileShiftRequestsRealtime({
    orgId: bootstrapQuery.data?.currentOrg.id ?? null,
    onChange: refreshRequests,
  });
  const requestActionMutation = useOptimisticMutation({
    mutationFn: async (input: {
      requestId: string;
      body: RequestActionBody;
      requestType: MobileShiftRequest["type"] | null;
    }) => updateShiftRequest(accessToken!, input.requestId, input.body),
    patches: (input) => {
      const status = getOptimisticRequestStatus(input.body);

      if (!status) {
        return [];
      }

      return [
        optimisticPatch<ShiftRequestsResponse, typeof input>(requestsQueryKey, (previous) =>
          previous
            ? {
                ...previous,
                requests: previous.requests.map((request) =>
                  request.id === input.requestId ? { ...request, status } : request,
                ),
              }
            : previous,
        ),
      ];
    },
    successToast: (data, variables) => ({
      tone: "success",
      ...getMobileRequestActionSuccessToast(variables.body, data, variables.requestType),
    }),
    errorToast: {
      title: "Couldn't update request",
      fallbackMessage: "We couldn't update that shift request.",
    },
    announceOnSuccess: (data, variables) =>
      getMobileRequestActionSuccessToast(variables.body, data, variables.requestType).title ?? null,
    onSuccess: async () => {
      // The user's own availability view is derived from schedule cells the
      // server rewrites on approval, so it has to come from the server.
      if (linkedEmployeeId && !canViewAllRequests) {
        await availabilityScheduleQuery.refetch();
      }
    },
    // Claim, respond and volunteer patch nothing optimistically, so the
    // requests query itself must be refetched or the card keeps its live
    // Claim button after a success toast.
    invalidateKeys: [
      requestsQueryKey,
      historyQueryKey,
      mobileQueryKeys.shiftRequestAvailability(accessToken, requestRange),
    ],
  });
  const runRequestAction = useCallback(
    (requestId: string, body: RequestActionBody) => {
      if (requestActionMutation.isPending || pendingAction) {
        return;
      }

      const request = requestsQuery.data?.requests.find((candidate) => candidate.id === requestId);
      const feedback = getMobileRequestActionFeedback({
        requestId,
        body,
        request,
        viewerCanApprove: canApprove,
      });
      // A manager withdrawing over the recipient's head gets the note field
      // too; the requester's own cancel stays a plain confirmation.
      const takesNote =
        body.action === "resolve" ||
        (body.action === "cancel" &&
          request != null &&
          isAwaitingRecipient(request) &&
          request.requesterEmpId !== linkedEmployeeId);
      setResolveNote("");
      setRequestActionConfirmation({
        requestId,
        body,
        feedback,
        takesNote,
        requestType: request?.type ?? null,
      });
    },
    [
      canApprove,
      linkedEmployeeId,
      pendingAction,
      requestActionMutation.isPending,
      requestsQuery.data?.requests,
    ],
  );

  const confirmRequestAction = useCallback(() => {
    if (!requestActionConfirmation) return;

    const { requestId, feedback, requestType } = requestActionConfirmation;
    const note = resolveNote.trim();
    const body: RequestActionBody =
      requestActionConfirmation.takesNote &&
      note &&
      (requestActionConfirmation.body.action === "resolve" ||
        requestActionConfirmation.body.action === "cancel")
        ? { ...requestActionConfirmation.body, note }
        : requestActionConfirmation.body;
    setRequestActionConfirmation(null);
    setPendingAction({ key: feedback.key });
    // Returned so `ConfirmationModal` can latch on it. The guard above reads
    // state that a same-tick second tap has not seen cleared yet, so without
    // the promise a double-tap approves the request twice. Settling resolves
    // rather than rejects: the mutation's own `onError` already toasts.
    return new Promise<void>((resolve) => {
      requestActionMutation.mutate(
        { requestId, body, requestType },
        {
          onSettled: () => {
            setPendingAction(null);
            resolve();
          },
        },
      );
    });
  }, [requestActionConfirmation, requestActionMutation, resolveNote]);

  const requests = requestsQuery.data?.requests ?? [];
  const isResolveConfirmation = Boolean(requestActionConfirmation?.takesNote);
  // A typed note asks before it is dropped. No Save: the only way to keep it is
  // the decision itself, which is the person's to make on the sheet.
  const decisionNoteGuard = useUnsavedChangesGuard({
    isDirty: isResolveConfirmation && resolveNote.trim() !== "",
    disabled: pendingAction != null,
    onDiscard: () => setResolveNote(""),
    onClose: () => setRequestActionConfirmation(null),
  });
  const resolveNoteRecipients = useMemo(() => {
    const confirmation = requestActionConfirmation;
    if (!confirmation?.takesNote) return "";
    const request = requests.find((candidate) => candidate.id === confirmation.requestId);
    return request ? describeShiftRequestNoteRecipients(request) : "the staff involved";
  }, [requestActionConfirmation, requests]);

  const openShifts = requestsQuery.data?.openShifts ?? [];
  const availabilityScheduleEntries = availabilityScheduleQuery.data?.entries ?? [];
  const availableOpenShiftFeed = useMemo(
    () =>
      buildAvailableOpenShiftFeed({
        linkedEmployeeId,
        scheduleEntries: availabilityScheduleEntries,
        openShifts,
        requests,
        now,
        showAll: canViewAllRequests,
        timeZone,
        coverageGapVisibility: openShiftVisibility?.coverageGap,
        calloffVisibility: openShiftVisibility?.calloff,
      }),
    [
      availabilityScheduleEntries,
      linkedEmployeeId,
      now,
      openShifts,
      requests,
      canViewAllRequests,
      timeZone,
      openShiftVisibility,
    ],
  );
  const myRequests = useMemo(
    () =>
      linkedEmployeeId
        ? requests.filter(
            (request) =>
              (request.requesterEmpId === linkedEmployeeId ||
                request.targetEmpId === linkedEmployeeId) &&
              ACTIVE_REQUEST_STATUSES.has(request.status) &&
              !hasShiftRequestStarted(request, now, timeZone),
          )
        : [],
    [linkedEmployeeId, now, requests, timeZone],
  );
  // The manager's queue: what waits on them, and, so it is not invisible
  // until the recipient answers, what waits on someone else.
  const approvalRequests = useMemo(
    () =>
      canApprove
        ? requests.filter(
            (request) =>
              (request.status === "pending_approval" ||
                (request.status === "open" && request.targetEmpId == null) ||
                isAwaitingRecipient(request)) &&
              !hasShiftRequestStarted(request, now, timeZone),
          )
        : [],
    [canApprove, now, requests, timeZone],
  );
  const approvalGroups = useMemo(() => groupManagerQueue(approvalRequests), [approvalRequests]);
  const allRequests = useMemo(
    () =>
      canViewAllRequests
        ? requests.filter(
            (request) =>
              ACTIVE_REQUEST_STATUSES.has(request.status) &&
              !hasShiftRequestStarted(request, now, timeZone),
          )
        : [],
    [canViewAllRequests, now, requests, timeZone],
  );
  const historyRequests = useMemo(() => {
    const requestById = new Map<string, MobileShiftRequest>();

    for (const page of historyQuery.data?.pages ?? []) {
      for (const request of page.requests) {
        if (!requestById.has(request.id)) {
          requestById.set(request.id, request);
        }
      }
    }

    return [...requestById.values()];
  }, [historyQuery.data]);
  const hasOwnHistory = Boolean(
    linkedEmployeeId &&
    historyRequests.some(
      (request) =>
        request.requesterEmpId === linkedEmployeeId || request.targetEmpId === linkedEmployeeId,
    ),
  );
  const contentState = useMobileContentState({
    // "The queries resolved", not "some derived bucket is non-empty". The old
    // form re-entered `loading` any time a refetch transiently emptied every
    // bucket, repainting the skeleton over content that was already on screen.
    // Every query named in `isLoading` is named here too, bootstrap included:
    // the tab counts and permissions come from it, so clearing the skeleton
    // without it shows an empty, wrong-looking set of tabs for a frame.
    // The availability query is disabled for anyone who can view all requests,
    // and a disabled query never resolves, so requiring its data left `hasData`
    // false forever for admins and approvers: every error or offline moment
    // repainted the whole screen over requests already on it.
    hasData:
      requestsQuery.data !== undefined &&
      (!canLoadAvailabilitySchedule || availabilityScheduleQuery.data !== undefined) &&
      bootstrapQuery.data !== undefined,
    isEmpty:
      availableOpenShiftFeed.totalCount === 0 &&
      allRequests.length === 0 &&
      myRequests.length === 0 &&
      approvalRequests.length === 0,
    isLoading:
      requestsQuery.isLoading || bootstrapQuery.isLoading || availabilityScheduleQuery.isLoading,
    error: requestsQuery.error ?? bootstrapQuery.error ?? availabilityScheduleQuery.error,
  });
  const historyContentState = useMobileContentState({
    hasData: historyQuery.data !== undefined,
    isEmpty: historyRequests.length === 0,
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
  });
  const tabs = [
    {
      key: "available" as const,
      label: "Available",
      count: availableOpenShiftFeed.totalCount,
      visible: true,
    },
    {
      key: "all" as const,
      label: "All",
      count: allRequests.length,
      visible: canViewAllRequests,
    },
    {
      key: "mine" as const,
      label: "Mine",
      count: myRequests.length,
      visible: true,
    },
    {
      key: "approval" as const,
      label: "Approval",
      count: approvalRequests.length,
      visible: canApprove,
    },
    {
      key: "history" as const,
      label: "History",
      count: historyRequests.length,
      visible: true,
    },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const routeTab = useMemo(() => {
    const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

    if (
      rawTab === "available" ||
      rawTab === "all" ||
      rawTab === "mine" ||
      rawTab === "approval" ||
      rawTab === "history"
    ) {
      return rawTab;
    }

    return null;
  }, [params.tab]);
  const highlightedRequestId = useMemo(() => {
    const rawRequestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;

    return rawRequestId ?? null;
  }, [params.requestId]);
  const highlightedRequest = useMemo(
    () =>
      highlightedRequestId
        ? ([...requests, ...historyRequests].find(
            (request) => request.id === highlightedRequestId,
          ) ?? null)
        : null,
    [highlightedRequestId, historyRequests, requests],
  );
  const defaultTab = useMemo((): RequestTab => {
    if (routeTab && visibleTabs.some((tab) => tab.key === routeTab)) {
      return routeTab;
    }

    if (highlightedRequest) {
      if (
        linkedEmployeeId &&
        highlightedRequest.requesterEmpId === linkedEmployeeId &&
        ACTIVE_REQUEST_STATUSES.has(highlightedRequest.status)
      ) {
        return "mine";
      }
      if (canApprove && highlightedRequest.status === "pending_approval") {
        return "approval";
      }
      if (!ACTIVE_REQUEST_STATUSES.has(highlightedRequest.status)) {
        return "history";
      }
      return canViewAllRequests ? "all" : "available";
    }

    if (approvalRequests.length > 0) {
      return "approval";
    }
    if (allRequests.length > 0) {
      return "all";
    }
    if (availableOpenShiftFeed.totalCount > 0) {
      return "available";
    }
    if (myRequests.length > 0) {
      return "mine";
    }
    if (historyRequests.length > 0) {
      return "history";
    }

    return "available";
  }, [
    approvalRequests.length,
    allRequests.length,
    availableOpenShiftFeed.totalCount,
    canApprove,
    canViewAllRequests,
    highlightedRequest,
    historyRequests.length,
    linkedEmployeeId,
    myRequests.length,
    routeTab,
    visibleTabs,
  ]);
  const activeTab = selectedTab ?? defaultTab;

  // Open on the iPhone Duo, the list sits beside the whole request. Before a
  // pick it shows the first request in the tab.
  const split = useSplitLayout();
  const foldEntering = useFoldEntering(split !== null);
  const pageStackOptions = useMemo(
    () => createDetailStackOptions(mobileColors, "Request"),
    [mobileColors],
  );
  const [pickedRequestId, setPickedRequestId] = useState<string | null>(null);
  const tabRequests = useMemo((): MobileShiftRequest[] => {
    if (activeTab === "available") {
      return availableOpenShiftFeed.groups.flatMap((group) =>
        group.items.flatMap((item) => (item.kind === "open_shift" ? [] : [item.request])),
      );
    }
    if (activeTab === "all") return allRequests;
    if (activeTab === "mine") return myRequests;
    if (activeTab === "approval") return approvalRequests;
    return historyRequests;
  }, [
    activeTab,
    availableOpenShiftFeed,
    allRequests,
    myRequests,
    approvalRequests,
    historyRequests,
  ]);
  // The Available tab lists open shifts beside requests; either can be picked.
  const tabItems = useMemo((): PaneItem[] => {
    if (activeTab !== "available") {
      return tabRequests.map((request) => ({ kind: "request", request }));
    }
    return availableOpenShiftFeed.groups.flatMap((group) =>
      group.items.map((item): PaneItem =>
        item.kind === "open_shift"
          ? { kind: "open_shift", openShift: item.openShift }
          : { kind: "request", request: item.request },
      ),
    );
  }, [activeTab, availableOpenShiftFeed, tabRequests]);
  const shownItem =
    tabItems.find((item) => paneItemId(item) === pickedRequestId) ?? tabItems[0] ?? null;
  // While the tab loads, the split holds its place; an empty tab is one page
  // across the screen.
  const tabLoading =
    activeTab === "history"
      ? historyContentState.kind === "loading"
      : contentState.kind === "loading";
  const showsSplit = split !== null && (shownItem !== null || tabLoading);
  const requestsStackOptions = useMemo(
    () => createSplitTopLevelStackOptions(mobileColors, "Requests", showsSplit),
    [mobileColors, showsSplit],
  );
  const pageRequestId = page ? (Array.isArray(params.id) ? params.id[0] : params.id) : null;
  // Opening the Duo on a request's page goes back to the list with it picked.
  useEffect(() => {
    if (pageRequestId && split) {
      router.dismissTo({ pathname: "/(tabs)/requests", params: { requestId: pageRequestId } });
    }
  }, [pageRequestId, split]);
  useEffect(() => {
    if (!page && split && highlightedRequestId) setPickedRequestId(highlightedRequestId);
  }, [page, split, highlightedRequestId]);
  const isShown = (id: string) =>
    split !== null && shownItem !== null && paneItemId(shownItem) === id;
  // A held-tall list pane is too narrow for the name beside its pill.
  const narrowList = split !== null && split.listWidth < NARROW_LIST_MAX_WIDTH;
  // Folding closed keeps a picked request in view: the closed list shows it
  // outlined, with its answers, the way a link to a request does. A default
  // the split chose on its own leaves the list as it was.
  const isFocused = useIsFocused();
  const wasSplitRef = useRef(split !== null);
  useEffect(() => {
    const wasSplit = wasSplitRef.current;
    wasSplitRef.current = split !== null;
    if (!isFocused) return;
    // A picked request becomes its page with Back; an open shift's card
    // already holds all of it, so the closed list just shows it.
    const pickedRequest = tabRequests.some((request) => request.id === pickedRequestId);
    if (
      pickedRequest &&
      shouldPushPickOnClose({ wasSplit, isSplit: split !== null, pickedId: pickedRequestId })
    ) {
      openRequestPage(pickedRequestId as string);
    }
  }, [split, isFocused, pickedRequestId, tabRequests]);
  // Split, each request is a row of one grouped list, as Mail lists mail,
  // and the whole request opens beside it; closed, each is its own card.
  const requestItem = (
    request: MobileShiftRequest,
    { canApprove: canApproveHere, showDate = true }: { canApprove: boolean; showDate?: boolean },
  ) => (
    <RequestCard
      key={request.id}
      variant={split ? "row" : "card"}
      selected={isShown(request.id)}
      onSelect={() => setPickedRequestId(request.id)}
      stackHeader={narrowList}
      now={now}
      timeZone={timeZone}
      canApprove={canApproveHere}
      linkedEmployeeId={linkedEmployeeId}
      pendingAction={pendingAction}
      onAction={(body) => runRequestAction(request.id, body)}
      highlighted={!split && highlightedRequestId === request.id}
      onOpen={split ? undefined : () => openRequestPage(request.id)}
      request={request}
      showDate={showDate}
    />
  );
  const grouped = (items: ReactNode[]) =>
    split ? (
      <View style={styles.rowGroup}>
        {items.map((item, index) => (
          <Fragment key={isValidElement(item) && item.key != null ? item.key : index}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            {item}
          </Fragment>
        ))}
      </View>
    ) : (
      items
    );
  // The default is chosen once from the first loaded counts and then held:
  // recomputing it on every change moved the strip out from under a manager
  // the moment they approved the last pending request.
  useEffect(() => {
    if (selectedTab == null && contentState.kind !== "loading") {
      setSelectedTab(defaultTab);
    }
  }, [contentState.kind, defaultTab, selectedTab]);
  // A deep link that names a tab (an alert, a home card) still wins over the
  // latched choice, as it did before the latch.
  // Cleared once applied: the tab stays mounted, so the same link opened
  // again has to change the param to take effect again.
  useEffect(() => {
    if (routeTab) {
      setSelectedTab(routeTab);
      router.setParams({ tab: undefined });
    }
  }, [routeTab]);

  const actionModals = (
    <>
      {/* A decision that takes a note is a small form, so it gets a sheet;
        the confirmation modal stays for the one-tap actions. */}
      <ConfirmationModal
        body={requestActionConfirmation?.feedback.message}
        confirmLabel={requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"}
        confirmTone={
          requestActionConfirmation?.feedback.confirmStyle === "destructive" ? "danger" : "primary"
        }
        onCancel={() => setRequestActionConfirmation(null)}
        onConfirm={confirmRequestAction}
        title={requestActionConfirmation?.feedback.title ?? "Confirm action?"}
        visible={Boolean(requestActionConfirmation) && !isResolveConfirmation}
      />
      <BottomSheetModal
        footer={
          <SheetActions
            primaryAction={
              <Button
                label={requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"}
                onPress={confirmRequestAction}
                tone={
                  requestActionConfirmation?.feedback.confirmStyle === "destructive"
                    ? "danger"
                    : "primary"
                }
              />
            }
          >
            {/* "Dismiss" when the decision itself is a cancel, so the two
              buttons cannot read as the same word. */}
            <Button
              label={requestActionConfirmation?.body.action === "cancel" ? "Dismiss" : "Cancel"}
              onPress={decisionNoteGuard.requestClose}
              tone="neutral"
            />
          </SheetActions>
        }
        header={
          <SheetHeader
            subtitle={requestActionConfirmation?.feedback.message}
            title={requestActionConfirmation?.feedback.title ?? "Confirm action?"}
          />
        }
        hasUnsavedChanges={decisionNoteGuard.isDirty}
        overlay={
          <ConfirmationModal presentation="inline" {...decisionNoteGuard.confirmationProps} />
        }
        visible={isResolveConfirmation}
        onDismiss={decisionNoteGuard.requestClose}
      >
        <SectionNotice
          messages={requestActionConfirmation?.feedback.warning ?? []}
          tone="warning"
        />
        <ProfileTextInput
          label={`Note to ${resolveNoteRecipients} (optional)`}
          maxLength={500}
          multiline
          onChangeText={setResolveNote}
          placeholder="Anything they should know"
          value={resolveNote}
        />
      </BottomSheetModal>
    </>
  );

  const pageRequest = pageRequestId
    ? ([...requests, ...historyRequests].find((request) => request.id === pageRequestId) ?? null)
    : null;
  const pageScreen = (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      <Stack.Screen options={pageStackOptions} />
      {pageRequest ? (
        <RequestDetail
          heading={describeRequestHeading(pageRequest, linkedEmployeeId)}
          card={
            <RequestCard
              variant="detail"
              canApprove={canApprove}
              highlighted={false}
              linkedEmployeeId={linkedEmployeeId}
              now={now}
              onAction={(body) => runRequestAction(pageRequest.id, body)}
              pendingAction={pendingAction}
              request={pageRequest}
              timeZone={timeZone}
            />
          }
          now={now}
          request={pageRequest}
          timeZone={timeZone}
          viewerEmpId={linkedEmployeeId}
        />
      ) : contentState.kind === "loading" || historyContentState.kind === "loading" ? (
        <CardRowListSkeleton rows={2} />
      ) : (
        <EmptyStateCard
          body="It may have been withdrawn, or it's older than your history."
          fillScreen
          scene="requests-none"
          title="This request isn't here"
        />
      )}
      {actionModals}
    </Screen>
  );

  const listScreen = (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll, and there
      // is nothing to pull-to-refresh while the thing is already loading.
      // Everything else scrolls — `Screen`'s `flexGrow: 1` gives a `fillScreen`
      // state real space to centre in without leaving scroll mode.
      scrollEnabled={contentState.kind !== "loading"}
    >
      {/* The page's own large title in every pose, as People's. */}
      <Stack.Screen options={requestsStackOptions} />
      {/* Active request counts wait for their shared data. History resolves
          independently so a slow archive cannot hide active request actions. */}
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ScrollableTabStripSkeleton tabs={visibleTabs.length} />
        ) : null
      ) : (
        <ScrollableTabStrip
          accessibilityLabel="Request filters"
          activeKey={activeTab}
          onSelect={(key) => setSelectedTab(key as typeof activeTab)}
          tabs={visibleTabs}
        />
      )}

      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <CardRowListSkeleton rows={4} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Couldn't load requests"
          variant="centered"
          onAction={() => {
            void refreshRequests();
          }}
        />
      ) : contentState.kind === "empty" &&
        activeTab !== "history" &&
        activeTab !== "approval" &&
        activeTab !== "mine" ? (
        <EmptyStateCard
          fillScreen
          body="Pickup, swap and call-off requests show here."
          scene="requests-none"
          title="No requests yet"
        />
      ) : activeTab === "available" ? (
        <View style={styles.section}>
          {availableOpenShiftFeed.totalCount === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Open shifts you can claim show here."
              scene="pickup-none"
              title="Nothing to pick up"
            />
          ) : (
            availableOpenShiftFeed.groups.map((group) => (
              <RequestListSection
                key={group.date}
                title={formatScheduleDayLabel(group.date, now, timeZone)}
              >
                <View style={styles.groupItems}>
                  {grouped(
                    group.items.map((item) =>
                      item.kind === "open_shift" ? (
                        <OpenShiftCard
                          key={item.key}
                          variant={split ? "row" : "card"}
                          selected={isShown(item.openShift.id)}
                          onSelect={() => setPickedRequestId(item.openShift.id)}
                          linkedEmployeeId={linkedEmployeeId}
                          pendingAction={pendingAction}
                          onAction={(body) => runRequestAction(item.openShift.id, body)}
                          openShift={item.openShift}
                          showDate={false}
                        />
                      ) : (
                        requestItem(item.request, { canApprove: false, showDate: false })
                      ),
                    ),
                  )}
                </View>
              </RequestListSection>
            ))
          )}
        </View>
      ) : activeTab === "all" ? (
        <View style={styles.section}>
          {allRequests.length === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Open and pending requests show here."
              scene="active-none"
              title="No active requests"
            />
          ) : (
            grouped(allRequests.map((request) => requestItem(request, { canApprove })))
          )}
        </View>
      ) : activeTab === "mine" ? (
        <View style={styles.section}>
          {myRequests.length === 0 ? (
            <MineEmptyState
              canViewScheduleTab={canViewScheduleTab}
              hasHistory={hasOwnHistory}
              hasOwnShifts={hasOwnShifts}
            />
          ) : (
            grouped(myRequests.map((request) => requestItem(request, { canApprove: false })))
          )}
        </View>
      ) : activeTab === "approval" ? (
        <View style={styles.section}>
          {approvalRequests.length === 0 ? (
            <EmptyStateCard fillScreen scene="approve-none" title="Nothing to approve" />
          ) : (
            approvalGroups.map((group) => (
              <RequestListSection count={group.requests.length} key={group.key} title={group.label}>
                <View style={styles.groupItems}>
                  {grouped(group.requests.map((request) => requestItem(request, { canApprove })))}
                </View>
              </RequestListSection>
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          {historyContentState.kind === "loading" ? (
            historyContentState.showSkeleton ? (
              <CardRowListSkeleton rows={4} />
            ) : null
          ) : historyContentState.kind === "error" ? (
            <StatusBanner
              actionLabel="Try again"
              body={historyContentState.message}
              fillScreen
              title="Couldn't load history"
              variant="centered"
              onAction={() => {
                void historyQuery.refetch();
              }}
            />
          ) : historyContentState.kind === "empty" ? (
            <EmptyStateCard
              fillScreen
              body="Resolved, canceled and expired requests show here."
              scene="history-none"
              title="No history yet"
            />
          ) : (
            <>
              {grouped(historyRequests.map((request) => requestItem(request, { canApprove })))}
              {historyQuery.hasNextPage ? (
                <RequestListActionRow
                  label="Load more"
                  loading={historyQuery.isFetchingNextPage}
                  onPress={() => historyQuery.fetchNextPage()}
                />
              ) : null}
            </>
          )}
        </View>
      )}
      {actionModals}
    </Screen>
  );

  if (page) return pageScreen;
  // A tab with nothing in it takes the whole page: its empty state says so
  // once, with no blank pane beside it. Still loading, it keeps the split so
  // the page doesn't jump when its items arrive.
  if (!split || !showsSplit) return listScreen;

  return (
    <SplitView
      detailBar
      entering={foldEntering}
      layout={split}
      listTitle="Requests"
      list={listScreen}
      detail={
        shownItem ? (
          <Screen bottomPaddingMode="tabbed" key={paneItemId(shownItem)}>
            {shownItem.kind === "request" ? (
              <RequestDetail
                heading={describeRequestHeading(shownItem.request, linkedEmployeeId)}
                card={
                  <RequestCard
                    variant="detail"
                    canApprove={
                      activeTab === "available" || activeTab === "mine" ? false : canApprove
                    }
                    highlighted={false}
                    linkedEmployeeId={linkedEmployeeId}
                    now={now}
                    onAction={(body) => runRequestAction(shownItem.request.id, body)}
                    pendingAction={pendingAction}
                    request={shownItem.request}
                    timeZone={timeZone}
                  />
                }
                now={now}
                request={shownItem.request}
                timeZone={timeZone}
                viewerEmpId={linkedEmployeeId}
              />
            ) : (
              <OpenShiftDetail
                card={
                  <OpenShiftCard
                    linkedEmployeeId={linkedEmployeeId}
                    onAction={(body) => runRequestAction(shownItem.openShift.id, body)}
                    openShift={shownItem.openShift}
                    pendingAction={pendingAction}
                    showDate={false}
                  />
                }
                now={now}
                openShift={shownItem.openShift}
                timeZone={timeZone}
              />
            )}
          </Screen>
        ) : (
          // With nothing in the tab the pane stays empty; the list's empty
          // state sits centered beside it.
          <View style={styles.emptyPane} />
        )
      }
    />
  );
}

function openRequestPage(id: string) {
  router.push({ pathname: "/(tabs)/requests/[id]", params: { id } });
}

type PaneItem =
  | { kind: "request"; request: MobileShiftRequest }
  | { kind: "open_shift"; openShift: MobileOpenShift };

function paneItemId(item: PaneItem): string {
  return item.kind === "request" ? item.request.id : item.openShift.id;
}

/** An open shift beside the Available list: its card with Claim, and who works that shift. */
function OpenShiftDetail({
  openShift,
  card,
  now,
  timeZone,
}: {
  openShift: MobileOpenShift;
  card: ReactNode;
  now: Date;
  timeZone: string | null | undefined;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const key = shiftRosterKey(openShift.state, openShift.presentation);
  const shifts = useMemo(() => new Set(key ? [key] : []), [key]);
  return (
    <View style={styles.detailPage}>
      <PaneTitle
        eyebrow={formatScheduleDayLabel(openShift.date, now, timeZone)}
        title="Open shift"
      />
      {card}
      <ShiftRoster date={openShift.date} now={now} shifts={shifts} timeZone={timeZone} />
    </View>
  );
}

function MineEmptyState(props: Parameters<typeof getMineEmptyState>[0]) {
  const state = getMineEmptyState(props);
  const action = state.action;

  return (
    <EmptyStateCard
      actionLabel={action?.label}
      body={state.body}
      fillScreen
      onAction={action ? () => router.push(action.href) : undefined}
      scene="mine-none"
      title={state.title}
    />
  );
}

function RequestCard({
  request,
  linkedEmployeeId,
  canApprove,
  highlighted,
  pendingAction,
  onAction,
  now,
  timeZone,
  showDate = true,
  stackHeader = false,
  variant = "card",
  selected = false,
  onSelect,
  onOpen,
}: {
  request: MobileShiftRequest;
  /**
   * "row": one line of a split view's grouped list, picked to show the whole
   * request beside it. "detail": the card in the pane beside it, whose title
   * already names who asked and what.
   */
  variant?: "card" | "row" | "detail";
  selected?: boolean;
  onSelect?: () => void;
  /** The closed list's card opens the request's page from its header row. */
  onOpen?: () => void;
  linkedEmployeeId: string | null;
  canApprove: boolean;
  highlighted: boolean;
  /** The pill under the name rather than beside it. */
  stackHeader?: boolean;
  pendingAction: PendingRequestAction;
  onAction: (body: RequestActionBody) => void;
  now: Date;
  timeZone: string | null | undefined;
  showDate?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const chipTones = useMemo(() => createChipTones(mobileColors), [mobileColors]);
  const isSwap = request.type === "swap" && request.targetName != null;
  const pill = describeShiftRequestPill(request.type, request.status);
  const pillTone = pill.tone === "kind" ? chipTones[request.type] : chipTones[pill.tone];
  const copy = describeShiftRequest(request, linkedEmployeeId);

  const awaitingRecipient = isAwaitingRecipient(request);
  // The requester withdraws their own request; a manager may also withdraw
  // one still waiting on its recipient, since nothing else can move it.
  const canCancel =
    (Boolean(linkedEmployeeId) &&
      request.requesterEmpId === linkedEmployeeId &&
      (request.status === "open" || request.status === "pending_approval")) ||
    (canApprove && awaitingRecipient);
  const canClaim =
    Boolean(linkedEmployeeId) &&
    request.type === "pickup" &&
    request.status === "open" &&
    request.targetEmpId == null &&
    request.requesterEmpId !== linkedEmployeeId;
  const canRespond =
    Boolean(linkedEmployeeId) &&
    request.targetEmpId === linkedEmployeeId &&
    request.status === "open";
  const canResolve = canApprove && request.status === "pending_approval";
  const action = (
    body: RequestActionBody,
    label: string,
    emphasis: RequestCardAction["emphasis"],
  ): RequestCardAction => ({
    key: getMobileRequestActionKey(request.id, body),
    label,
    emphasis,
    disabled: Boolean(pendingAction),
    loading: pendingAction?.key === getMobileRequestActionKey(request.id, body),
    onPress: () => onAction(body),
  });
  const actions: RequestCardAction[] = [
    ...(canCancel
      ? [action({ action: "cancel", empId: request.requesterEmpId }, "Cancel request", "plain")]
      : []),
    ...(canClaim
      ? [action({ action: "claim", claimerEmpId: linkedEmployeeId! }, "Claim", "primary")]
      : []),
    ...(canRespond
      ? [
          action(
            { action: "respond", empId: linkedEmployeeId!, accept: false },
            "Decline",
            "plain",
          ),
          action(
            { action: "respond", empId: linkedEmployeeId!, accept: true },
            "Accept",
            "primary",
          ),
        ]
      : []),
    ...(canResolve
      ? [
          action({ action: "resolve", approved: false }, "Reject", "plain"),
          action({ action: "resolve", approved: true }, "Approve", "primary"),
        ]
      : []),
  ];

  const statusPill = (
    <View style={[styles.statusChip, { backgroundColor: pillTone.backgroundColor }]}>
      <Text fit="compact" style={[styles.statusChipText, { color: pillTone.textColor }]}>
        {pill.label}
      </Text>
    </View>
  );

  if (variant === "row") {
    const shiftLines = [
      describeRequestShiftLine(
        request.requesterPresentation,
        request.requesterShiftDate,
        now,
        timeZone,
      ),
      ...(isSwap
        ? [
            describeRequestShiftLine(
              request.targetPresentation ?? null,
              request.targetShiftDate,
              now,
              timeZone,
            ),
          ]
        : []),
    ].filter(Boolean);
    return (
      <Pressable
        accessibilityLabel={`Show ${request.requesterName}'s request`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={[styles.requestRow, selected && styles.requestRowSelected]}
      >
        <View style={[styles.cardHeader, stackHeader && styles.cardHeaderStacked]}>
          <Text
            numberOfLines={2}
            style={[styles.requestTitle, stackHeader && styles.requestTitleStacked]}
          >
            {copy.title}
          </Text>
          {statusPill}
        </View>
        <Text numberOfLines={2} style={styles.metaText}>
          {copy.subtitle}
        </Text>
        {shiftLines.map((line, index) => (
          <Text key={index} numberOfLines={2} style={styles.rowShiftText}>
            {line}
          </Text>
        ))}
      </Pressable>
    );
  }

  const awaitingNote =
    canApprove && awaitingRecipient && request.targetName ? (
      <Text style={styles.awaitingNote}>{describeAwaitingRecipient(request.targetName)}</Text>
    ) : null;

  return (
    <View style={[styles.requestCard, highlighted && styles.requestCardHighlighted]}>
      {variant === "detail" ? (
        awaitingNote ? (
          <>
            <View style={styles.cardRow}>{awaitingNote}</View>
            <View style={styles.cardSeparator} />
          </>
        ) : null
      ) : (
        <>
          <Pressable
            accessibilityHint={onOpen ? "Opens the whole request" : undefined}
            accessibilityRole={onOpen ? "button" : undefined}
            disabled={!onOpen}
            onPress={onOpen}
            style={({ pressed }) => [styles.cardRow, pressed && styles.cardRowPressed]}
          >
            <View style={[styles.cardHeader, stackHeader && styles.cardHeaderStacked]}>
              <Text style={[styles.requestTitle, stackHeader && styles.requestTitleStacked]}>
                {copy.title}
              </Text>
              {statusPill}
              {onOpen && !stackHeader ? (
                <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={18} />
              ) : null}
            </View>
            <Text style={styles.metaText}>{copy.subtitle}</Text>
            {awaitingNote}
          </Pressable>
          <View style={styles.cardSeparator} />
        </>
      )}
      <View style={styles.cardRow}>
        {isSwap ? (
          // A swap is one card about two shifts: each shift is its own panel,
          // and the swap disc straddles the seam between them.
          <View>
            <RequestShift
              date={request.requesterShiftDate}
              now={now}
              personName={copy.requesterShiftLabel}
              presentation={request.requesterPresentation}
              seam="below"
              state={request.requesterState}
              timeZone={timeZone}
            />
            {/* A fixed strip between the panels owns the disc, so it sits on
                the seam whatever the panels' heights or the text size. */}
            <View pointerEvents="none" style={styles.swapSeam}>
              <View accessibilityLabel="Swap" accessibilityRole="image" style={styles.swapArrow}>
                <Ionicons color={mobileColors.brand} name="swap-vertical" size={16} />
              </View>
            </View>
            <RequestShift
              date={request.targetShiftDate}
              now={now}
              personName={copy.targetShiftLabel}
              presentation={request.targetPresentation ?? null}
              seam="above"
              state={request.targetState ?? null}
              timeZone={timeZone}
            />
          </View>
        ) : (
          <RequestShift
            date={showDate ? request.requesterShiftDate : null}
            now={now}
            personName={null}
            presentation={request.requesterPresentation}
            state={request.requesterState}
            timeZone={timeZone}
          />
        )}
      </View>
      {formatShiftRequestNote(request.adminNote) ? (
        <>
          <View style={styles.cardSeparator} />
          <View style={styles.cardRow}>
            <Text style={styles.metaText}>{formatShiftRequestNote(request.adminNote)}</Text>
          </View>
        </>
      ) : null}
      <RequestCardActions actions={actions} />
    </View>
  );
}

/** A request's shift on one line, for a split list's row: the shift and its day. */
function describeRequestShiftLine(
  presentation: ResolvedSchedulePresentation | null,
  date: string | null,
  now: Date,
  timeZone: string | null | undefined,
): string {
  return [
    getPresentationShiftLabel(presentation),
    date ? formatScheduleDayLabel(date, now, timeZone) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The pane's title for a request: who asked and what, its kind and status above. */
function describeRequestHeading(request: MobileShiftRequest, linkedEmployeeId: string | null) {
  const copy = describeShiftRequest(request, linkedEmployeeId);
  return {
    title: copy.title,
    eyebrow: describeShiftRequestPill(request.type, request.status).label,
    subtitle: copy.subtitle,
  };
}

/**
 * One shift in a request card: whose it is (only when the card holds more
 * than one person's shift), the shift and its focus area, and the day and
 * time on one line. A swap's two shifts are panels meeting at a seam; any
 * other request's shift is text in the card's own row. Split shifts list
 * their segments the way the open-shift card does.
 */
function RequestShift({
  date,
  now,
  personName,
  presentation,
  seam,
  state,
  timeZone,
}: {
  date: string | null;
  now: Date;
  personName: string | null;
  presentation: ResolvedSchedulePresentation | null;
  state: ScheduleCellState | null;
  timeZone: string | null | undefined;
  /** A swap panel's edge that meets the other panel, leaving room for the disc. */
  seam?: "above" | "below";
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const splitSegments = getSplitShiftSegmentsFromPresentation(presentation, state);
  const segments = presentation?.segments ?? [];
  // One pill per named job (the default shift job arrives unnamed and draws
  // nothing), the same chip the open-shift card uses, so colours match.
  const jobChips = segments
    .map((segment) => ({
      chip: buildJobChip(mobileColors, isDark, segment.jobName ?? null, segment),
      isMentored: segment.isMentored === true,
    }))
    .filter(({ chip, isMentored }) => chip != null || isMentored);
  const timeRange = getPresentationTimeRange(presentation, state);
  const dayLabel = date ? formatScheduleDayLabel(date, now, timeZone) : null;
  const whenLabel = [dayLabel, timeRange].filter(Boolean).join(" · ");
  const focusAreaName =
    presentation?.displayFocusAreaName ??
    presentation?.focusAreaName ??
    segments[0]?.displayFocusAreaName ??
    null;

  return (
    <View
      style={[
        styles.shiftBlock,
        seam && styles.shiftPanel,
        seam === "below" && styles.shiftPanelSeamBelow,
        seam === "above" && styles.shiftPanelSeamAbove,
      ]}
    >
      {personName ? <Text style={styles.shiftPerson}>{personName}</Text> : null}
      {splitSegments.length > 1 ? (
        <View style={styles.splitShiftPanel}>
          <SplitShiftBadge count={splitSegments.length} />
          <SplitShiftSegmentList
            renderSegmentChip={(segment) => (
              <JobPill
                chip={getSegmentJobChip(mobileColors, isDark, segment)}
                compact
                isMentored={segment.isMentored === true}
              />
            )}
            segments={splitSegments}
            variant="compact"
          />
        </View>
      ) : (
        <>
          <View style={styles.shiftTitleRow}>
            <Text style={styles.shiftTitle}>{getPresentationShiftLabel(presentation)}</Text>
            {jobChips.map(({ chip, isMentored: segmentMentored }, index) => (
              <JobPill chip={chip} compact isMentored={segmentMentored} key={index} />
            ))}
          </View>
          {focusAreaName ? <Text style={styles.shiftContext}>{focusAreaName}</Text> : null}
        </>
      )}
      {whenLabel ? <Text style={styles.shiftWhen}>{whenLabel}</Text> : null}
    </View>
  );
}

// Exported for the first-run tour's live preview of the Available list.
export function OpenShiftCard({
  openShift,
  linkedEmployeeId,
  pendingAction,
  onAction,
  showDate = true,
  variant = "card",
  selected = false,
  onSelect,
}: {
  openShift: MobileOpenShift;
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  onAction: (body: RequestActionBody) => void;
  showDate?: boolean;
  /** "row": one line of a split view's grouped list, as a request's row. */
  variant?: "card" | "row";
  selected?: boolean;
  onSelect?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const openShiftChipTone = useMemo(() => createChipTones(mobileColors), [mobileColors]).openShift;
  const shiftLabel = getOpenShiftLabel(openShift);
  const focusAreaName = getOpenShiftFocusAreaName(openShift);
  const jobChip = getOpenShiftJobChip(mobileColors, isDark, openShift);
  const isMentored = hasMentoredSegments(openShift.presentation.segments);
  const timeRange = getOpenShiftTimeRange(openShift);
  const splitSegments = getSplitShiftSegmentsFromPresentation(
    openShift.presentation,
    openShift.state,
  );
  const volunteerBlockReason =
    openShift.canVolunteer === false
      ? (openShift.volunteerBlockReason ?? "You can't volunteer for this shift right now.")
      : null;
  const volunteerBody: RequestActionBody | null = linkedEmployeeId
    ? {
        action: "volunteer_open_shift",
        empId: linkedEmployeeId,
        shiftDate: openShift.date,
        focusAreaId: openShift.focusAreaId,
        state: openShift.state,
      }
    : null;

  if (variant === "row") {
    return (
      <Pressable
        accessibilityLabel={`Show the open ${shiftLabel}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={[styles.requestRow, selected && styles.requestRowSelected]}
      >
        <View style={styles.cardHeader}>
          <Text numberOfLines={2} style={styles.requestTitle}>
            {shiftLabel}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: openShiftChipTone.backgroundColor }]}>
            <Text
              fit="compact"
              style={[styles.statusChipText, { color: openShiftChipTone.textColor }]}
            >
              Open shift
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.metaText}>
          {openShift.needed} teammate{openShift.needed === 1 ? "" : "s"} needed
        </Text>
        <Text numberOfLines={2} style={styles.rowShiftText}>
          {[focusAreaName, timeRange].filter(Boolean).join(" · ")}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.requestCard}>
      <View style={styles.cardRow}>
        <View style={styles.openShiftTitleRow}>
          <View style={styles.shiftTitleTimeRow}>
            <View style={styles.shiftTitleRow}>
              <Text style={styles.openShiftTitle}>{shiftLabel}</Text>
              {splitSegments.length <= 1 && (jobChip || isMentored) ? (
                <JobPill chip={jobChip} compact isMentored={isMentored} />
              ) : null}
            </View>
            {splitSegments.length <= 1 && timeRange ? (
              <Text style={styles.shiftTitleTimeText}>{timeRange}</Text>
            ) : null}
          </View>
          <View style={[styles.statusChip, { backgroundColor: openShiftChipTone.backgroundColor }]}>
            <Text
              fit="compact"
              style={[styles.statusChipText, { color: openShiftChipTone.textColor }]}
            >
              Open shift
            </Text>
          </View>
        </View>
        {/* Shift and job, then its focus area, then when. */}
        {splitSegments.length <= 1 && focusAreaName ? (
          <Text style={styles.openShiftContextText}>{focusAreaName}</Text>
        ) : null}
        {showDate ? <Text style={styles.metaText}>{openShift.date}</Text> : null}
        {splitSegments.length > 1 ? (
          <View style={styles.splitShiftPanel}>
            <SplitShiftBadge count={splitSegments.length} />
            <SplitShiftSegmentList
              renderSegmentChip={(segment) => (
                <JobPill
                  chip={getSegmentJobChip(mobileColors, isDark, segment)}
                  compact
                  isMentored={segment.isMentored === true}
                />
              )}
              segments={splitSegments}
              variant="compact"
            />
          </View>
        ) : null}
        <Text style={styles.metaText}>
          {openShift.needed} teammate{openShift.needed === 1 ? "" : "s"} needed
        </Text>
        {volunteerBlockReason ? <Text style={styles.metaText}>{volunteerBlockReason}</Text> : null}
      </View>
      {volunteerBody ? (
        <RequestCardActions
          actions={[
            {
              key: getMobileRequestActionKey(openShift.id, volunteerBody),
              label: "Claim",
              emphasis: "primary",
              disabled: Boolean(pendingAction) || openShift.canVolunteer === false,
              loading:
                pendingAction?.key === getMobileRequestActionKey(openShift.id, volunteerBody),
              onPress: () => {
                if (openShift.canVolunteer === false) {
                  return;
                }

                onAction(volunteerBody);
              },
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function JobPill({
  chip,
  compact,
  isMentored = chip?.isMentored === true,
}: {
  chip: JobChip | null;
  compact?: boolean;
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${isMentored ? " mentored assignment" : ""}`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const pillBorderColor =
    chip.kind === "general" ? mobileBorderColorFromText(chip.textColor) : chip.borderColor;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.jobPill,
        compact && styles.jobPillCompact,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: pillBorderColor,
        },
      ]}
    >
      {chip.eyebrowLabel ? (
        <View style={styles.jobPillTextStack}>
          <Text fit="compact" style={[styles.jobPillEyebrowText, { color: chip.textColor }]}>
            {chip.eyebrowLabel}
          </Text>
          <Text fit="compact" style={[styles.jobPillValueText, { color: chip.textColor }]}>
            {chip.label}
            {isMentored ? (
              <Text style={[styles.jobPillMentoredText, { color: chip.textColor }]}>
                {" "}
                (Mentored)
              </Text>
            ) : null}
          </Text>
        </View>
      ) : (
        <View style={styles.jobPillInlineTextRow}>
          <Text fit="compact" style={[styles.jobPillText, { color: chip.textColor }]}>
            {chip.label}
          </Text>
          {isMentored ? (
            <Text
              fit="compact"
              style={[styles.jobPillMentoredInlineText, { color: chip.textColor }]}
            >
              (Mentored)
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
