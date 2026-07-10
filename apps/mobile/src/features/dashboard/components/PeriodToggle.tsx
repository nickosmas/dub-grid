import { Pressable, StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";
import type { DashboardPeriodMode } from "../../../shared/lib/dates";

const OPTIONS: Array<{ mode: DashboardPeriodMode; label: string }> = [
  { mode: "week", label: "1 Week" },
  { mode: "2weeks", label: "2 Weeks" },
];

export function PeriodToggle({
  mode,
  onChange,
}: {
  mode: DashboardPeriodMode;
  onChange: (mode: DashboardPeriodMode) => void;
}) {
  return (
    <View style={styles.track}>
      {OPTIONS.map((option) => {
        const selected = option.mode === mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="button"
            accessibilityState={{ selected }}
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

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: mobileColors.surfaceSecondary,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  },
});
