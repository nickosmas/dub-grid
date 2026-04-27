import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { MobileOpenShift, MobileShiftRequest } from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { getShiftRequests, updateShiftRequest } from "../../../shared/lib/api";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import { mobileColors, mobileRadii } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

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

function getOpenShiftTimeRange(openShift: MobileOpenShift): string | null {
  const segment = openShift.presentation.segments.find(
    (item) => item.startTime && item.endTime,
  );

  if (!segment?.startTime || !segment.endTime) {
    return null;
  }

  return `${segment.startTime.slice(0, 5)} - ${segment.endTime.slice(0, 5)}`;
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
  const [selectedTab, setSelectedTab] = useState<RequestTab | null>(null);
  const requestsQuery = useQuery({
    queryKey: ["mobile", "requests", accessToken],
    queryFn: () => getShiftRequests(accessToken!),
    enabled: Boolean(accessToken),
  });
  const requestActionMutation = useMutation({
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
    onSuccess: async () => {
      await requestsQuery.refetch();
    },
  });

  const requests = requestsQuery.data?.requests ?? [];
  const openShifts = requestsQuery.data?.openShifts ?? [];
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const canApprove = Boolean(
    bootstrapQuery.data?.permissions.canApproveShiftRequests,
  );
  const availableRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          (request.type === "pickup" &&
            request.status === "open" &&
            request.requesterEmpId !== linkedEmployeeId) ||
          (linkedEmployeeId != null &&
            request.targetEmpId === linkedEmployeeId &&
            request.status === "open"),
      ),
    [linkedEmployeeId, requests],
  );
  const myRequests = useMemo(
    () =>
      linkedEmployeeId
        ? requests.filter(
            (request) =>
              request.requesterEmpId === linkedEmployeeId &&
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
    isLoading: requestsQuery.isLoading || bootstrapQuery.isLoading,
    error: requestsQuery.error ?? bootstrapQuery.error,
  });
  const mutationError = requestActionMutation.error
    ? getQueryErrorMessage(
        requestActionMutation.error,
        "We couldn't update that shift request.",
      )
    : null;
  const tabs = [
    {
      key: "available" as const,
      label: "Available",
      count: openShifts.length + availableRequests.length,
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
    if (openShifts.length > 0 || availableRequests.length > 0) {
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
    availableRequests.length,
    canApprove,
    highlightedRequest,
    historyRequests.length,
    linkedEmployeeId,
    myRequests.length,
    openShifts.length,
    routeTab,
    visibleTabs,
  ]);
  const activeTab = selectedTab ?? defaultTab;

  return (
    <Screen
      title="Requests"
      subtitle="Requests"
      refreshing={requestsQuery.isFetching || requestActionMutation.isPending}
      onRefresh={() => {
        void requestsQuery.refetch();
      }}
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

      {mutationError ? (
        <QueryStateCard
          title="Could not update request"
          body={mutationError}
          actionLabel="Refresh"
          onAction={() => {
            void requestsQuery.refetch();
          }}
        />
      ) : null}
      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading shift requests"
          body="Bringing your active requests and history into the mobile app."
        />
      ) : contentState.kind === "error" ? (
        <QueryStateCard
          title="Could not load requests"
          body={contentState.message}
          actionLabel="Try Again"
          onAction={() => {
            void requestsQuery.refetch();
          }}
        />
      ) : contentState.kind === "empty" ? (
        <Card
          title="No request activity yet"
          body="Requests will appear here once someone asks for coverage or a shift pickup."
        />
      ) : activeTab === "available" ? (
        <View style={styles.section}>
          {openShifts.length === 0 && availableRequests.length === 0 ? (
            <Card
              title="Nothing to pick up"
              body="Open shifts and requests waiting on your response will show up here."
            />
          ) : (
            <>
              {openShifts.map((openShift) => (
                <OpenShiftCard
                  key={openShift.id}
                  linkedEmployeeId={linkedEmployeeId}
                  mutationPending={requestActionMutation.isPending}
                  onAction={(body) =>
                    requestActionMutation.mutate({
                      requestId: openShift.id,
                      body,
                    })
                  }
                  openShift={openShift}
                />
              ))}
              {availableRequests.map((request) => (
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
              ))}
            </>
          )}
        </View>
      ) : activeTab === "mine" ? (
        <View style={styles.section}>
          {myRequests.length === 0 ? (
            <Card
              title="No active requests"
              body="Requests you create stay here until they are resolved or canceled."
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
            <Card
              title="Nothing waiting for approval"
              body="Requests only appear here when a manager decision is needed."
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
            <Card
              title="No request history"
              body="Approved, rejected, canceled, and expired requests stay here."
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
}: {
  request: MobileShiftRequest;
  linkedEmployeeId: string | null;
  canApprove: boolean;
  highlighted: boolean;
  mutationPending: boolean;
  onAction: (body: RequestActionBody) => void;
}) {
  return (
    <View
      style={[styles.requestCard, highlighted && styles.requestCardHighlighted]}
    >
      <View style={styles.requestHeaderRow}>
        <Text style={styles.requestTitle}>
          {request.requesterName} • {request.requesterShiftDate}
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
      <Text style={styles.metaText}>
        Shift: {request.requesterPresentation?.label ?? "Shift"}
      </Text>
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
}: {
  openShift: MobileOpenShift;
  linkedEmployeeId: string | null;
  mutationPending: boolean;
  onAction: (body: RequestActionBody) => void;
}) {
  const timeRange = getOpenShiftTimeRange(openShift);

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestHeaderRow}>
        <Text style={styles.requestTitle}>
          {openShift.presentation.label} • {openShift.date}
        </Text>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>Open shift</Text>
        </View>
      </View>
      <Text style={styles.metaText}>
        {openShift.focusAreaName ? `${openShift.focusAreaName} • ` : ""}
        {openShift.needed} teammate{openShift.needed === 1 ? "" : "s"} needed
      </Text>
      {timeRange ? <Text style={styles.metaText}>{timeRange}</Text> : null}
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
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  requestCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 10,
  },
  requestCardHighlighted: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brandSoft,
  },
  requestHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  requestTitle: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  statusChip: {
    borderRadius: mobileRadii.pill,
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
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
