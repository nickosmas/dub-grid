import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";
import { CountBadge } from "./CountBadge";
import { ExpandableList } from "./ExpandableList";
import { PeriodToggle } from "./PeriodToggle";

export function CoverageBySectionCard({
  sections,
  periodMode,
  onPeriodModeChange,
}: {
  sections: MobileDashboardResponse["coverageBySection"];
  periodMode: DashboardPeriodMode;
  onPeriodModeChange: (mode: DashboardPeriodMode) => void;
}) {
  const totalOpenSlots = sections.reduce((sum, section) => sum + section.openSlots, 0);

  return (
    <Card
      title="Coverage gaps"
      icon="alert-circle-outline"
      iconTone="warning"
      headerAccessory={
        sections.length > 0 ? <CountBadge label={`${totalOpenSlots} open`} tone="warning" /> : undefined
      }
      detail={
        <View style={styles.wrapper}>
          <PeriodToggle mode={periodMode} onChange={onPeriodModeChange} />
          {sections.length > 0 ? (
            <ExpandableList
              title="Coverage gaps"
              items={sections}
              keyExtractor={(section) => String(section.focusAreaId)}
              renderItem={(section) => (
                <View style={styles.row}>
                  <Text style={styles.label}>{section.focusAreaName}</Text>
                  <CountBadge
                    label={`${section.openSlots} ${section.openSlots === 1 ? "slot" : "slots"}`}
                    tone="warning"
                  />
                </View>
              )}
            />
          ) : (
            <EmptyStateCard
              compact
              iconName="checkmark-circle-outline"
              title="No coverage gaps right now"
            />
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...mobileText.body,
    color: mobileColors.textPrimary,
  },
});
