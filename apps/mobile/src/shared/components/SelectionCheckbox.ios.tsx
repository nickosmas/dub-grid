import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/**
 * The pick-many mark in an iOS list, as the system's edit-mode selection
 * draws it: an empty ring on every row, filled with the tint and a white
 * checkmark once chosen, so each chosen row stands out from the rest (owner,
 * 2026-10-31).
 */
export function SelectionCheckbox({ checked }: { checked: boolean }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={[styles.ring, checked && styles.ringChecked]}>
      {checked ? <Ionicons color={mobileColors.onBrandText} name="checkmark" size={15} /> : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    ring: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: mobileColors.textSubtle,
      alignItems: "center",
      justifyContent: "center",
    },
    ringChecked: {
      borderColor: mobileColors.brand,
      backgroundColor: mobileColors.brand,
    },
  });
