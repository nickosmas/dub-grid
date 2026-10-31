import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/** A Material 3 checkbox, for a pick-many list on Android. */
export function SelectionCheckbox({ checked }: { checked: boolean }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked ? <Ionicons color={mobileColors.onBrandText} name="checkmark" size={16} /> : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    box: {
      width: 18,
      height: 18,
      borderRadius: 2,
      borderWidth: 2,
      borderColor: mobileColors.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    boxChecked: {
      backgroundColor: mobileColors.brand,
      borderColor: mobileColors.brand,
    },
  });
