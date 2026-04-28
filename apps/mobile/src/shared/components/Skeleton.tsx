import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { mobileColors, mobileRadii, mobileSpacing } from "../theme/tokens";

export function SkeletonBlock({
  height,
  width = "100%",
  radius = 14,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.block,
        {
          height,
          width,
          borderRadius: radius,
        },
        style,
      ]}
    />
  );
}

export function HeroSkeleton() {
  return (
    <View testID="hero-skeleton" style={styles.heroCard}>
      <SkeletonBlock height={16} width="34%" />
      <SkeletonBlock height={34} radius={18} />
      <SkeletonBlock height={16} width="48%" />
      <View style={styles.heroRow}>
        <SkeletonBlock height={44} radius={18} style={styles.heroButton} />
        <SkeletonBlock height={44} radius={18} style={styles.heroButton} />
      </View>
    </View>
  );
}

export function ListSkeleton({
  rows = 3,
  showSectionHeader = true,
}: {
  rows?: number;
  showSectionHeader?: boolean;
}) {
  return (
    <View testID="list-skeleton" style={styles.section}>
      {showSectionHeader ? (
        <View style={styles.sectionHeader}>
          <SkeletonBlock height={18} width="32%" />
          <SkeletonBlock height={14} width="20%" />
        </View>
      ) : null}
      {Array.from({ length: rows }).map((_, index) => (
        <View key={`skeleton-row-${index}`} style={styles.listCard}>
          <View style={styles.listRow}>
            <SkeletonBlock height={18} width="58%" />
            <SkeletonBlock height={28} width={84} radius={14} />
          </View>
          <SkeletonBlock height={15} width="76%" />
          <SkeletonBlock height={15} width="42%" />
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <View testID="detail-skeleton" style={styles.section}>
      <View style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <SkeletonBlock height={28} width="48%" />
          <SkeletonBlock height={56} width={64} radius={20} />
        </View>
        <SkeletonBlock height={16} width="56%" />
        <SkeletonBlock height={16} width="34%" />
        <View style={styles.detailActionRow}>
          <SkeletonBlock height={42} radius={18} style={styles.detailAction} />
          <SkeletonBlock height={42} radius={18} style={styles.detailAction} />
        </View>
      </View>
      {Array.from({ length: sections }).map((_, index) => (
        <View key={`detail-skeleton-${index}`} style={styles.detailSection}>
          <SkeletonBlock height={18} width="28%" />
          <View style={styles.detailListCard}>
            <SkeletonBlock height={16} width="44%" />
            <SkeletonBlock height={15} width="72%" />
            <SkeletonBlock height={15} width="38%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  section: {
    gap: mobileSpacing.sectionGap,
  },
  heroCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 20,
    gap: 14,
  },
  heroRow: {
    flexDirection: "row",
    gap: 10,
  },
  heroButton: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  listCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 18,
    gap: 12,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 20,
    gap: 14,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  detailAction: {
    flex: 1,
  },
  detailSection: {
    gap: 10,
  },
  detailListCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 18,
    gap: 12,
  },
});
