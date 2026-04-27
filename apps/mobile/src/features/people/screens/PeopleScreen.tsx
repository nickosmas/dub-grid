import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import {
  getPeople,
  updateMobilePersonStatus,
} from "../../../shared/lib/api";
import {
  getMobileQueryContentState,
  getQueryErrorMessage,
} from "../../../shared/lib/query-state";
import { mobileColors, mobileRadii } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";

type StatusFilter = "all" | "active" | "inactive";

function formatStatusSinceLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return `Status updated ${new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function PeopleScreen() {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const peopleQuery = useQuery({
    queryKey: ["mobile", "people", accessToken],
    queryFn: () => getPeople(accessToken!),
    enabled: Boolean(accessToken),
  });
  const statusMutation = useMutation({
    mutationFn: async (input: {
      personId: string;
      action: "bench" | "activate";
      expectedVersion: number;
    }) =>
      updateMobilePersonStatus(accessToken!, input.personId, {
        action: input.action,
        expectedVersion: input.expectedVersion,
      }),
    onSuccess: async () => {
      await peopleQuery.refetch();
    },
  });

  const focusAreaMap = useMemo(
    () =>
      new Map(
        (bootstrapQuery.data?.focusAreas ?? []).map((focusArea) => [
          focusArea.id,
          focusArea.name,
        ]),
      ),
    [bootstrapQuery.data?.focusAreas],
  );
  const people = peopleQuery.data?.people ?? [];
  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return people.filter((person) => {
      const fullName = `${person.firstName} ${person.lastName}`
        .trim()
        .toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        person.email.toLowerCase().includes(normalizedSearch) ||
        person.phone.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? person.status === "active"
            : person.status !== "active";

      return matchesSearch && matchesStatus;
    });
  }, [people, searchValue, statusFilter]);
  const canManageEmployees = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const contentState = getMobileQueryContentState({
    hasData: peopleQuery.data !== undefined,
    isLoading: peopleQuery.isLoading || bootstrapQuery.isLoading,
    error: peopleQuery.error ?? bootstrapQuery.error,
  });
  const mutationError = statusMutation.error
    ? getQueryErrorMessage(
        statusMutation.error,
        "We couldn't update that teammate right now.",
      )
    : null;
  const activeCount = people.filter((person) => person.status === "active").length;
  const inactiveCount = people.length - activeCount;

  return (
    <Screen
      title="People"
      subtitle="People"
      refreshing={peopleQuery.isFetching || statusMutation.isPending}
      onRefresh={() => {
        void Promise.all([peopleQuery.refetch(), bootstrapQuery.refetch()]);
      }}
    >
      <View style={styles.searchCard}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchValue}
          placeholder="Search people"
          placeholderTextColor={mobileColors.textSubtle}
          style={styles.searchInput}
          value={searchValue}
        />
        <View style={styles.filterRow}>
          <FilterChip
            active={statusFilter === "all"}
            label={`All ${people.length}`}
            onPress={() => setStatusFilter("all")}
          />
          <FilterChip
            active={statusFilter === "active"}
            label={`Active ${activeCount}`}
            onPress={() => setStatusFilter("active")}
          />
          <FilterChip
            active={statusFilter === "inactive"}
            label={`Inactive ${inactiveCount}`}
            onPress={() => setStatusFilter("inactive")}
          />
        </View>
        <Text style={styles.searchSummary}>
          {filteredPeople.length} teammate
          {filteredPeople.length === 1 ? "" : "s"}
        </Text>
      </View>

      {mutationError ? (
        <QueryStateCard
          title="Could not update teammate"
          body={mutationError}
          actionLabel="Refresh"
          onAction={() => {
            void peopleQuery.refetch();
          }}
        />
      ) : null}

      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading directory"
          body="Pulling the latest staff list for mobile lookup."
        />
      ) : contentState.kind === "error" &&
        contentState.message === "Unauthorized" ? (
        <Card
          title="Directory unavailable"
          body="Your current role does not include mobile staff visibility for this workspace."
        />
      ) : contentState.kind === "error" ? (
        <QueryStateCard
          title="Could not load people"
          body={contentState.message}
          actionLabel="Try Again"
          onAction={() => {
            void peopleQuery.refetch();
          }}
        />
      ) : people.length === 0 ? (
        <Card
          title="No teammates yet"
          body="No teammates are available in this workspace yet."
        />
      ) : filteredPeople.length === 0 ? (
        <Card
          title="No matches"
          body="Try a different name, email, phone number, or status filter."
        />
      ) : (
        filteredPeople.map((person) => {
          const isExpanded = expandedPersonId === person.id;
          const hasStatusNote = person.statusNote.trim().length > 0;
          const hasContactNotes = person.contactNotes.trim().length > 0;
          const canShowManagerAction =
            canManageEmployees && person.status !== "terminated";
          const hasExpandableDetails =
            hasStatusNote || hasContactNotes || canShowManagerAction;
          const focusAreas = person.focusAreaIds
            .map((focusAreaId) => focusAreaMap.get(focusAreaId) ?? null)
            .filter((value): value is string => Boolean(value));
          const statusSince = formatStatusSinceLabel(person.statusChangedAt);

          return (
            <View key={person.id} style={styles.personCard}>
              <View style={styles.personHeader}>
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>
                    {`${person.firstName} ${person.lastName}`.trim()}
                  </Text>
                  <Text style={styles.personMeta}>
                    {person.email || "No email on file"}
                  </Text>
                  <Text style={styles.personMeta}>
                    {person.phone || "No phone on file"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    person.status === "active" && styles.statusChipActive,
                    person.status === "benched" && styles.statusChipBenched,
                    person.status === "terminated" && styles.statusChipTerminated,
                  ]}
                >
                  <Text style={styles.statusChipText}>{person.status}</Text>
                </View>
              </View>

              {focusAreas.length > 0 ? (
                <Text style={styles.detailText}>
                  Focus areas: {focusAreas.join(", ")}
                </Text>
              ) : null}
              {statusSince ? (
                <Text style={styles.detailText}>{statusSince}</Text>
              ) : null}

              <View style={styles.actionsRow}>
                <Button
                  compact
                  disabled={!person.phone}
                  label="Call"
                  onPress={() => {
                    if (person.phone) {
                      void Linking.openURL(`tel:${person.phone}`);
                    }
                  }}
                />
                <Button
                  compact
                  disabled={!person.email}
                  label="Email"
                  onPress={() => {
                    if (person.email) {
                      void Linking.openURL(`mailto:${person.email}`);
                    }
                  }}
                  tone="secondary"
                />
                {hasExpandableDetails ? (
                  <Button
                    compact
                    label={isExpanded ? "Hide" : "Details"}
                    onPress={() => {
                      setExpandedPersonId((current) =>
                        current === person.id ? null : person.id,
                      );
                    }}
                    tone="neutral"
                  />
                ) : null}
              </View>

              {isExpanded && hasExpandableDetails ? (
                <View style={styles.expandedPanel}>
                  {hasStatusNote ? (
                    <DetailRow label="Status note" value={person.statusNote} />
                  ) : null}
                  {hasContactNotes ? (
                    <DetailRow
                      label="Contact notes"
                      value={person.contactNotes}
                    />
                  ) : null}

                  {canShowManagerAction ? (
                    <View style={styles.managerActions}>
                      {person.status === "active" ? (
                        <Button
                          compact
                          disabled={statusMutation.isPending}
                          label={
                            statusMutation.isPending
                              ? "Updating..."
                              : "Bench"
                          }
                          onPress={() => {
                            statusMutation.mutate({
                              personId: person.id,
                              action: "bench",
                              expectedVersion: person.version,
                            });
                          }}
                          tone="danger"
                        />
                      ) : (
                        <Button
                          compact
                          disabled={statusMutation.isPending}
                          label={
                            statusMutation.isPending
                              ? "Updating..."
                              : "Activate"
                          }
                          onPress={() => {
                            statusMutation.mutate({
                              personId: person.id,
                              action: "activate",
                              expectedVersion: person.version,
                            });
                          }}
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

function FilterChip({
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
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
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

const styles = StyleSheet.create({
  searchCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: mobileColors.textPrimary,
    backgroundColor: mobileColors.surfaceSecondary,
    fontSize: 16,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  filterChipActive: {
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  filterChipText: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: mobileColors.textInverse,
  },
  searchSummary: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  personCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  personHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  personCopy: {
    flex: 1,
    gap: 4,
  },
  personName: {
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  personMeta: {
    color: mobileColors.textMuted,
    lineHeight: 20,
  },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: mobileRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusChipActive: {
    backgroundColor: mobileColors.successSoft,
  },
  statusChipBenched: {
    backgroundColor: mobileColors.warningSoft,
  },
  statusChipTerminated: {
    backgroundColor: mobileColors.dangerSoft,
  },
  statusChipText: {
    color: mobileColors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  detailText: {
    color: mobileColors.textSecondary,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  expandedPanel: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  detailValue: {
    color: mobileColors.textSecondary,
    lineHeight: 20,
  },
  managerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
});
