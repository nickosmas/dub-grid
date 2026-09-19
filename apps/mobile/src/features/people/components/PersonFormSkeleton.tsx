import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonGroup,
  SkeletonLine,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileRadii,
  mobileSpacing,
  type MobileColors,
  mobileSpace,
  mobileListRow,
} from "../../../shared/theme/tokens";

/** `ProfileTextInput`'s field height. */
const INPUT_HEIGHT = 48;

/**
 * The add/edit person form.
 *
 * A form, not a detail view — the generic detail skeleton it replaces drew a
 * hero and action buttons that this screen never renders. Sections carry the
 * real `ProfilePanel` frame with `fields` labelled inputs, or a wrapped chip
 * group where the form uses a choice picker.
 */
export function PersonFormSkeleton({
  sections = [2, 1],
  chipGroups = 2,
}: {
  /** Field count per form section, in order. */
  sections?: number[];
  /** Trailing assignment sections rendered as wrapped chips. */
  chipGroups?: number;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <SkeletonGroup style={styles.page}>
      {sections.map((fieldCount, sectionIndex) => (
        <View key={`form-section-${sectionIndex}`} style={styles.section}>
          <SkeletonLine style={styles.sectionTitle} variant="sectionTitle" width="30%" />
          <View style={styles.panel}>
            {skeletonRows(fieldCount, (fieldIndex) => (
              <View key={`form-field-${sectionIndex}-${fieldIndex}`} style={styles.field}>
                <SkeletonLine variant="caption" width="36%" />
                <SkeletonBlock height={INPUT_HEIGHT} radius={mobileRadii.control} />
              </View>
            ))}
          </View>
        </View>
      ))}
      {/* A choice group: its caption over a framed list of rows, each with
          the 22pt mark at its end, as ProfileChoiceGroup draws it. */}
      {skeletonRows(chipGroups, (index) => (
        <View key={`form-choice-group-${index}`} style={styles.section}>
          <SkeletonLine style={styles.sectionTitle} variant="sectionTitle" width="34%" />
          <View style={styles.field}>
            <SkeletonLine variant="caption" width="28%" />
            <View style={styles.list}>
              {skeletonRows(3, (row) => (
                <View
                  key={`form-choice-row-${index}-${row}`}
                  style={[styles.choiceRow, row < 2 && styles.rowDivider]}
                >
                  <SkeletonLine
                    variant="body"
                    width={row === 1 ? "58%" : "40%"}
                    style={styles.grow}
                  />
                  <SkeletonCircle size={22} />
                </View>
              ))}
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    page: {
      gap: mobileSpacing.sectionGap,
    },
    section: {
      gap: mobileSpace.md,
    },
    // Mirrors `ProfileSection`'s title: 16pt medium, inset from the card and
    // with room above it. A margin, not padding: `SkeletonLine` fixes its
    // height to the line, so padding would push the bar out of the box.
    sectionTitle: {
      paddingHorizontal: mobileSpace.lg,
      marginTop: mobileSpace.sm,
    },
    panel: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: 16,
      ...mobileElevation("card", isDark),
    },
    field: {
      gap: mobileSpace.sm,
    },
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
    },
    choiceRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: mobileListRow.minHeight,
      paddingHorizontal: 16,
      paddingVertical: mobileListRow.paddingVertical,
    },
    rowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    grow: {
      flex: 1,
    },
  });
