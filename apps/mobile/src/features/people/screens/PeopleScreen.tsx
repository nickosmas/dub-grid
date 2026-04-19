import { useMemo, useState } from "react";
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../shared/components/Button";
import { Card, Screen } from "../../../shared/components/Screen";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import { getPeople } from "../../../shared/lib/api";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import {
  mobileColors,
  mobileRadii,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";

export default function PeopleScreen() {
  const accessToken = useAccessToken();
  const [searchValue, setSearchValue] = useState("");
  const peopleQuery = useQuery({
    queryKey: ["mobile", "people", accessToken],
    queryFn: () => getPeople(accessToken!),
    enabled: Boolean(accessToken),
  });
  const people = peopleQuery.data?.people ?? [];
  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    if (!normalizedSearch) {
      return people;
    }

    return people.filter((person) => {
      const fullName = `${person.firstName} ${person.lastName}`
        .trim()
        .toLowerCase();
      return (
        fullName.includes(normalizedSearch) ||
        person.email.toLowerCase().includes(normalizedSearch) ||
        person.phone.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [people, searchValue]);
  const contentState = getMobileQueryContentState({
    hasData: people.length > 0,
    isLoading: peopleQuery.isLoading,
    error: peopleQuery.error,
  });

  return (
    <Screen
      title="People"
      subtitle="People"
      refreshing={peopleQuery.isFetching}
      onRefresh={() => {
        void peopleQuery.refetch();
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
        <Text style={styles.searchSummary}>
          {filteredPeople.length} teammate
          {filteredPeople.length === 1 ? "" : "s"}
        </Text>
      </View>

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
      ) : contentState.kind === "empty" ? (
        <Card
          title="Directory unavailable"
          body="If you do not have staff visibility, this screen will stay empty."
        />
      ) : filteredPeople.length === 0 ? (
        <Card
          title="No matches"
          body="Try a different name, email, or phone number."
        />
      ) : (
        filteredPeople.map((person) => (
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
            </View>
          </View>
        ))
      )}
    </Screen>
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
  searchSummary: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  personCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    padding: 16,
    gap: 14,
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
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
});
