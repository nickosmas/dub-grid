import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileOpenShift,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ListSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { getMySchedule, getShiftRequests, updateShiftRequest } from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileBorderColorFromText,
  mobileRadii,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
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
  addDaysToIsoDate,
  buildAvailableOpenShiftFeed,
  formatScheduleDayLabel,
  formatScheduleTimeRange,
  getIsoDateInTimeZone,
  getSplitShiftSegmentsFromPresentation,
  hasShiftRequestStarted,
} from "../../schedule/lib/schedule";

const ACTIVE_REQUEST_STATUSES = new Set(["open", "pending_approval"]);

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
  label: string;
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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text style={styles.mentoredPillText}>Mentored</Text>
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
  presentation:
    | MobileShiftRequest["requesterPresentation"]
    | MobileOpenShift["presentation"]
    | null
    | undefined,
): ShiftPillColors {
  return {
    backgroundColor: presentation?.shiftColor ?? mobileColors.brandSoft,
    borderColor: presentation?.shiftBorderColor ?? mobileColors.brandBorder,
    textColor: presentation?.shiftTextColor ?? mobileColors.brand,
  };
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
      backgroundColor: jobColor ?? mobileColors.surfaceSecondary,
      borderColor: jobBorderColor ?? mobileColors.border,
      textColor: jobTextColor ?? mobileColors.textMuted,
      isMentored: colorSource?.isMentored === true,
    };
  }

  const normalizedLabel = trimmedLabel.toLowerCase();
  const tone =
    normalizedLabel.includes("supervisor") ||
    normalizedLabel.includes("lead") ||
    normalizedLabel.includes("manager")
      ? {
          backgroundColor: "#FCE7F3",
          borderColor: "#FBCFE8",
          textColor: "#BE185D",
        }
      : normalizedLabel.includes("mentor") || normalizedLabel.includes("trainer")
        ? {
            backgroundColor: "#FFF7ED",
            borderColor: "#FED7AA",
            textColor: "#B45309",
          }
        : normalizedLabel.includes("nurse") ||
            normalizedLabel.includes("rn") ||
            normalizedLabel.includes("lpn")
          ? {
              backgroundColor: "#ECFEFF",
              borderColor: "#A5F3FC",
              textColor: "#0E7490",
            }
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

function buildGeneralShiftChip(
  mobileColors: MobileColors,
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const chip = buildJobChip(mobileColors, label, colorSource);

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

function getOpenShiftJobChip(mobileColors: MobileColors, openShift: MobileOpenShift): JobChip | null {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(mobileColors, getOpenShiftLabel(openShift), primarySegment);
  }

  const segment = openShift.presentation.segments.find((item) => item.jobName) ?? null;

  return buildJobChip(mobileColors, segment?.jobName ?? null, segment);
}

function getSegmentJobChip(
  mobileColors: MobileColors,
  segment: MobileScheduleEntrySegment,
): JobChip | null {
  if (isGeneralShiftSegment(segment)) {
    return buildGeneralShiftChip(mobileColors, segment.shiftName ?? segment.label, segment);
  }

  return buildJobChip(mobileColors, segment.jobName ?? null, segment);
}

function getOpenShiftFocusAreaName(openShift: MobileOpenShift): string | null {
  return (
    openShift.presentation.segments.find((segment) => segment.displayFocusAreaName)
      ?.displayFocusAreaName ??
    openShift.presentation.displayFocusAreaName ??
    openShift.focusAreaName
  );
}

function getOpenShiftTimeRange(openShift: MobileOpenShift): string | null {
  const segment = openShift.presentation.segments.find((item) => item.startTime && item.endTime);

  if (segment?.startTime && segment.endTime) {
    return formatScheduleTimeRange(segment.startTime, segment.endTime);
  }

  if (openShift.presentation.startTime && openShift.presentation.endTime) {
    return formatScheduleTimeRange(
      openShift.presentation.startTime,
      openShift.presentation.endTime,
    );
  }

  if (!openShift.state.customStartTime || !openShift.state.customEndTime) {
    return null;
  }

  return formatScheduleTimeRange(openShift.state.customStartTime, openShift.state.customEndTime);
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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={[styles.cardIconFrame, muted && styles.cardIconFrameMuted]}>
      <Ionicons color={mobileColors.brand} name={name} size={18} />
    </View>
  );
}

export default function RequestsScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
  const requestsQuery = useQuery({
    queryKey: ["mobile", "requests", accessToken, requestRange.startDate, requestRange.endDate],
    queryFn: () => getShiftRequests(accessToken!, requestRange),
    enabled: Boolean(accessToken),
  });
  const availabilityScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "requests",
      "availability",
      accessToken,
      requestRange.startDate,
      requestRange.endDate,
    ],
    queryFn: () => getMySchedule(accessToken!, requestRange),
    enabled: Boolean(accessToken) && Boolean(linkedEmployeeId) && !canViewAllRequests,
  });
  const refreshRequests = useCallback(() => {
    const refreshes: Array<Promise<unknown>> = [requestsQuery.refetch()];

    if (linkedEmployeeId && !canViewAllRequests) {
      refreshes.push(availabilityScheduleQuery.refetch());
    }

    return Promise.all(refreshes);
  }, [availabilityScheduleQuery, canViewAllRequests, linkedEmployeeId, requestsQuery]);
  const manualRefresh = useManualRefresh(refreshRequests);
  useMobileShiftRequestsRealtime({
    orgId: bootstrapQuery.data?.currentOrg.id ?? null,
    onChange: refreshRequests,
  });
  const requestActionMutation = useMutation({
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update request",
        fallbackMessage: "We couldn't update that shift request.",
      });
    },
    onSuccess: async (_, variables) => {
      const refreshes: Array<Promise<unknown>> = [requestsQuery.refetch()];

      if (linkedEmployeeId && !canViewAllRequests) {
        refreshes.push(availabilityScheduleQuery.refetch());
      }

      await Promise.all(refreshes);
      pushToast({
        tone: "success",
        ...getMobileRequestActionSuccessToast(variables.body),
      });
    },
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
    setPendingAction({
      key: feedback.key,
      label: feedback.pendingLabel,
    });
    requestActionMutation.mutate(
      { requestId, body },
      {
        onSettled: () => {
          setPendingAction(null);
        },
      },
    );
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
  const historyRequests = useMemo(
    () => requests.filter((request) => !ACTIVE_REQUEST_STATUSES.has(request.status)),
    [requests],
  );
  const contentState = getMobileQueryContentState({
    hasData:
      availableOpenShiftFeed.totalCount > 0 ||
      allRequests.length > 0 ||
      myRequests.length > 0 ||
      approvalRequests.length > 0 ||
      historyRequests.length > 0,
    isLoading:
      requestsQuery.isLoading || bootstrapQuery.isLoading || availabilityScheduleQuery.isLoading,
    error: requestsQuery.error ?? bootstrapQuery.error ?? availabilityScheduleQuery.error,
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
        ? (requests.find((request) => request.id === highlightedRequestId) ?? null)
        : null,
    [highlightedRequestId, requests],
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
      title="Requests"
      subtitle="Requests"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRowContent}
        style={styles.tabRow}
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              accessibilityState={{ selected: isActive }}
              accessibilityRole="button"
              android_ripple={{ color: mobileColors.rippleNeutral }}
              onPress={() => setSelectedTab(tab.key)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 ? (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading shift requests</Text>
          <Text style={styles.loadingBody}>
            Bringing your active requests and history into the mobile app.
          </Text>
          <ListSkeleton rows={4} showSectionHeader={false} />
        </View>
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load requests"
          variant="centered"
          onAction={() => {
            void requestsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
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
              iconName="checkmark-done-outline"
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
          {historyRequests.length === 0 ? (
            <EmptyStateCard
              fillScreen
              body="Resolved, canceled, and expired requests appear here."
              iconName="time-outline"
              title="No history yet"
            />
          ) : (
            historyRequests.map((request) => (
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
      )}
      <ConfirmationModal
        body={requestActionConfirmation?.feedback.message}
        confirmLabel={requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"}
        confirmTone={
          requestActionConfirmation?.feedback.confirmStyle === "destructive"
            ? "dangerFilled"
            : "primary"
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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
  const typeLabel =
    request.type === "pickup"
      ? "Pickup request"
      : request.type === "swap"
        ? "Swap request"
        : "Calloff request";
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
            <Text style={styles.metaText}>
              {typeLabel}
              {showDate ? ` • ${request.requesterShiftDate}` : ""}
            </Text>
            {requesterSplitSegments.length > 1 ? (
              <View style={styles.splitShiftPanel}>
                <SplitShiftBadge count={requesterSplitSegments.length} compact />
                <SplitShiftSegmentList
                  renderSegmentChip={(segment) => (
                    <JobPill
                      chip={getSegmentJobChip(mobileColors, segment)}
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
                  colors={getShiftPillColors(mobileColors, request.requesterPresentation)}
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
                      chip={getSegmentJobChip(mobileColors, segment)}
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
          <Text style={[styles.statusChipText, { color: statusTone.textColor }]}>
            {formatRequestStatus(request.status)}
          </Text>
        </View>
      </View>
      {hasActions ? (
        <View style={styles.cardActions}>
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
                    label={isLoading ? pendingAction.label : "Cancel"}
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
                    label={isLoading ? pendingAction.label : "Claim"}
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
                  accept: true,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label={isLoading ? pendingAction.label : "Accept"}
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                  />
                );
              })()}
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
                    label={isLoading ? pendingAction.label : "Decline"}
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                    tone="neutral"
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
                  approved: true,
                };
                const isLoading =
                  pendingAction?.key === getMobileRequestActionKey(request.id, body);

                return (
                  <Button
                    compact
                    disabled={Boolean(pendingAction)}
                    label={isLoading ? pendingAction.label : "Approve"}
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                  />
                );
              })()}
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
                    label={isLoading ? pendingAction.label : "Reject"}
                    loading={isLoading}
                    onPress={() => {
                      onAction(body);
                    }}
                    tone="danger"
                  />
                );
              })()}
            </>
          ) : null}
        </View>
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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const statusChipTones = useMemo(() => createStatusChipTones(mobileColors), [mobileColors]);
  const openShiftChipTone = statusChipTones.open;
  const shiftLabel = getOpenShiftLabel(openShift);
  const focusAreaName = getOpenShiftFocusAreaName(openShift);
  const jobChip = getOpenShiftJobChip(mobileColors, openShift);
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
          <Text style={[styles.statusChipText, { color: openShiftChipTone.textColor }]}>
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
                chip={getSegmentJobChip(mobileColors, segment)}
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
                label={isLoading ? pendingAction.label : "Volunteer"}
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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
            style={[
              styles.jobPillEyebrowText,
              compact && styles.jobPillEyebrowTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.eyebrowLabel}
          </Text>
          <Text
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
            style={[
              styles.jobPillText,
              compact && styles.jobPillTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text style={[styles.jobPillMentoredText, { color: chip.textColor }]}>(Mentored)</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ShiftPill({ colors, label }: { colors: ShiftPillColors; label: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
      <Text style={[styles.shiftPillText, { color: colors.textColor }]}>{label}</Text>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
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
  tabRow: {
    marginHorizontal: -mobileSpacing.screenX,
  },
  tabRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: mobileSpacing.screenX,
    paddingVertical: 2,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    maxWidth: 180,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
  },
  tabButtonActive: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brand,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: mobileColors.textSecondary,
  },
  tabButtonTextActive: {
    color: mobileColors.textInverse,
  },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  tabBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  tabBadgeText: {
    ...mobileText.badge,
    color: mobileColors.textMuted,
    textAlign: "center",
    includeFontPadding: false,
  },
  tabBadgeTextActive: {
    color: mobileColors.textInverse,
  },
  section: {
    gap: 10,
  },
  dateGroup: {
    gap: 10,
  },
  dateGroupLabel: {
    ...mobileText.bodyStrong,
    color: mobileColors.textMuted,
  },
  dateGroupItems: {
    gap: 10,
  },
  requestCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 10,
  },
  openShiftCard: {
    gap: 12,
    padding: 18,
  },
  requestCardHighlighted: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brandSoft,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  openShiftTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardIconFrame: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.brandSoft,
  },
  cardIconFrameMuted: {
    backgroundColor: mobileColors.surface,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 8,
    marginLeft: 42,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: mobileColors.borderSubtle,
  },
  cardActionsFlush: {
    marginLeft: 0,
  },
  requestTitle: {
    ...mobileText.cardTitle,
    flex: 1,
    minWidth: 0,
    color: mobileColors.textPrimary,
  },
  openShiftTitle: {
    ...mobileText.sectionTitle,
    flex: 1,
    minWidth: 0,
    color: mobileColors.textPrimary,
  },
  shiftTitleTimeRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  shiftTitleTimeText: {
    ...mobileText.rowTitle,
    color: mobileColors.textMuted,
    fontWeight: "500",
    // Matches the pill's text below: Android's default font padding throws
    // off vertical centering against the bordered/padded pill next to it.
    includeFontPadding: false,
  },
  shiftPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  splitShiftPanel: {
    gap: 10,
  },
  splitShiftPanelLabel: {
    ...mobileText.meta,
    color: mobileColors.textMuted,
    fontWeight: "700",
  },
  shiftPill: {
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shiftPillText: {
    ...mobileText.meta,
    fontWeight: "600",
    includeFontPadding: false,
  },
  statusChip: {
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  statusChipText: {
    ...mobileText.caption,
    color: mobileColors.textSecondary,
    fontWeight: "600",
    includeFontPadding: false,
  },
  metaText: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  openShiftContextStack: {
    gap: 8,
  },
  openShiftContextText: {
    ...mobileText.rowTitle,
    color: mobileColors.textSecondary,
  },
  jobPill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  jobPillCompact: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  jobPillTextStack: {
    gap: 2,
  },
  jobPillInlineTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  jobPillEyebrowText: {
    ...mobileText.micro,
    includeFontPadding: false,
  },
  jobPillEyebrowTextCompact: {
    fontSize: 9,
  },
  jobPillText: {
    ...mobileText.badge,
    textTransform: "uppercase",
    includeFontPadding: false,
  },
  jobPillMentoredText: {
    textTransform: "none",
  },
  jobPillTextCompact: {
    fontSize: 12,
  },
  jobPillValueText: {
    ...mobileText.meta,
    fontWeight: "600",
    includeFontPadding: false,
  },
  jobPillValueTextCompact: {
    fontSize: 12,
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
    includeFontPadding: false,
  },
});
