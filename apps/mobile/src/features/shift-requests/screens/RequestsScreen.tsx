import { ActionButtons } from "../../../shared/components/ActionButtons";
import { CountBadge } from "../../dashboard/components/CountBadge";
import { REQUEST_TYPE_LABEL, REQUEST_TYPE_TONE } from "../lib/request-type";
import { resolveJobChipTone } from "@dubgrid/design-tokens";
import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileOpenShift,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
  MobileShiftRequestHistoryCursor,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen } from "../../../shared/components/Screen";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
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
  mobileVisiblePillBorder,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useMobileShiftRequestsRealtime } from "../hooks/useMobileShiftRequestsRealtime";
import {
  type MobileRequestActionFeedback,
  getMobileRequestActionFeedback,
  getMobileRequestActionKey,
  getMobileRequestActionSuccessToast,
} from "../lib/request-action-feedback";
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
  | { action: "cancel"; empId: string }
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
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
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

function getShiftPillColors(
  mobileColors: MobileColors,
  isDark: boolean,
  presentation:
    | MobileShiftRequest["requesterPresentation"]
    | MobileOpenShift["presentation"]
    | null
    | undefined,
): ShiftPillColors {
  const shiftColor = readOptionalColor(presentation?.shiftColor);

  // Without a stored fill the pill runs on brand tokens, which are already
  // theme-correct — a stored text color alone would be a light-page hex on a
  // dark surface, so it only applies alongside its own fill.
  if (!shiftColor) {
    return {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      textColor: mobileColors.brand,
    };
  }

  const textColor = readOptionalColor(presentation?.shiftTextColor) ?? mobileColors.brand;

  return mobileDarkenTone(
    {
      backgroundColor: shiftColor,
      borderColor: mobileVisiblePillBorder(presentation?.shiftBorderColor, textColor),
      textColor,
    },
    isDark,
  );
}

function getRequestShiftLabel(request: MobileShiftRequest): string {
  const primarySegment = request.requesterPresentation?.segments?.[0] ?? null;

  return (
    primarySegment?.shiftName ??
    request.requesterPresentation?.shiftName ??
    request.requesterPresentation?.label ??
    "Shift"
  );
}

function getRequestSegments(request: MobileShiftRequest) {
  return request.requesterPresentation?.segments ?? [];
}

function getRequestTimeRange(request: MobileShiftRequest): string | null {
  const segments = getRequestSegments(request);
  const firstSegmentWithTime = segments.find((segment) => segment.startTime && segment.endTime);
  const lastSegmentWithTime =
    [...segments].reverse().find((segment) => segment.startTime && segment.endTime) ?? null;

  if (firstSegmentWithTime && lastSegmentWithTime) {
    return formatScheduleTimeRange(firstSegmentWithTime.startTime, lastSegmentWithTime.endTime);
  }

  if (request.requesterPresentation?.startTime && request.requesterPresentation.endTime) {
    return formatScheduleTimeRange(
      request.requesterPresentation.startTime,
      request.requesterPresentation.endTime,
    );
  }

  return formatScheduleTimeRange(
    request.requesterState?.customStartTime ?? null,
    request.requesterState?.customEndTime ?? null,
  );
}

function getOpenShiftLabel(openShift: MobileOpenShift): string {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  return (
    primarySegment?.shiftName ?? openShift.presentation.shiftName ?? openShift.presentation.label
  );
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

function formatRequestStatus(status: MobileShiftRequest["status"]): string {
  return status === "pending_approval"
    ? "Pending approval"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

type StatusChipTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

function createStatusChipTones(
  mobileColors: MobileColors,
): Record<MobileShiftRequest["status"], StatusChipTone> {
  return {
    open: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      textColor: mobileColors.brand,
    },
    pending_approval: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      textColor: mobileColors.warningText,
    },
    approved: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      textColor: mobileColors.successText,
    },
    rejected: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      textColor: mobileColors.dangerText,
    },
    cancelled: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textSubtle,
    },
    expired: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textSubtle,
    },
  };
}

function CardIcon({
  name,
  muted = false,
}: {
  name: keyof typeof Ionicons.glyphMap;
  muted?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
  return (
    <View style={[styles.cardIconFrame, muted && styles.cardIconFrameMuted]}>
      <Ionicons color={mobileColors.brand} name={name} size={18} />
    </View>
  );
}

export default function RequestsScreen() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
  const params = useLocalSearchParams<{
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
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
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
    successToast: (_data, variables) => ({
      tone: "success",
      ...getMobileRequestActionSuccessToast(variables.body),
    }),
    errorToast: {
      title: "Could not update request",
      fallbackMessage: "We couldn't update that shift request.",
    },
    announceOnSuccess: (_data, variables) =>
      getMobileRequestActionSuccessToast(variables.body).title ?? null,
    onSuccess: async () => {
      // The user's own availability view is derived from schedule cells the
      // server rewrites on approval, so it has to come from the server.
      if (linkedEmployeeId && !canViewAllRequests) {
        await availabilityScheduleQuery.refetch();
      }
    },
    invalidateKeys: [historyQueryKey],
  });
  const runRequestAction = useCallback(
    (requestId: string, body: RequestActionBody) => {
      if (requestActionMutation.isPending || pendingAction) {
        return;
      }

      const feedback = getMobileRequestActionFeedback({ requestId, body });
      setRequestActionConfirmation({ requestId, body, feedback });
    },
    [pendingAction, requestActionMutation.isPending],
  );

  const confirmRequestAction = useCallback(() => {
    if (!requestActionConfirmation) return;

    const { requestId, body, feedback } = requestActionConfirmation;
    setRequestActionConfirmation(null);
    setPendingAction({ key: feedback.key });
    // Returned so `ConfirmationModal` can latch on it. The guard above reads
    // state that a same-tick second tap has not seen cleared yet, so without
    // the promise a double-tap approves the request twice. Settling resolves
    // rather than rejects: the mutation's own `onError` already toasts.
    return new Promise<void>((resolve) => {
      requestActionMutation.mutate(
        { requestId, body },
        {
          onSettled: () => {
            setPendingAction(null);
            resolve();
          },
        },
      );
    });
  }, [requestActionConfirmation, requestActionMutation]);

  const requests = requestsQuery.data?.requests ?? [];
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
  const approvalRequests = useMemo(
    () =>
      canApprove
        ? requests.filter(
            (request) =>
              request.status === "pending_approval" &&
              !hasShiftRequestStarted(request, now, timeZone),
          )
        : [],
    [canApprove, now, requests, timeZone],
  );
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

  return (
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
          title="Could not load requests"
          variant="centered"
          onAction={() => {
            void refreshRequests();
          }}
        />
      ) : contentState.kind === "empty" && activeTab !== "history" ? (
        <EmptyStateCard
          fillScreen
          body="Coverage and pickup requests will appear here when someone needs help."
          iconName="swap-horizontal-outline"
          title="No requests yet"
        />
      ) : activeTab === "available" ? (
        <View style={styles.section}>
          {availableOpenShiftFeed.totalCount === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Open shifts you can claim will appear here."
              iconName="briefcase-outline"
              title="Nothing to pick up"
            />
          ) : (
            availableOpenShiftFeed.groups.map((group) => (
              <View key={group.date} style={styles.dateGroup}>
                <Text style={styles.dateGroupLabel}>
                  {formatScheduleDayLabel(group.date, now, timeZone)}
                </Text>
                <View style={styles.dateGroupItems}>
                  {group.items.map((item) =>
                    item.kind === "open_shift" ? (
                      <OpenShiftCard
                        key={item.key}
                        linkedEmployeeId={linkedEmployeeId}
                        pendingAction={pendingAction}
                        onAction={(body) => runRequestAction(item.openShift.id, body)}
                        openShift={item.openShift}
                        showDate={false}
                      />
                    ) : (
                      <RequestCard
                        key={item.key}
                        canApprove={false}
                        linkedEmployeeId={linkedEmployeeId}
                        pendingAction={pendingAction}
                        onAction={(body) => runRequestAction(item.request.id, body)}
                        highlighted={highlightedRequestId === item.request.id}
                        request={item.request}
                        showDate={false}
                      />
                    ),
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      ) : activeTab === "all" ? (
        <View style={styles.section}>
          {allRequests.length === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Open and pending requests will appear here."
              iconName="list-outline"
              title="No active requests"
            />
          ) : (
            allRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={canApprove}
                linkedEmployeeId={linkedEmployeeId}
                pendingAction={pendingAction}
                onAction={(body) => runRequestAction(request.id, body)}
                highlighted={highlightedRequestId === request.id}
                request={request}
              />
            ))
          )}
        </View>
      ) : activeTab === "mine" ? (
        <View style={styles.section}>
          {myRequests.length === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Your requests stay here until they're resolved or canceled."
              iconName="document-text-outline"
              title="You haven't made any requests"
            />
          ) : (
            myRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={false}
                linkedEmployeeId={linkedEmployeeId}
                pendingAction={pendingAction}
                onAction={(body) => runRequestAction(request.id, body)}
                highlighted={highlightedRequestId === request.id}
                request={request}
              />
            ))
          )}
        </View>
      ) : activeTab === "approval" ? (
        <View style={styles.section}>
          {approvalRequests.length === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Requests appear here when they need your approval."
              iconName="checkmark"
              title="Nothing to approve"
            />
          ) : (
            approvalRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={canApprove}
                linkedEmployeeId={linkedEmployeeId}
                pendingAction={pendingAction}
                onAction={(body) => runRequestAction(request.id, body)}
                highlighted={highlightedRequestId === request.id}
                request={request}
              />
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
              title="Could not load history"
              variant="centered"
              onAction={() => {
                void historyQuery.refetch();
              }}
            />
          ) : historyContentState.kind === "empty" ? (
            <EmptyStateCard
              fillScreen
              body="Resolved, canceled, and expired requests appear here."
              iconName="time-outline"
              title="No history yet"
            />
          ) : (
            <>
              {historyRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  canApprove={canApprove}
                  linkedEmployeeId={linkedEmployeeId}
                  pendingAction={pendingAction}
                  onAction={(body) => runRequestAction(request.id, body)}
                  highlighted={highlightedRequestId === request.id}
                  request={request}
                />
              ))}
              {historyQuery.hasNextPage ? (
                <Button
                  compact
                  label="Load more"
                  loading={historyQuery.isFetchingNextPage}
                  onPress={() => historyQuery.fetchNextPage()}
                  tone="secondary"
                />
              ) : null}
            </>
          )}
        </View>
      )}
      <ConfirmationModal
        body={requestActionConfirmation?.feedback.message}
        confirmLabel={requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"}
        confirmTone={
          requestActionConfirmation?.feedback.confirmStyle === "destructive" ? "danger" : "primary"
        }
        onCancel={() => setRequestActionConfirmation(null)}
        onConfirm={confirmRequestAction}
        title={requestActionConfirmation?.feedback.title ?? "Confirm action?"}
        visible={Boolean(requestActionConfirmation)}
      />
    </Screen>
  );
}

function RequestCard({
  request,
  linkedEmployeeId,
  canApprove,
  highlighted,
  pendingAction,
  onAction,
  showDate = true,
}: {
  request: MobileShiftRequest;
  linkedEmployeeId: string | null;
  canApprove: boolean;
  highlighted: boolean;
  pendingAction: PendingRequestAction;
  onAction: (body: RequestActionBody) => void;
  showDate?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
  const statusChipTones = useMemo(() => createStatusChipTones(mobileColors), [mobileColors]);
  const shiftLabel = getRequestShiftLabel(request);
  const timeRange = getRequestTimeRange(request);
  const isMentored = hasMentoredSegments(getRequestSegments(request));
  const requesterSplitSegments = getSplitShiftSegmentsFromPresentation(
    request.requesterPresentation,
    request.requesterState,
  );
  const targetSplitSegments = getSplitShiftSegmentsFromPresentation(
    request.targetPresentation,
    request.targetState ?? null,
  );
  const statusTone = statusChipTones[request.status];

  const canCancel =
    Boolean(linkedEmployeeId) &&
    request.requesterEmpId === linkedEmployeeId &&
    (request.status === "open" || request.status === "pending_approval");
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
  const hasActions = canCancel || canClaim || canRespond || canResolve;

  return (
    <View style={[styles.requestCard, highlighted && styles.requestCardHighlighted]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <CardIcon muted={highlighted} name="swap-horizontal-outline" />
          <View style={styles.titleColumn}>
            <Text style={styles.requestTitle}>{request.requesterName}</Text>
            <View style={styles.requestTypeRow}>
              <CountBadge
                label={REQUEST_TYPE_LABEL[request.type]}
                tone={REQUEST_TYPE_TONE[request.type]}
              />
              {showDate ? <Text style={styles.metaText}>{request.requesterShiftDate}</Text> : null}
            </View>
            {requesterSplitSegments.length > 1 ? (
              <View style={styles.splitShiftPanel}>
                <SplitShiftBadge count={requesterSplitSegments.length} compact />
                <SplitShiftSegmentList
                  renderSegmentChip={(segment) => (
                    <JobPill
                      chip={getSegmentJobChip(mobileColors, isDark, segment)}
                      compact
                      isMentored={segment.isMentored === true}
                    />
                  )}
                  segments={requesterSplitSegments}
                  variant="compact"
                />
              </View>
            ) : (
              <View style={styles.shiftPillRow}>
                <ShiftPill
                  colors={getShiftPillColors(mobileColors, isDark, request.requesterPresentation)}
                  label={shiftLabel}
                />
                {timeRange ? <Text style={styles.shiftTitleTimeText}>{timeRange}</Text> : null}
                {isMentored ? <MentoredPill /> : null}
              </View>
            )}
            {request.targetName ? (
              <Text style={styles.metaText}>Target: {request.targetName}</Text>
            ) : null}
            {targetSplitSegments.length > 1 ? (
              <View style={styles.splitShiftPanel}>
                <Text style={styles.splitShiftPanelLabel}>Target shift</Text>
                <SplitShiftBadge count={targetSplitSegments.length} compact />
                <SplitShiftSegmentList
                  renderSegmentChip={(segment) => (
                    <JobPill
                      chip={getSegmentJobChip(mobileColors, isDark, segment)}
                      compact
                      isMentored={segment.isMentored === true}
                    />
                  )}
                  segments={targetSplitSegments}
                  variant="compact"
                />
              </View>
            ) : null}
            {request.adminNote ? (
              <Text style={styles.metaText}>Manager note: {request.adminNote}</Text>
            ) : null}
          </View>
        </View>
        <View
          style={[
            styles.statusChip,
            { backgroundColor: statusTone.backgroundColor, borderColor: statusTone.borderColor },
          ]}
        >
          <Text fit="compact" style={[styles.statusChipText, { color: statusTone.textColor }]}>
            {formatRequestStatus(request.status)}
          </Text>
        </View>
      </View>
      {hasActions ? (
        <ActionButtons style={styles.cardActions}>
          {canCancel
            ? (() => {
                const body: RequestActionBody = {
                  action: "cancel",
                  empId: linkedEmployeeId!,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Cancel"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                    tone="neutral"
                  />
                );
              })()
            : null}
          {canClaim
            ? (() => {
                const body: RequestActionBody = {
                  action: "claim",
                  claimerEmpId: linkedEmployeeId!,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Claim"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                  />
                );
              })()
            : null}
          {canRespond ? (
            <>
              {(() => {
                const body: RequestActionBody = {
                  action: "respond",
                  empId: linkedEmployeeId!,
                  accept: false,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Decline"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                    tone="neutral"
                  />
                );
              })()}
              {(() => {
                const body: RequestActionBody = {
                  action: "respond",
                  empId: linkedEmployeeId!,
                  accept: true,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Accept"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                  />
                );
              })()}
            </>
          ) : null}
          {canResolve ? (
            <>
              {(() => {
                const body: RequestActionBody = {
                  action: "resolve",
                  approved: false,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Reject"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                    tone="danger"
                  />
                );
              })()}
              {(() => {
                const body: RequestActionBody = {
                  action: "resolve",
                  approved: true,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label="Approve"
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                  />
                );
              })()}
            </>
          ) : null}
        </ActionButtons>
      ) : null}
    </View>
  );
}

function OpenShiftCard({
  openShift,
  linkedEmployeeId,
  pendingAction,
  onAction,
  showDate = true,
}: {
  openShift: MobileOpenShift;
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  onAction: (body: RequestActionBody) => void;
  showDate?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
  const statusChipTones = useMemo(() => createStatusChipTones(mobileColors), [mobileColors]);
  const openShiftChipTone = statusChipTones.open;
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
  const hasActions = Boolean(linkedEmployeeId);

  return (
    <View style={[styles.requestCard, styles.openShiftCard]}>
      <View style={styles.openShiftTitleRow}>
        <View style={styles.shiftTitleTimeRow}>
          <Text style={styles.openShiftTitle}>{shiftLabel}</Text>
          {splitSegments.length <= 1 && timeRange ? (
            <Text style={styles.shiftTitleTimeText}>{timeRange}</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statusChip,
            {
              backgroundColor: openShiftChipTone.backgroundColor,
              borderColor: openShiftChipTone.borderColor,
            },
          ]}
        >
          <Text
            fit="compact"
            style={[styles.statusChipText, { color: openShiftChipTone.textColor }]}
          >
            Open shift
          </Text>
        </View>
      </View>
      {showDate ? <Text style={styles.metaText}>{openShift.date}</Text> : null}
      {splitSegments.length > 1 ? (
        <View style={styles.splitShiftPanel}>
          <SplitShiftBadge count={splitSegments.length} compact />
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
      ) : jobChip || focusAreaName || isMentored ? (
        <View style={styles.openShiftContextStack}>
          {focusAreaName ? <Text style={styles.openShiftContextText}>{focusAreaName}</Text> : null}
          {jobChip || isMentored ? (
            <View style={styles.shiftPillRow}>
              <JobPill chip={jobChip} compact isMentored={isMentored} />
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.metaText}>
        {openShift.needed} teammate{openShift.needed === 1 ? "" : "s"} needed
      </Text>
      {volunteerBlockReason ? <Text style={styles.metaText}>{volunteerBlockReason}</Text> : null}
      {hasActions ? (
        <View style={[styles.cardActions, styles.cardActionsFlush]}>
          {(() => {
            const body: RequestActionBody = {
              action: "volunteer_open_shift",
              empId: linkedEmployeeId!,
              shiftDate: openShift.date,
              focusAreaId: openShift.focusAreaId,
              state: openShift.state,
            };
            const isLoading = pendingAction?.key === getMobileRequestActionKey(openShift.id, body);

            return (
              <Button
                compact
                disabled={Boolean(pendingAction) || openShift.canVolunteer === false}
                label="Volunteer"
                leadingAccessory={
                  <Ionicons color={mobileColors.brand} name="add-circle-outline" size={18} />
                }
                loading={isLoading}
                onPress={() => {
                  if (openShift.canVolunteer === false) {
                    return;
                  }

                  onAction(body);
                }}
                tone="secondary"
              />
            );
          })()}
        </View>
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
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
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
          <Text
            fit="compact"
            style={[
              styles.jobPillEyebrowText,
              compact && styles.jobPillEyebrowTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.eyebrowLabel}
          </Text>
          <Text
            fit="compact"
            style={[
              styles.jobPillValueText,
              compact && styles.jobPillValueTextCompact,
              { color: chip.textColor },
            ]}
          >
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
          <Text
            fit="compact"
            style={[
              styles.jobPillText,
              compact && styles.jobPillTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text
              fit="compact"
              style={[
                styles.jobPillMentoredInlineText,
                compact && styles.jobPillMentoredInlineTextCompact,
                { color: chip.textColor },
              ]}
            >
              (Mentored)
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ShiftPill({ colors, label }: { colors: ShiftPillColors; label: string }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors]);
  return (
    <View
      accessibilityLabel={`Shift ${label}`}
      style={[
        styles.shiftPill,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <Text fit="compact" style={[styles.shiftPillText, { color: colors.textColor }]}>
        {label}
      </Text>
    </View>
  );
}
