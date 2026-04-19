import type { MobileShiftRequest } from "@dubgrid/contracts";
import { StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import {
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import {
  mobileColors,
  mobileRadii,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

const ACTIVE_REQUEST_STATUSES = new Set(["open", "pending_approval"]);

export default function RequestsScreen() {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const requestsQuery = useQuery({
    queryKey: ["mobile", "requests", accessToken],
    queryFn: () => getShiftRequests(accessToken!),
    enabled: Boolean(accessToken),
  });
  const requestActionMutation = useMutation({
    mutationFn: async (input: {
      requestId: string;
      body:
        | { action: "cancel"; empId: string }
        | { action: "claim"; claimerEmpId: string }
        | { action: "respond"; empId: string; accept: boolean }
        | { action: "resolve"; approved: boolean; note?: string };
    }) => updateShiftRequest(accessToken!, input.requestId, input.body),
    onSuccess: async () => {
      await requestsQuery.refetch();
    },
  });

  const requests = requestsQuery.data?.requests ?? [];
  const activeRequests = requests.filter((request) =>
    ACTIVE_REQUEST_STATUSES.has(request.status),
  );
  const historyRequests = requests.filter(
    (request) => !ACTIVE_REQUEST_STATUSES.has(request.status),
  );
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const canApprove = Boolean(
    bootstrapQuery.data?.permissions.canApproveShiftRequests,
  );
  const contentState = getMobileQueryContentState({
    hasData: requests.length > 0,
    isLoading: requestsQuery.isLoading || bootstrapQuery.isLoading,
    error: requestsQuery.error ?? bootstrapQuery.error,
  });
  const mutationError = requestActionMutation.error
    ? getQueryErrorMessage(
        requestActionMutation.error,
        "We couldn't update that shift request.",
      )
    : null;

  return (
    <Screen
      title="Requests"
      subtitle="Requests"
      refreshing={requestsQuery.isFetching || requestActionMutation.isPending}
      onRefresh={() => {
        void requestsQuery.refetch();
      }}
    >
      <Text style={styles.introText}>
        Open a published shift from Schedule to start a coverage or swap
        request.
      </Text>

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
          body="Coverage and swap requests will appear here once they have been created from the schedule."
        />
      ) : (
        <>
          {activeRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active</Text>
              {activeRequests.map((request) => (
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
                  request={request}
                />
              ))}
            </View>
          ) : null}
          {historyRequests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>History</Text>
              {historyRequests.map((request) => (
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
                  request={request}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function RequestCard({
  request,
  linkedEmployeeId,
  canApprove,
  mutationPending,
  onAction,
}: {
  request: MobileShiftRequest;
  linkedEmployeeId: string | null;
  canApprove: boolean;
  mutationPending: boolean;
  onAction: (
    body:
      | { action: "cancel"; empId: string }
      | { action: "claim"; claimerEmpId: string }
      | { action: "respond"; empId: string; accept: boolean }
      | { action: "resolve"; approved: boolean; note?: string },
  ) => void;
}) {
  return (
    <View style={styles.requestCard}>
      <Text style={styles.requestTitle}>
        {request.requesterName} • {request.requesterShiftDate}
      </Text>
      <Text style={styles.statusText}>Status: {request.status}</Text>
      <Text style={styles.metaText}>
        Type: {request.type} • Shift: {request.requesterShiftLabel}
      </Text>
      {request.targetName ? (
        <Text style={styles.metaText}>Target: {request.targetName}</Text>
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

const styles = StyleSheet.create({
  introText: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  requestCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 10,
  },
  requestTitle: {
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  statusText: {
    color: mobileColors.textSecondary,
    fontWeight: "700",
  },
  metaText: {
    color: mobileColors.textMuted,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
