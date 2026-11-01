import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { FitText } from "../../../shared/components/FitText";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Text } from "../../../shared/components/Text";
import { IS_ANDROID_LIST } from "../../../shared/lib/native-list";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * One group of request cards under its header: a day in Available, or what
 * the requests wait on in Approval. A count, when given, trails the header
 * the way Settings shows a value, rather than as a badge.
 */
export function RequestListSection({
  title,
  accessibilityLabel,
  count,
  children,
}: {
  title: string;
  accessibilityLabel?: string;
  count?: number;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="header"
          style={[styles.title, IS_ANDROID_LIST && styles.titleAndroid]}
        >
          {title}
        </Text>
        {count != null ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A list's own action, such as Load more: a tinted text row in a card of its own. */
export function RequestListActionRow({
  label,
  loading = false,
  onPress,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void | Promise<unknown>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.actionCard}>
      <PressableRow
        accessibilityLabel={label}
        disabled={loading}
        onPress={onPress}
        style={styles.actionRow}
      >
        {loading ? <ActivityIndicator color={mobileColors.brand} size="small" /> : null}
        <FitText ellipsizeMode="tail" style={styles.actionLabel}>
          {label}
        </FitText>
      </PressableRow>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    section: {
      gap: mobileSpace.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.lg,
      paddingTop: mobileSpace.sm,
    },
    title: {
      ...mobileTextWeighted("sectionTitle", "semibold"),
      flex: 1,
      minWidth: 0,
      color: mobileColors.textPrimary,
    },
    // Material 3: a list subheader in the brand colour.
    titleAndroid: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.brand,
    },
    count: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    actionCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileListRow.paddingVertical,
    },
    actionLabel: {
      ...mobileTextWeighted("rowTitle", "regular"),
      color: mobileColors.brand,
    },
  });
