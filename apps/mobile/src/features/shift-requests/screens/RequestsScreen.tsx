import { useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MobileOpenShift,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { ListSkeleton } from "../../../shared/components/Skeleton";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import {
  getMySchedule,
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import {
  getMobileQueryContentState,
} from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileBorderColorFromText,
  mobileColors,
  mobileRadii,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  addDaysToIsoDate,
  buildAvailableOpenShiftFeed,
  formatScheduleDayLabel,
  formatScheduleTimeRange,
  getIsoDateInTimeZone,
} from "../../schedule/lib/schedule";

const ACTIVE_REQUEST_STATUSES = new Set(["open", "pending_approval"]);

type RequestTab = "available" | "mine" | "approval" | "history";
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

type ShiftPillColors = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};
type JobColorSource = {
  jobColor?: string | null;
  jobBorderColor?: string | null;
  jobTextColor?: string | null;
};
type JobChipKind = "job" | "general";
type JobChip = ShiftPillColors & {
  kind: JobChipKind;
  label: string;
  eyebrowLabel?: string | null;
};

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

function getOpenShiftLabel(openShift: MobileOpenShift): string {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  return (
    primarySegment?.shiftName ??
    openShift.presentation.shiftName ??
    openShift.presentation.label
  );
}

function buildJobChip(
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
      : normalizedLabel.includes("mentor") ||
          normalizedLabel.includes("trainer")
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
    ...tone,
  };
}

function buildGeneralShiftChip(
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const chip = buildJobChip(label, colorSource);

  if (!chip) {
    return null;
  }

  return {
    ...chip,
    kind: "general",
    eyebrowLabel: "General shift",
  };
}

function isGeneralShiftSegment(
  segment: { shiftId?: number | null } | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

function getOpenShiftJobChip(openShift: MobileOpenShift): JobChip | null {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(getOpenShiftLabel(openShift), primarySegment);
  }

  const segment =
    openShift.presentation.segments.find((item) => item.jobName) ?? null;

  return buildJobChip(segment?.jobName ?? null, segment);
}

function getOpenShiftFocusAreaName(openShift: MobileOpenShift): string | null {
  return (
    openShift.presentation.segments.find(
      (segment) => segment.displayFocusAreaName,
    )?.displayFocusAreaName ??
    openShift.presentation.displayFocusAreaName ??
    openShift.focusAreaName
  );
}

function getOpenShiftTimeRange(openShift: MobileOpenShift): string | null {
  const segment = openShift.presentation.segments.find(
    (item) => item.startTime && item.endTime,
  );

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

  return formatScheduleTimeRange(
    openShift.state.customStartTime,
    openShift.state.customEndTime,
  );
}

function formatRequestStatus(status: MobileShiftRequest["status"]): string {
  return status === "pending_approval"
    ? "Pending approval"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export default function RequestsScreen() {
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    tab?: string | string[];
  }>();
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const { pushToast } = useToast();
  const now = useRealtimeNow();
  const [selectedTab, setSelectedTab] = useState<RequestTab | null>(null);
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const todayDate = useMemo(
    () => getIsoDateInTimeZone(now, timeZone),
    [now, timeZone],
  );
  const requestRange = useMemo(
    () => ({
      startDate: todayDate,
      endDate: addDaysToIsoDate(todayDate, 13),
    }),
    [todayDate],
  );
  const requestsQuery = useQuery({
    queryKey: [
      "mobile",
      "requests",
      accessToken,
      requestRange.startDate,
      requestRange.endDate,
    ],
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
    enabled: Boolean(accessToken) && Boolean(linkedEmployeeId),
  });
  const manualRefresh = useManualRefresh(async () => {
    const refreshes: Array<Promise<unknown>> = [requestsQuery.refetch()];

    if (linkedEmployeeId) {
      refreshes.push(availabilityScheduleQuery.refetch());
    }

    await Promise.all(refreshes);
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
    onSuccess: async () => {
      const refreshes: Array<Promise<unknown>> = [requestsQuery.refetch()];

      if (linkedEmployeeId) {
        refreshes.push(availabilityScheduleQuery.refetch());
      }

      await Promise.all(refreshes);
    },
  });

  const requests = requestsQuery.data?.requests ?? [];
  const openShifts = requestsQuery.data?.openShifts ?? [];
  const availabilityScheduleEntries =
    availabilityScheduleQuery.data?.entries ?? [];
  const canApprove = Boolean(
    bootstrapQuery.data?.permissions.canApproveShiftRequests,
  );
  const availableOpenShiftFeed = useMemo(
    () =>
      buildAvailableOpenShiftFeed({
        linkedEmployeeId,
        scheduleEntries: availabilityScheduleEntries,
        openShifts,
        requests,
      }),
    [availabilityScheduleEntries, linkedEmployeeId, openShifts, requests],
  );
  const myRequests = useMemo(
    () =>
      linkedEmployeeId
        ? requests.filter(
            (request) =>
              (request.requesterEmpId === linkedEmployeeId ||
                request.targetEmpId === linkedEmployeeId) &&
              ACTIVE_REQUEST_STATUSES.has(request.status),
          )
        : [],
    [linkedEmployeeId, requests],
  );
  const approvalRequests = useMemo(
    () =>
      canApprove
        ? requests.filter((request) => request.status === "pending_approval")
        : [],
    [canApprove, requests],
  );
  const historyRequests = useMemo(
    () =>
      requests.filter((request) => !ACTIVE_REQUEST_STATUSES.has(request.status)),
    [requests],
  );
  const contentState = getMobileQueryContentState({
    hasData: requests.length > 0 || openShifts.length > 0,
    isLoading:
      requestsQuery.isLoading ||
      bootstrapQuery.isLoading ||
      availabilityScheduleQuery.isLoading,
    error:
      requestsQuery.error ??
      bootstrapQuery.error ??
      availabilityScheduleQuery.error,
  });
  const tabs = [
    {
      key: "available" as const,
      label: "Available",
      count: availableOpenShiftFeed.totalCount,
      visible: true,
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
      rawTab === "mine" ||
      rawTab === "approval" ||
      rawTab === "history"
    ) {
      return rawTab;
    }

    return null;
  }, [params.tab]);
  const highlightedRequestId = useMemo(() => {
    const rawRequestId = Array.isArray(params.requestId)
      ? params.requestId[0]
      : params.requestId;

    return rawRequestId ?? null;
  }, [params.requestId]);
  const highlightedRequest = useMemo(
    () =>
      highlightedRequestId
        ? requests.find((request) => request.id === highlightedRequestId) ?? null
        : null,
    [highlightedRequestId, requests],
  );
  const defaultTab = useMemo((): RequestTab => {
    if (
      routeTab &&
      visibleTabs.some((tab) => tab.key === routeTab)
    ) {
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
      return "available";
    }

    if (approvalRequests.length > 0) {
      return "approval";
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
    availableOpenShiftFeed.totalCount,
    canApprove,
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
      <View style={styles.tabRow}>
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              onPress={() => setSelectedTab(tab.key)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text
                style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}
              >
                {tab.label}
              </Text>
              <View
                style={[styles.tabBadge, isActive && styles.tabBadgeActive]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    isActive && styles.tabBadgeTextActive,
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

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
          actionLabel="Try Again"
          body={contentState.message}
          title="Could not load requests"
          onAction={() => {
            void requestsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
        <EmptyStateCard
          body="Requests will appear here once someone asks for coverage or a shift pickup."
          iconName="swap-horizontal-outline"
          title="No request activity yet"
        />
      ) : activeTab === "available" ? (
        <View style={styles.section}>
          {availableOpenShiftFeed.totalCount === 0 ? (
            <EmptyStateCard
              body="Open shifts you can volunteer for or claim will show up here."
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
                        mutationPending={requestActionMutation.isPending}
                        onAction={(body) =>
                          requestActionMutation.mutate({
                            requestId: item.openShift.id,
                            body,
                          })
                        }
                        openShift={item.openShift}
                        showDate={false}
                      />
                    ) : (
                      <RequestCard
                        key={item.key}
                        canApprove={false}
                        linkedEmployeeId={linkedEmployeeId}
                        mutationPending={requestActionMutation.isPending}
                        onAction={(body) =>
                          requestActionMutation.mutate({
                            requestId: item.request.id,
                            body,
                          })
                        }
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
      ) : activeTab === "mine" ? (
        <View style={styles.section}>
          {myRequests.length === 0 ? (
            <EmptyStateCard
              body="Requests you create stay here until they are resolved or canceled."
              iconName="document-text-outline"
              title="No active requests"
            />
          ) : (
            myRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={false}
                linkedEmployeeId={linkedEmployeeId}
                mutationPending={requestActionMutation.isPending}
                  onAction={(body) =>
                    requestActionMutation.mutate({
                      requestId: request.id,
                    body,
                  })
                  }
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
              body="Requests only appear here when a manager decision is needed."
              iconName="checkmark-done-outline"
              title="Nothing waiting for approval"
            />
          ) : (
            approvalRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={canApprove}
                linkedEmployeeId={linkedEmployeeId}
                mutationPending={requestActionMutation.isPending}
                  onAction={(body) =>
                    requestActionMutation.mutate({
                      requestId: request.id,
                    body,
                  })
                  }
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
              body="Approved, rejected, canceled, and expired requests stay here."
              iconName="time-outline"
              title="No request history"
            />
          ) : (
            historyRequests.map((request) => (
              <RequestCard
                key={request.id}
                canApprove={canApprove}
                linkedEmployeeId={linkedEmployeeId}
                mutationPending={requestActionMutation.isPending}
                  onAction={(body) =>
                    requestActionMutation.mutate({
                      requestId: request.id,
                    body,
                  })
                  }
                  highlighted={highlightedRequestId === request.id}
                  request={request}
                />
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

function RequestCard({
  request,
  linkedEmployeeId,
  canApprove,
  highlighted,
  mutationPending,
  onAction,
  showDate = true,
}: {
  request: MobileShiftRequest;
  linkedEmployeeId: string | null;
  canApprove: boolean;
  highlighted: boolean;
  mutationPending: boolean;
  onAction: (body: RequestActionBody) => void;
  showDate?: boolean;
}) {
  const shiftLabel = getRequestShiftLabel(request);

  return (
    <View
      style={[styles.requestCard, highlighted && styles.requestCardHighlighted]}
    >
      <View style={styles.requestHeaderRow}>
        <Text style={styles.requestTitle}>
          {showDate
            ? `${request.requesterName} • ${request.requesterShiftDate}`
            : request.requesterName}
        </Text>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>
            {formatRequestStatus(request.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.metaText}>
        {request.type === "pickup"
          ? "Pickup request"
          : request.type === "swap"
            ? "Swap request"
            : "Calloff request"}
      </Text>
      <View style={styles.shiftPillRow}>
        <ShiftPill
          colors={getShiftPillColors(request.requesterPresentation)}
          label={shiftLabel}
        />
      </View>
      {request.targetName ? (
        <Text style={styles.metaText}>Target: {request.targetName}</Text>
      ) : null}
      {request.adminNote ? (
        <Text style={styles.metaText}>Manager note: {request.adminNote}</Text>
      ) : null}
      <View style={styles.actions}>
        {linkedEmployeeId &&
        request.requesterEmpId === linkedEmployeeId &&
        (request.status === "open" || request.status === "pending_approval") ? (
          <Button
            compact
            disabled={mutationPending}
            label="Cancel"
            onPress={() => {
              onAction({ action: "cancel", empId: linkedEmployeeId });
            }}
            tone="neutral"
          />
        ) : null}
        {linkedEmployeeId &&
        request.type === "pickup" &&
        request.status === "open" &&
        request.requesterEmpId !== linkedEmployeeId ? (
          <Button
            compact
            disabled={mutationPending}
            label="Claim"
            onPress={() => {
              onAction({ action: "claim", claimerEmpId: linkedEmployeeId });
            }}
          />
        ) : null}
        {linkedEmployeeId &&
        request.targetEmpId === linkedEmployeeId &&
        request.status === "open" ? (
          <>
            <Button
              compact
              disabled={mutationPending}
              label="Accept"
              onPress={() => {
                onAction({
                  action: "respond",
                  empId: linkedEmployeeId,
                  accept: true,
                });
              }}
            />
            <Button
              compact
              disabled={mutationPending}
              label="Decline"
              onPress={() => {
                onAction({
                  action: "respond",
                  empId: linkedEmployeeId,
                  accept: false,
                });
              }}
              tone="neutral"
            />
          </>
        ) : null}
        {canApprove && request.status === "pending_approval" ? (
          <>
            <Button
              compact
              disabled={mutationPending}
              label="Approve"
              onPress={() => {
                onAction({ action: "resolve", approved: true });
              }}
            />
            <Button
              compact
              disabled={mutationPending}
              label="Reject"
              onPress={() => {
                onAction({ action: "resolve", approved: false });
              }}
              tone="danger"
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

function OpenShiftCard({
  openShift,
  linkedEmployeeId,
  mutationPending,
  onAction,
  showDate = true,
}: {
  openShift: MobileOpenShift;
  linkedEmployeeId: string | null;
  mutationPending: boolean;
  onAction: (body: RequestActionBody) => void;
  showDate?: boolean;
}) {
  const shiftLabel = getOpenShiftLabel(openShift);
  const focusAreaName = getOpenShiftFocusAreaName(openShift);
  const jobChip = getOpenShiftJobChip(openShift);
  const timeRange = getOpenShiftTimeRange(openShift);

  return (
    <View style={[styles.requestCard, styles.openShiftCard]}>
      <View style={styles.requestHeaderRow}>
        <Text style={styles.openShiftTitle}>{shiftLabel}</Text>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>Open shift</Text>
        </View>
      </View>
      {showDate ? <Text style={styles.metaText}>{openShift.date}</Text> : null}
      {jobChip || focusAreaName ? (
        <View style={styles.openShiftContextRow}>
          <JobPill chip={jobChip} compact />
          {focusAreaName ? (
            <Text style={styles.openShiftContextText}>{focusAreaName}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.metaText}>
        {openShift.needed} teammate{openShift.needed === 1 ? "" : "s"} needed
      </Text>
      {timeRange ? (
        <View style={styles.openShiftTimeRow}>
          <Ionicons
            color={mobileColors.textMuted}
            name="time-outline"
            size={18}
          />
          <Text style={styles.openShiftTimeText}>{timeRange}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {linkedEmployeeId ? (
          <Button
            compact
            disabled={mutationPending}
            label="Volunteer"
            onPress={() => {
              onAction({
                action: "volunteer_open_shift",
                empId: linkedEmployeeId,
                shiftDate: openShift.date,
                focusAreaId: openShift.focusAreaId,
                state: openShift.state,
              });
            }}
            tone="secondary"
          />
        ) : null}
      </View>
    </View>
  );
}

function JobPill({
  chip,
  compact,
}: {
  chip: JobChip | null;
  compact?: boolean;
}) {
  if (!chip) {
    return null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}`
    : `Job ${chip.label}`;
  const pillBorderColor =
    chip.kind === "general"
      ? mobileBorderColorFromText(chip.textColor)
      : chip.borderColor;

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
          </Text>
        </View>
      ) : (
        <Text
          style={[
            styles.jobPillText,
            compact && styles.jobPillTextCompact,
            { color: chip.textColor },
          ]}
        >
          {chip.label}
        </Text>
      )}
    </View>
  );
}

function ShiftPill({
  colors,
  label,
}: {
  colors: ShiftPillColors;
  label: string;
}) {
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
      <Text style={[styles.shiftPillText, { color: colors.textColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    gap: 14,
  },
  loadingTitle: {
    color: mobileColors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  loadingBody: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
  },
  tabButtonActive: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brandSoft,
  },
  tabButtonText: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: mobileColors.brand,
  },
  tabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  tabBadgeActive: {
    backgroundColor: mobileColors.brand,
  },
  tabBadgeText: {
    color: mobileColors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
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
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "800",
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
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  requestCardHighlighted: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brandSoft,
  },
  requestHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  requestHeaderContent: {
    flex: 1,
    gap: 10,
  },
  requestTitle: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  openShiftTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  shiftPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shiftPill: {
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shiftPillText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
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
    color: mobileColors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  openShiftContextRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  openShiftContextText: {
    color: mobileColors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  openShiftTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  openShiftTimeText: {
    color: mobileColors.textMuted,
    fontSize: 15,
    fontWeight: "600",
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
  jobPillEyebrowText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  jobPillEyebrowTextCompact: {
    fontSize: 9,
  },
  jobPillText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  jobPillTextCompact: {
    fontSize: 12,
  },
  jobPillValueText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  jobPillValueTextCompact: {
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
