import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, type MobileColors } from "../../../shared/theme/tokens";

/**
 * A single alert.
 *
 * Mirrors the detail screen's own shape: a 44pt round icon beside a priority
 * chip, the title and timestamp, the message body, then the metadata card and
 * its action pills.
 */
export function NotificationDetailSkeleton({
  messageLines = 4,
  metadataRows = 3,
}: {
  messageLines?: number;
  metadataRows?: number;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.container}>
      <View style={styles.header}>
        <SkeletonCircle size={44} />
        <SkeletonPill height={24} width={72} />
      </View>
      <SkeletonLine variant="screenTitle" width="78%" />
      <SkeletonLine variant="caption" width="34%" />
      <View style={styles.message}>
        {skeletonRows(messageLines, (index) => (
          <SkeletonLine
            key={`alert-message-${index}`}
            variant="body"
            // The last line of a paragraph runs short.
            width={index === messageLines - 1 ? "48%" : "100%"}
          />
        ))}
      </View>
      <View style={styles.metadataCard}>
        {skeletonRows(metadataRows, (index) => (
          <View key={`alert-metadata-${index}`} style={styles.metadataRow}>
            <SkeletonLine variant="caption" width="32%" />
            <SkeletonLine variant="caption" width="42%" />
          </View>
        ))}
      </View>
      <View style={styles.actionsRow}>
        <SkeletonBlock height={40} radius={mobileRadii.control} width={128} />
        <SkeletonBlock height={40} radius={mobileRadii.control} width={104} />
      </View>
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    container: {
      gap: 14,
      paddingBottom: 24,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    message: {
      // `message` sets an explicit 22pt line height rather than the body
      // token's 21, so the lines get their own container gap here.
      gap: 1,
    },
    metadataCard: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    metadataRow: {
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
  });
