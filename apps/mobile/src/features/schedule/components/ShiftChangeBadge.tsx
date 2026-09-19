import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { Chip, type ChipTone } from "../../../shared/components/Chip";
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

const SHIFT_CHANGE_TONES: Record<ShiftChange["kind"], ChipTone> = {
  deleted: "danger",
  modified: "brand",
  new: "success",
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
 * the shift detail hero all draw it the same way. It is the shared `Chip`,
 * so it carries the same fill-only shape as every other tag on the page; a
 * bordered pill of its own beside a bordered split badge and a bordered role
 * pill was three boxes in three colours around one name. `inverse` is the
 * hero gradient's version, where a soft fill of its own would not read.
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

  const accessibilityLabel = `Shift ${label.toLowerCase()}`;

  if (!inverse) {
    return (
      <Chip accessibilityLabel={accessibilityLabel} tone={SHIFT_CHANGE_TONES[change.kind]}>
        {label}
      </Chip>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.badgeInverse}>
      <Text fit="compact" style={styles.textInverse}>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Matches `SplitShiftBadge` in the hero, which shares the same title slot.
    badgeInverse: {
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      backgroundColor: HERO_INVERSE_CHIP_FILL,
      borderColor: HERO_INVERSE_CHIP_BORDER,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    textInverse: {
      ...mobileText.badge,
      textTransform: "none",
      includeFontPadding: false,
      textAlignVertical: "center",
      color: mobileColors.textInverse,
    },
  });
