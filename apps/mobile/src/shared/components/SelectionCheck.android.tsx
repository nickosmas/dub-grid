import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/** A Material 3 radio button: an outlined ring, with a dot when chosen. */
export function SelectionCheck({ selected = true }: { selected?: boolean }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={[styles.ring, selected && styles.ringSelected]}>
      {selected ? <View style={styles.dot} /> : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    ring: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: mobileColors.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    ringSelected: {
      borderColor: mobileColors.brand,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: mobileColors.brand,
    },
  });
