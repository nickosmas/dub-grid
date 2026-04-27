import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { Card, Screen } from "../../../shared/components/Screen";
import {
  createShiftRequest,
  getMySchedule,
  getOrgSchedule,
  getShiftRequests,
} from "../../../shared/lib/api";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import { mobileColors, mobileRadii } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  buildScheduleSections,
  buildScheduleShiftGroups,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryCategoryKey,
  getScheduleEntryTimeRange,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryDisplayFocusAreaName,
  getScheduleEntryTitle,
  sortScheduleEntries,
} from "../lib/schedule";

type RequestMode = "coverage" | "swap" | null;
type CoverageRequestType = "pickup" | "calloff" | null;
type ShiftTimeRange = {
  start: string;
  end: string;
};
const ACTIVE_SHIFT_REQUEST_STATUSES = new Set<MobileShiftRequest["status"]>([
  "open",
  "pending_approval",
]);
type ChipTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

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

function getMinutesSinceMidnight(value: string): number | null {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function expandTimeRange(
  range: ShiftTimeRange,
): Array<{ start: number; end: number }> {
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
      (rightRange) =>
        leftRange.start < rightRange.end && rightRange.start < leftRange.end,
    ),
  );
}

function getInitials(name: string): string {
  const parts =
    name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last =
    parts.length > 1
      ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "")
      : "";

  return `${first}${last}` || "?";
}

function hashCode(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function getAvatarTone(seed: string): ChipTone {
  const hue = hashCode(seed) % 360;

  return {
    backgroundColor: `hsl(${hue}, 70%, 92%)`,
    borderColor: `hsl(${hue}, 70%, 85%)`,
    textColor: `hsl(${hue}, 70%, 35%)`,
  };
}

function getEntryJobChip(entry: MobileScheduleEntry):
  | (ChipTone & {
      label: string;
    })
  | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return {
      label: "Absence",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textMuted,
    };
  }

  const segment =
    getScheduleEntrySegments(entry).find((item) => item.jobName) ?? null;
  const label = segment?.jobName?.trim() ?? "";

  if (!label) {
    return null;
  }

  if (segment?.jobColor || segment?.jobBorderColor || segment?.jobTextColor) {
    return {
      label,
      backgroundColor: segment.jobColor ?? mobileColors.surfaceSecondary,
      borderColor: segment.jobBorderColor ?? mobileColors.border,
      textColor: segment.jobTextColor ?? mobileColors.textMuted,
    };
  }

  return {
    label,
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.border,
    textColor: mobileColors.textMuted,
  };
}

function buildSegmentJobChip(segment: MobileScheduleEntrySegment):
  | (ChipTone & {
      label: string;
    })
  | null {
  const label = segment.jobName?.trim() ?? "";

  if (!label) {
    return null;
  }

  if (segment.jobColor || segment.jobBorderColor || segment.jobTextColor) {
    return {
      label,
      backgroundColor: segment.jobColor ?? mobileColors.surfaceSecondary,
      borderColor: segment.jobBorderColor ?? mobileColors.border,
      textColor: segment.jobTextColor ?? mobileColors.textMuted,
    };
  }

  return {
    label,
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.border,
    textColor: mobileColors.textMuted,
  };
}

export default function ShiftDetailScreen() {
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
  const [requestMode, setRequestMode] = useState<RequestMode>(null);
  const [coverageRequestType, setCoverageRequestType] =
    useState<CoverageRequestType>(null);
  const [selectedTargetShift, setSelectedTargetShift] = useState<{
    employeeId: string;
    date: string;
  } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const employeeId = readParam(params.employeeId);
  const shiftDate = readParam(params.date);
  const range = {
    startDate: readParam(params.rangeStart) ?? shiftDate ?? "",
    endDate: readParam(params.rangeEnd) ?? shiftDate ?? "",
  };
  const source = readParam(params.source) === "team" ? "team" : "mine";
  const linkedEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.effectiveRole !== "user" ||
      bootstrapQuery.data.permissions.canApproveShiftRequests ||
      bootstrapQuery.data.permissions.canManageEmployees
    : false;
  const absenceTypes = bootstrapQuery.data?.absenceTypes ?? [];
  const needsTeamScheduleForShift =
    source === "team" || employeeId !== linkedEmployeeId;

  const myScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () => getMySchedule(accessToken!, range),
    enabled:
      Boolean(accessToken) &&
      Boolean(range.startDate) &&
      Boolean(range.endDate),
  });
  const teamScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      "team",
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () => getOrgSchedule(accessToken!, range),
    enabled:
      Boolean(accessToken) &&
      Boolean(range.startDate) &&
      Boolean(range.endDate) &&
      (canViewTeamSchedule ||
        needsTeamScheduleForShift ||
        requestMode === "swap"),
  });
  const requestsQuery = useQuery({
    queryKey: [
      "mobile",
      "requests",
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () => getShiftRequests(accessToken!, range),
    enabled:
      Boolean(accessToken) &&
      Boolean(linkedEmployeeId) &&
      Boolean(range.startDate) &&
      Boolean(range.endDate),
  });
  const createRequestMutation = useMutation({
    mutationFn: (input: {
      type: "pickup" | "swap" | "calloff";
      requesterEmpId: string;
      requesterShiftDate: string;
      targetEmpId?: string;
      targetShiftDate?: string;
      absenceTypeId?: number;
    }) => createShiftRequest(accessToken!, input),
    onSuccess: async (_, variables) => {
      setSuccessMessage(
        variables.type === "calloff"
          ? "Calloff request sent."
          : variables.type === "swap"
            ? "Swap request sent."
            : "Pickup request sent.",
      );
      setRequestMode(null);
      setCoverageRequestType(null);
      setSelectedTargetShift(null);
      await queryClient.invalidateQueries({ queryKey: ["mobile", "requests"] });
    },
  });

  const scheduleEntries = useMemo(() => {
    const entries = [
      ...(myScheduleQuery.data?.entries ?? []),
      ...(teamScheduleQuery.data?.entries ?? []),
    ];

    return entries.filter((entry, index, collection) => {
      return (
        collection.findIndex(
          (candidate) =>
            candidate.employeeId === entry.employeeId &&
            candidate.date === entry.date,
        ) === index
      );
    });
  }, [myScheduleQuery.data?.entries, teamScheduleQuery.data?.entries]);

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
  }, [
    linkedEmployeeId,
    requestsQuery.data?.requests,
    shiftEntry,
    shouldCheckExistingRequests,
  ]);
  const isCheckingExistingRequests =
    shouldCheckExistingRequests && requestsQuery.isLoading;
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

    const activeCategoryKey = getScheduleEntryCategoryKey(shiftEntry);

    const matchingEntries = (teamScheduleQuery.data?.entries ?? []).filter(
      (entry) => {
        return (
          entry.date === shiftEntry.date &&
          entry.employeeId !== shiftEntry.employeeId &&
          getScheduleEntryCategoryKey(entry) === activeCategoryKey
        );
      },
    );
    const matchingGroup = buildScheduleShiftGroups(matchingEntries).find(
      (group) => group.key === activeCategoryKey,
    );

    return matchingGroup?.entries ?? sortScheduleEntries(matchingEntries);
  }, [shiftEntry, teamScheduleQuery.data?.entries]);
  const swapTargetOptions = useMemo(() => {
    if (!shiftEntry || !linkedEmployeeId) {
      return [];
    }

    const requesterCategoryKey = getScheduleEntryCategoryKey(shiftEntry);

    return (teamScheduleQuery.data?.entries ?? []).filter((entry) => {
      if (
        entry.employeeId === linkedEmployeeId ||
        entry.publishedAt == null ||
        getScheduleEntryAbsenceTypeId(entry) != null ||
        !hasWorkedAssignment(entry)
      ) {
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
          (candidate) =>
            candidate.employeeId === linkedEmployeeId &&
            candidate.date === entry.date,
        ) ?? null;
      if (entriesHaveOverlappingTimes(requesterExistingShift, entry)) {
        return false;
      }

      const targetExistingShift =
        scheduleEntries.find(
          (candidate) =>
            candidate.employeeId === entry.employeeId &&
            candidate.date === shiftEntry.date,
        ) ?? null;

      return !entriesHaveOverlappingTimes(targetExistingShift, shiftEntry);
    });
  }, [
    linkedEmployeeId,
    scheduleEntries,
    shiftEntry,
    teamScheduleQuery.data?.entries,
  ]);
  const swapSections = useMemo(
    () => buildScheduleSections(swapTargetOptions, "team", timeZone),
    [swapTargetOptions, timeZone],
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
  const canCreateRequestsForShift = Boolean(
    shiftEntry &&
    linkedEmployeeId &&
    shiftEntry.employeeId === linkedEmployeeId &&
    shiftEntry.publishedAt != null &&
    getScheduleEntryAbsenceTypeId(shiftEntry) == null &&
    hasWorkedAssignment(shiftEntry) &&
    !isCheckingExistingRequests &&
    !shiftRequestCheckError &&
    !activeShiftRequest,
  );
  const canSubmitRequest = Boolean(
    linkedEmployeeId &&
    shiftEntry &&
    requestMode === "swap" &&
    selectedTargetEntry,
  );
  const createError = createRequestMutation.error
    ? getQueryErrorMessage(
        createRequestMutation.error,
        "We couldn't create that request.",
      )
    : null;
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
  const hasMultipleSegments = shiftSegments.length > 1;
  const primarySegment = shiftSegments[0] ?? null;
  const primarySegmentTimeRange = primarySegment
    ? getScheduleEntrySegmentTimeRange(primarySegment)
    : null;
  const publishedAtLabel = shiftEntry
    ? formatPublishedAt(shiftEntry.publishedAt, timeZone)
    : null;
  const publishedSummary = shiftEntry
    ? formatPublishedSummary(shiftEntry.publishedByName, publishedAtLabel)
    : null;
  const focusAreaName = shiftEntry
    ? getScheduleEntryDisplayFocusAreaName(shiftEntry)
    : null;
  const jobChip = shiftEntry ? getEntryJobChip(shiftEntry) : null;
  const shouldShowEmployeeSummary = Boolean(
    shiftEntry && shiftEntry.employeeId !== linkedEmployeeId,
  );
  const shouldShowShiftmates = Boolean(
    canViewTeamSchedule &&
    shiftEntry &&
    getScheduleEntryAbsenceTypeId(shiftEntry) == null,
  );
  const shouldRenderShiftmatesSection = Boolean(
    shouldShowShiftmates &&
    (teamScheduleQuery.isLoading ||
      teamScheduleQuery.error ||
      shiftmates.length > 0),
  );
  const activeAbsenceTypes = absenceTypes;

  function resetRequestMode(nextMode: RequestMode) {
    setRequestMode(nextMode);
    setCoverageRequestType(null);
    setSelectedTargetShift(null);
    setSuccessMessage(null);
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
      targetEmpId: selectedTargetShift?.employeeId,
      targetShiftDate: selectedTargetShift?.date,
    });
  }

  function submitCoverageRequest(
    type: "pickup" | "calloff",
    absenceTypeId?: number,
  ) {
    if (!linkedEmployeeId || !shiftEntry) {
      return;
    }

    if (type === "calloff" && absenceTypeId == null) {
      return;
    }

    createRequestMutation.mutate({
      type,
      requesterEmpId: linkedEmployeeId,
      requesterShiftDate: shiftEntry.date,
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId,
    });
  }

  function confirmCoverageRequest(
    type: "pickup" | "calloff",
    options?: { absenceTypeId?: number; absenceTypeLabel?: string },
  ) {
    if (!shiftEntry) {
      return;
    }

    const shiftLabel = getScheduleEntryTitle(shiftEntry);
    const shiftDateLabel = formatShiftDate(shiftEntry.date);

    Alert.alert(
      type === "pickup"
        ? "Offer shift for pickup?"
        : "Submit call off request?",
      type === "pickup"
        ? `Offer your ${shiftLabel} shift on ${shiftDateLabel} for pickup?`
        : `Submit a ${options?.absenceTypeLabel ?? "selected"} absence request for your ${shiftLabel} shift on ${shiftDateLabel}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: type === "pickup" ? "Offer for pickup" : "Submit call off",
          style: type === "calloff" ? "destructive" : "default",
          onPress: () => submitCoverageRequest(type, options?.absenceTypeId),
        },
      ],
      { cancelable: true },
    );
  }

  function handleSubmitRequest() {
    if (!shiftEntry || !selectedTargetShift || !selectedTargetEntry) {
      return;
    }

    const requesterLabel = getScheduleEntryTitle(shiftEntry);
    const targetLabel = getScheduleEntryTitle(selectedTargetEntry);

    Alert.alert(
      "Submit swap request?",
      `Swap your ${requesterLabel} shift on ${formatShiftDate(shiftEntry.date)} with ${selectedTargetEntry.employeeName}'s ${targetLabel} shift on ${formatShiftDate(selectedTargetEntry.date)}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Submit swap",
          onPress: submitSwapRequest,
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <Screen
      title="Shift Detail"
      subtitle="Shift Detail"
      refreshing={
        bootstrapQuery.isFetching ||
        myScheduleQuery.isFetching ||
        teamScheduleQuery.isFetching ||
        requestsQuery.isFetching
      }
      onRefresh={() => {
        void Promise.all([
          bootstrapQuery.refetch(),
          myScheduleQuery.refetch(),
          teamScheduleQuery.refetch(),
          requestsQuery.refetch(),
        ]);
      }}
    >
      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading shift"
          body="Pulling the latest published shift details into the mobile app."
        />
      ) : contentState.kind === "error" ? (
        <QueryStateCard
          title="Could not load shift"
          body={contentState.message}
          actionLabel="Try Again"
          onAction={() => {
            void Promise.all([
              bootstrapQuery.refetch(),
              myScheduleQuery.refetch(),
              teamScheduleQuery.refetch(),
            ]);
          }}
        />
      ) : !employeeId || !shiftDate || !shiftEntry ? (
        <Card
          title="Shift unavailable"
          body="We could not find that published shift in the selected schedule range."
        />
      ) : (
        <>
          <Card
            title={
              hasMultipleSegments ? "Shifts" : getScheduleEntryTitle(shiftEntry)
            }
            body={formatShiftDate(shiftEntry.date)}
            detail={
              <View style={styles.detailGroup}>
                {shouldShowEmployeeSummary ? (
                  <EmployeeSummary
                    name={shiftEntry.employeeName}
                    subtitle={
                      hasMultipleSegments
                        ? undefined
                        : (primarySegmentTimeRange ?? timeRange ?? undefined)
                    }
                  />
                ) : null}
                {!shouldShowEmployeeSummary &&
                !hasMultipleSegments &&
                timeRange ? (
                  <Text style={styles.detailSummaryText}>{timeRange}</Text>
                ) : null}
                {hasMultipleSegments ? (
                  <ShiftEntrySegmentList entry={shiftEntry} variant="detail" />
                ) : null}
                {!hasMultipleSegments ? <DetailJobPill chip={jobChip} /> : null}
                {!hasMultipleSegments && focusAreaName ? (
                  <Text style={styles.detailMetaText}>{focusAreaName}</Text>
                ) : null}
                {publishedSummary ? (
                  <Text style={styles.detailFootnote}>{publishedSummary}</Text>
                ) : null}
              </View>
            }
          />

          {shouldRenderShiftmatesSection ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Shiftmates</Text>
              {teamScheduleQuery.isLoading ? (
                <Text style={styles.sectionBody}>Loading shiftmates.</Text>
              ) : teamScheduleQuery.error ? (
                <Text style={styles.sectionBody}>
                  {getQueryErrorMessage(
                    teamScheduleQuery.error,
                    "We couldn't load shiftmates right now.",
                  )}
                </Text>
              ) : (
                <View style={styles.shiftmatesList}>
                  {shiftmates.map((entry, index) => (
                    <ShiftmateRow
                      key={`${entry.employeeId}-${entry.date}`}
                      entry={entry}
                      groupFocusAreaName={focusAreaName}
                      groupTimeRange={timeRange}
                      isFirst={index === 0}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {successMessage ? (
            <Card title="Request sent" body={successMessage} />
          ) : null}
          {createError ? (
            <QueryStateCard
              title="Could not create request"
              body={createError}
              actionLabel="Refresh"
              onAction={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["mobile", "requests"],
                });
              }}
            />
          ) : null}
          {isCheckingExistingRequests ? (
            <Card
              title="Checking existing requests"
              body="Making sure this shift does not already have a request in progress."
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
            <QueryStateCard
              title="Could not verify existing requests"
              body={shiftRequestCheckError}
              actionLabel="Refresh"
              onAction={() => {
                void requestsQuery.refetch();
              }}
            />
          ) : null}

          {canCreateRequestsForShift ? (
            <View style={styles.actionsPanel}>
              <Text style={styles.sectionTitle}>Shift actions</Text>
              <View style={styles.requestTypeRow}>
                <RequestTypeChip
                  active={requestMode === "coverage"}
                  label="Drop shift"
                  onPress={() => resetRequestMode("coverage")}
                />
                <RequestTypeChip
                  active={requestMode === "swap"}
                  label="Swap"
                  onPress={() => resetRequestMode("swap")}
                />
              </View>

              {requestMode === "coverage" ? (
                <View style={styles.subsection}>
                  <Text style={styles.subsectionLabel}>Drop shift</Text>
                  <Text style={styles.subsectionBody}>
                    Choose how you want to drop this shift.
                  </Text>
                  <View style={styles.coverageOptionList}>
                    <CoverageOptionCard
                      body="Post the shift for teammates to claim. It stays yours unless someone claims it and approval completes."
                      disabled={createRequestMutation.isPending}
                      onPress={() => confirmCoverageRequest("pickup")}
                      title="Offer for pickup"
                      tone="neutral"
                    />
                    <CoverageOptionCard
                      active={coverageRequestType === "calloff"}
                      body="Use this when you cannot work the shift yourself. Approval records the absence and opens coverage automatically."
                      disabled={
                        createRequestMutation.isPending ||
                        activeAbsenceTypes.length === 0
                      }
                      onPress={() => setCoverageRequestType("calloff")}
                      title="Call off"
                      tone="danger"
                    />
                  </View>
                  {activeAbsenceTypes.length === 0 ? (
                    <Text style={styles.coverageNotice}>
                      Call off is unavailable until at least one active absence
                      type is set up.
                    </Text>
                  ) : null}
                  {coverageRequestType === "calloff" ? (
                    <View style={styles.subsection}>
                      <Text style={styles.subsectionLabel}>
                        Select absence reason
                      </Text>
                      <View style={styles.selectorWrap}>
                        {activeAbsenceTypes.map((absenceType) => (
                          <SelectorChip
                            key={absenceType.id}
                            active={false}
                            disabled={createRequestMutation.isPending}
                            label={absenceType.label}
                            onPress={() =>
                              confirmCoverageRequest("calloff", {
                                absenceTypeId: absenceType.id,
                                absenceTypeLabel: absenceType.label,
                              })
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
                  <View style={styles.swapSummaryList}>
                    <SwapSummaryCard
                      entry={shiftEntry}
                      label={selectedTargetEntry ? "You give" : "Your shift"}
                    />
                    {selectedTargetEntry ? (
                      <SwapSummaryCard
                        entry={selectedTargetEntry}
                        label="You get"
                        summaryNote={`From ${selectedTargetEntry.employeeName}`}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.subsectionLabel}>Eligible teammates</Text>
                  {!canViewTeamSchedule ? (
                    <Text style={styles.subsectionBody}>
                      Swap creation on mobile needs team schedule visibility for
                      this role.
                    </Text>
                  ) : teamScheduleQuery.isLoading ? (
                    <Text style={styles.subsectionBody}>
                      Loading teammate shifts for this range.
                    </Text>
                  ) : teamScheduleQuery.error ? (
                    <Text style={styles.subsectionBody}>
                      {getQueryErrorMessage(
                        teamScheduleQuery.error,
                        "We couldn't load teammate shifts.",
                      )}
                    </Text>
                  ) : swapTargetOptions.length === 0 ? (
                    <Text style={styles.subsectionBody}>
                      No eligible teammate shifts are available in this schedule
                      range yet.
                    </Text>
                  ) : (
                    <View style={styles.swapSectionList}>
                      {swapSections.map((section) => (
                        <View key={section.date} style={styles.swapDateSection}>
                          <Text style={styles.swapDateHeading}>
                            {section.title}
                          </Text>
                          <View style={styles.swapOptions}>
                            {section.entries.map((entry) => (
                              <SwapOptionCard
                                key={`${entry.employeeId}-${entry.date}`}
                                active={
                                  selectedTargetShift?.employeeId ===
                                    entry.employeeId &&
                                  selectedTargetShift?.date === entry.date
                                }
                                entry={entry}
                                onPress={() =>
                                  setSelectedTargetShift({
                                    employeeId: entry.employeeId,
                                    date: entry.date,
                                  })
                                }
                              />
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {requestMode === "swap" ? (
                <View style={styles.actionButtons}>
                  <Button
                    disabled={
                      !canSubmitRequest || createRequestMutation.isPending
                    }
                    label={
                      createRequestMutation.isPending
                        ? "Submitting..."
                        : "Submit"
                    }
                    onPress={handleSubmitRequest}
                  />
                  <Button
                    disabled={createRequestMutation.isPending}
                    label="Cancel"
                    onPress={() => resetRequestMode(null)}
                    tone="neutral"
                  />
                </View>
              ) : null}

              {requestMode === "coverage" ? (
                <View style={styles.actionButtons}>
                  <Button
                    disabled={createRequestMutation.isPending}
                    label="Cancel"
                    onPress={() => resetRequestMode(null)}
                    tone="neutral"
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function EmployeeSummary({
  name,
  subtitle,
}: {
  name: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.employeeSummary}>
      <Text style={styles.employeeSummaryName}>{name}</Text>
      {subtitle ? (
        <Text style={styles.employeeSummarySubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function DetailJobPill({
  chip,
}: {
  chip:
    | (ChipTone & {
        label: string;
      })
    | null;
}) {
  if (!chip) {
    return null;
  }

  return (
    <View
      style={[
        styles.detailJobChip,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: chip.borderColor,
        },
      ]}
    >
      <Text style={[styles.detailJobChipText, { color: chip.textColor }]}>
        {chip.label}
      </Text>
    </View>
  );
}

function ShiftmateRow({
  entry,
  groupFocusAreaName,
  groupTimeRange,
  isFirst,
}: {
  entry: MobileScheduleEntry;
  groupFocusAreaName: string | null;
  groupTimeRange: string | null;
  isFirst: boolean;
}) {
  const avatarTone = getAvatarTone(entry.employeeId);
  const jobChip = getEntryJobChip(entry);
  const entryTimeRange = getScheduleEntryTimeRange(entry);
  const entryFocusAreaName = getScheduleEntryDisplayFocusAreaName(entry);
  const segments = getScheduleEntrySegments(entry);
  const shouldShowSegments = segments.length > 1;
  const metaItems = [
    entryTimeRange && entryTimeRange !== groupTimeRange ? entryTimeRange : null,
    entryFocusAreaName && entryFocusAreaName !== groupFocusAreaName
      ? entryFocusAreaName
      : null,
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
        <Text
          style={[styles.shiftmateAvatarText, { color: avatarTone.textColor }]}
        >
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.shiftmateContent}>
        <View style={styles.shiftmateHeader}>
          <Text style={styles.shiftmateName}>{entry.employeeName}</Text>
          {jobChip ? (
            <View
              style={[
                styles.shiftmateChip,
                {
                  backgroundColor: jobChip.backgroundColor,
                  borderColor: jobChip.borderColor,
                },
              ]}
            >
              <Text
                style={[styles.detailJobChipText, { color: jobChip.textColor }]}
              >
                {jobChip.label}
              </Text>
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

function RequestTypeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.requestTypeChip, active && styles.requestTypeChipActive]}
    >
      <Text
        style={[
          styles.requestTypeChipText,
          active && styles.requestTypeChipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SelectorChip({
  label,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.selectorChip,
        active && styles.selectorChipActive,
        disabled && styles.selectorChipDisabled,
      ]}
    >
      <Text
        style={[
          styles.selectorChipText,
          active && styles.selectorChipTextActive,
        ]}
      >
        {label}
      </Text>
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
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.coverageOptionCard,
        tone === "danger" && styles.coverageOptionCardDanger,
        active && styles.coverageOptionCardActive,
        disabled && styles.coverageOptionCardDisabled,
      ]}
    >
      <Text
        style={[
          styles.coverageOptionTitle,
          tone === "danger" && styles.coverageOptionTitleDanger,
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
  summaryNote,
}: {
  entry: MobileScheduleEntry;
  label: string;
  summaryNote?: string;
}) {
  const segments = getScheduleEntrySegments(entry);
  const primarySegment = segments[0] ?? null;
  const primarySegmentTimeRange = primarySegment
    ? getScheduleEntrySegmentTimeRange(primarySegment)
    : null;
  const timeRange = getScheduleEntryTimeRange(entry);
  const jobChip = getEntryJobChip(entry);

  return (
    <View style={styles.swapSummaryCard}>
      <Text style={styles.swapSummaryLabel}>{label}</Text>
      <Text style={styles.swapSummaryTitle}>
        {getScheduleEntryTitle(entry)}
      </Text>
      <DetailJobPill chip={jobChip} />
      <Text style={styles.swapSummaryDate}>{formatShiftDate(entry.date)}</Text>
      {summaryNote ? (
        <Text style={styles.swapSummaryNote}>{summaryNote}</Text>
      ) : null}
      <Text style={styles.swapSummaryMeta}>
        {primarySegmentTimeRange ?? timeRange ?? "Time unavailable"}
      </Text>
    </View>
  );
}

function SwapOptionCard({
  entry,
  active,
  onPress,
}: {
  entry: MobileScheduleEntry;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.swapOptionCard, active && styles.swapOptionCardActive]}
    >
      <View style={styles.swapOptionHeader}>
        <Text style={styles.swapOptionName}>{entry.employeeName}</Text>
      </View>
      <ShiftEntrySegmentList entry={entry} variant="supporting" />
    </Pressable>
  );
}

function ShiftEntrySegmentList({
  entry,
  variant,
}: {
  entry: MobileScheduleEntry;
  variant: "detail" | "supporting";
}) {
  const segments = getScheduleEntrySegments(entry);

  return (
    <View
      style={
        variant === "detail"
          ? styles.detailSegmentList
          : styles.supportingSegmentList
      }
    >
      {segments.map((segment, index) => {
        const timeRange = getScheduleEntrySegmentTimeRange(segment);

        return (
          <View
            key={`${segment.shiftName}-${index}`}
            style={[
              variant === "detail"
                ? styles.detailSegmentBlock
                : styles.supportingSegmentBlock,
              index > 0 &&
                (variant === "detail"
                  ? styles.detailSegmentDivider
                  : styles.supportingSegmentDivider),
            ]}
          >
            <Text
              style={
                variant === "detail"
                  ? styles.detailSegmentTitle
                  : styles.supportingSegmentTitle
              }
            >
              {segment.shiftName}
            </Text>
            {timeRange ? (
              <Text
                style={
                  variant === "detail"
                    ? styles.detailSegmentMeta
                    : styles.supportingSegmentMeta
                }
              >
                {timeRange}
              </Text>
            ) : null}
            <DetailJobPill chip={buildSegmentJobChip(segment)} />
            {segment.displayFocusAreaName ? (
              <Text
                style={
                  variant === "detail"
                    ? styles.detailSegmentMeta
                    : styles.supportingSegmentMeta
                }
              >
                {segment.displayFocusAreaName}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  detailGroup: {
    gap: 12,
  },
  employeeSummary: {
    gap: 4,
  },
  employeeSummaryName: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  employeeSummarySubtitle: {
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  detailSummaryText: {
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  detailMetaText: {
    color: mobileColors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  detailFootnote: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  detailJobChip: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailJobChipText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  detailSegmentMeta: {
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  actionsPanel: {
    gap: 12,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionBody: {
    color: mobileColors.textMuted,
    lineHeight: 21,
  },
  shiftmatesList: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    overflow: "hidden",
  },
  shiftmateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
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
    fontSize: 14,
    fontWeight: "800",
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
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  shiftmateMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  shiftmateChip: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    color: mobileColors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  supportingSegmentMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  sectionTitle: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  requestTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  requestTypeChip: {
    flex: 1,
    borderRadius: mobileRadii.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: mobileColors.surfaceSecondary,
    alignItems: "center",
  },
  requestTypeChipActive: {
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
  },
  requestTypeChipText: {
    color: mobileColors.textMuted,
    fontWeight: "700",
  },
  requestTypeChipTextActive: {
    color: mobileColors.brand,
  },
  subsection: {
    gap: 10,
  },
  subsectionLabel: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  subsectionBody: {
    color: mobileColors.textMuted,
    lineHeight: 21,
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
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  swapSummaryTitle: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  swapSummaryDate: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  swapSummaryNote: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  swapSummaryMeta: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
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
  },
  coverageOptionCardDanger: {
    borderColor: mobileColors.dangerBorder,
    backgroundColor: mobileColors.dangerSoft,
  },
  coverageOptionCardActive: {
    borderColor: mobileColors.brandBorder,
    backgroundColor: mobileColors.brandSoft,
  },
  coverageOptionCardDisabled: {
    opacity: 0.5,
  },
  coverageOptionTitle: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  coverageOptionTitleDanger: {
    color: mobileColors.danger,
  },
  coverageOptionBody: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  coverageNotice: {
    color: mobileColors.warning,
    lineHeight: 20,
  },
  selectorWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectorChip: {
    borderRadius: mobileRadii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  selectorChipDisabled: {
    opacity: 0.5,
  },
  selectorChipActive: {
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
  },
  selectorChipText: {
    color: mobileColors.textSecondary,
    fontWeight: "700",
  },
  selectorChipTextActive: {
    color: mobileColors.brand,
  },
  swapSectionList: {
    gap: 14,
  },
  swapDateSection: {
    gap: 8,
  },
  swapDateHeading: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
  swapOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  swapOptionName: {
    color: mobileColors.textPrimary,
    fontWeight: "800",
    flex: 1,
  },
  actionButtons: {
    gap: 10,
  },
});
