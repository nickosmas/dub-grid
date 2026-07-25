import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";

const OPTIONS: Array<{ mode: DashboardPeriodMode; label: string }> = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "2weeks", label: "2 Weeks" },
];

export function PeriodToggle({
  mode,
  onChange,
  loading = false,
}: {
  mode: DashboardPeriodMode;
  onChange: (mode: DashboardPeriodMode) => void;
  loading?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={[styles.track, loading ? styles.trackLoading : null]}>
      {OPTIONS.map((option) => {
        const selected = option.mode === mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: loading }}
            disabled={loading}
            hitSlop={4}
            onPress={() => onChange(option.mode)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.segmentLabel, selected ? styles.segmentLabelSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    track: {
      flexDirection: "row",
      alignSelf: "flex-start",
      backgroundColor: mobileColors.surfaceSecondary,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 2,
    },
    trackLoading: {
      opacity: 0.5,
    },
    segment: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
    },
    segmentSelected: {
      backgroundColor: mobileColors.brand,
    },
    segmentLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    segmentLabelSelected: {
      color: mobileColors.textInverse,
      fontWeight: "700",
    },
  });
