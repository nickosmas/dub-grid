import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { HERO_INVERSE_CHIP_BORDER, HERO_INVERSE_CHIP_FILL } from "../lib/heroCardTheme";

type ShiftChange = NonNullable<MobileScheduleEntry["change"]>;

export const SHIFT_CHANGE_LABELS: Record<ShiftChange["kind"], string> = {
  deleted: "Deleted",
  modified: "Edited",
  new: "New",
};

/**
 * The status word for a published change, or null when there is nothing to
 * say: a raw `new` from a period's first publication is the baseline, not an
 * addition.
 */
export function getShiftChangeLabel(change: MobileScheduleEntry["change"]): string | null {
  return change && (change.kind !== "new" || change.isNewAddition)
    ? SHIFT_CHANGE_LABELS[change.kind]
    : null;
}

/**
 * The one change chip: Home's Your Week rows, the team tab's member rows and
 * the shift detail hero all draw it the same way. `inverse` is the hero
 * gradient's version, where a soft fill of its own would not read.
 */
export function ShiftChangeBadge({
  change,
  inverse = false,
}: {
  change: MobileScheduleEntry["change"];
  inverse?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const label = getShiftChangeLabel(change);

  if (!change || !label) {
    return null;
  }

  return (
    <View
      accessibilityLabel={`Shift ${label.toLowerCase()}`}
      style={[styles.badge, inverse ? styles.badgeInverse : styles[change.kind]]}
    >
      <Text style={[styles.text, inverse ? styles.textInverse : styles[`${change.kind}Text`]]}>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    new: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
    },
    modified: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
    },
    deleted: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
    },
    // Matches `SplitShiftBadge` in the hero, which shares the same title slot.
    badgeInverse: {
      backgroundColor: HERO_INVERSE_CHIP_FILL,
      borderColor: HERO_INVERSE_CHIP_BORDER,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    text: {
      ...mobileText.badge,
      textTransform: "none",
      includeFontPadding: false,
      textAlignVertical: "center",
    },
    newText: {
      color: mobileColors.successText,
    },
    modifiedText: {
      color: mobileColors.brand,
    },
    deletedText: {
      color: mobileColors.dangerText,
    },
    textInverse: {
      color: mobileColors.textInverse,
    },
  });
