import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Card } from "../../../shared/components/Screen";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors, mobileSpace } from "../../../shared/theme/tokens";
import { CountBadge } from "./CountBadge";

export type DraftSummary = NonNullable<MobileDashboardResponse["metrics"]["draftSummary"]>;

const DRAFT_CHANGE_TYPES: Array<{ key: keyof Omit<DraftSummary, "total">; label: string }> = [
  { key: "newCount", label: "new" },
  { key: "modifiedCount", label: "modified" },
  { key: "deletedCount", label: "deleted" },
];

function formatChangeLabel(count: number, label: string): string {
  return `${count} ${label} change${count === 1 ? "" : "s"}`;
}

export function DraftSummaryCard({ summary }: { summary: DraftSummary }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const changes = DRAFT_CHANGE_TYPES.filter(({ key }) => summary[key] > 0);

  if (summary.total === 0 || changes.length === 0) return null;

  return (
    <Card
      title="Unpublished changes"
      headerAccessory={<CountBadge label={String(summary.total)} tone="warning" />}
      detail={
        <View style={styles.detail}>
          <Text style={styles.description}>These schedule changes are not published yet.</Text>
          <View style={styles.rows}>
            {changes.map(({ key, label }) => (
              <View key={key} style={styles.row}>
                <Text style={styles.label}>{formatChangeLabel(summary[key], label)}</Text>
              </View>
            ))}
          </View>
        </View>
      }
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    detail: {
      gap: 12,
    },
    description: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    rows: {
      gap: 8,
    },
    row: {
      borderLeftWidth: 2,
      borderLeftColor: mobileColors.warningBorder,
      paddingLeft: mobileSpace.md,
    },
    label: {
      ...mobileText.label,
      color: mobileColors.textPrimary,
    },
  });
