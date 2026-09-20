import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/**
 * The mark on a selected row, in every list that asks the user to choose one.
 *
 * A brand disc with a white tick, the same mark `ProfileChoiceGroup` and the
 * split-shift selector draw, so the organization switcher, the role sheet and
 * the filter sheets all say "chosen" the same way. A bare brand tick was tried
 * here and read lighter than the disc on the pickers beside it. Drawn as a
 * view rather than `checkmark-circle` because that glyph is spoken for:
 * `ToastProvider` and `StatusBanner` use it to mean success.
 */
export function SelectionCheck() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.disc}>
      <Ionicons color={mobileColors.onBrandText} name="checkmark" size={14} />
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    disc: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brand,
    },
  });
