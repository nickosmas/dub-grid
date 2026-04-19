import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { Button } from "../../../shared/components/Button";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { Card, Screen } from "../../../shared/components/Screen";
import {
  createShiftRequest,
  getMySchedule,
  getOrgSchedule,
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
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryCategoryKey,
  getScheduleEntryTimeRange,
  sortScheduleEntries,
} from "../lib/schedule";

type RequestMode = "coverage" | "swap" | null;
type CoverageRequestType = "pickup" | "calloff" | null;
type ShiftTimeRange = {
  start: string;
  end: string;
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
        leftRange.start < rightRange.end &&
        rightRange.start < leftRange.end,
    ),
  );
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
  const focusAreaLabel =
    bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Area";
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
  const shiftmates = useMemo(() => {
    if (!shiftEntry) {
      return [];
    }

    const activeCategoryKey = getScheduleEntryCategoryKey(shiftEntry);

    return sortScheduleEntries(
      (teamScheduleQuery.data?.entries ?? []).filter((entry) => {
        return (
          entry.date === shiftEntry.date &&
          entry.employeeId !== shiftEntry.employeeId &&
          getScheduleEntryCategoryKey(entry) === activeCategoryKey
        );
      }),
    );
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
        entry.absenceTypeId != null ||
        entry.shiftCodeIds.length === 0
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
  }, [linkedEmployeeId, scheduleEntries, shiftEntry, teamScheduleQuery.data?.entries]);
  const swapSections = useMemo(
    () => buildScheduleSections(swapTargetOptions, "team", timeZone),
    [swapTargetOptions, timeZone],
  );
  const selectedTargetEntry =
    selectedTargetShift == null
      ? null
      : swapTargetOptions.find((entry) => {
          return (
            entry.employeeId === selectedTargetShift.employeeId &&
            entry.date === selectedTargetShift.date
          );
        }) ?? null;
  const canCreateRequestsForShift = Boolean(
    shiftEntry &&
    linkedEmployeeId &&
    shiftEntry.employeeId === linkedEmployeeId &&
    shiftEntry.publishedAt != null &&
    shiftEntry.absenceTypeId == null &&
    shiftEntry.shiftCodeIds.length > 0,
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
  const shouldShowEmployeeSummary = Boolean(
    shiftEntry && shiftEntry.employeeId !== linkedEmployeeId,
  );
  const shouldShowShiftmates = Boolean(
    canViewTeamSchedule && shiftEntry && shiftEntry.absenceTypeId == null,
  );
  const activeAbsenceTypes = absenceTypes.filter(
    (absenceType) => !absenceType.archivedAt,
  );

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

    const shiftLabel = shiftEntry.shiftName;
    const shiftDateLabel = formatShiftDate(shiftEntry.date);

    Alert.alert(
      type === "pickup" ? "Offer shift for pickup?" : "Submit call off request?",
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
          onPress: () =>
            submitCoverageRequest(type, options?.absenceTypeId),
        },
      ],
      { cancelable: true },
    );
  }

  function handleSubmitRequest() {
    if (!shiftEntry || !selectedTargetShift || !selectedTargetEntry) {
      return;
    }

    const requesterLabel = shiftEntry.shiftName;
    const targetLabel = selectedTargetEntry.shiftName;

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
        teamScheduleQuery.isFetching
      }
      onRefresh={() => {
        void Promise.all([
          bootstrapQuery.refetch(),
          myScheduleQuery.refetch(),
          teamScheduleQuery.refetch(),
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
            title={hasMultipleSegments ? "Shifts" : shiftEntry.shiftName}
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
                {!shouldShowEmployeeSummary && !hasMultipleSegments && timeRange ? (
                  <Text style={styles.detailSummaryText}>{timeRange}</Text>
                ) : null}
                {hasMultipleSegments ? (
                  <ShiftEntrySegmentList entry={shiftEntry} variant="detail" />
                ) : null}
                {!hasMultipleSegments && shiftEntry.displayFocusAreaName ? (
                  <DetailRow
                    label={focusAreaLabel}
                    value={shiftEntry.displayFocusAreaName}
                  />
                ) : null}
                {shiftEntry.publishedByName ? (
                  <DetailRow
                    label="Published by"
                    value={shiftEntry.publishedByName}
                  />
                ) : null}
                {publishedAtLabel ? (
                  <DetailRow label="Published at" value={publishedAtLabel} />
                ) : null}
              </View>
            }
          />

          {shouldShowShiftmates ? (
            <Card
              title="Shiftmates"
              body={
                teamScheduleQuery.isLoading
                  ? "Loading other teammates in this shift category."
                  : teamScheduleQuery.error
                    ? getQueryErrorMessage(
                        teamScheduleQuery.error,
                        "We couldn't load shiftmates right now.",
                      )
                    : shiftmates.length === 0
                      ? "No other shiftmates are assigned in this shift category."
                      : undefined
              }
              detail={
                !teamScheduleQuery.isLoading &&
                !teamScheduleQuery.error &&
                shiftmates.length > 0 ? (
                  <View style={styles.shiftmatesList}>
                    {shiftmates.map((entry) => (
                      <ShiftmateCard
                        key={`${entry.employeeId}-${entry.date}`}
                        entry={entry}
                      />
                    ))}
                  </View>
                ) : undefined
              }
            />
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
                      No eligible teammate shifts are available in this
                      schedule range yet.
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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

function ShiftmateCard({ entry }: { entry: MobileScheduleEntry }) {
  return (
    <View style={styles.shiftmateCard}>
      <Text style={styles.shiftmateName}>{entry.employeeName}</Text>
      <ShiftEntrySegmentList entry={entry} variant="supporting" />
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

  return (
    <View style={styles.swapSummaryCard}>
      <Text style={styles.swapSummaryLabel}>{label}</Text>
      <Text style={styles.swapSummaryTitle}>{entry.shiftName}</Text>
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
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  detailValue: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  detailSummaryText: {
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
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
  shiftmatesList: {
    gap: 10,
  },
  shiftmateCard: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderRadius: mobileRadii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  shiftmateName: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
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
