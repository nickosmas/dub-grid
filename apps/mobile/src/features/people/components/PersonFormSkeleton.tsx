import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  SkeletonBlock,
  SkeletonGroup,
  SkeletonLine,
  SkeletonPill,
  skeletonRows,
} from "../../../shared/components/skeleton";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpacing, type MobileColors } from "../../../shared/theme/tokens";

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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <SkeletonGroup style={styles.page}>
      {sections.map((fieldCount, sectionIndex) => (
        <View key={`form-section-${sectionIndex}`} style={styles.section}>
          <SkeletonLine variant="label" width="30%" />
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
      {skeletonRows(chipGroups, (index) => (
        <View key={`form-chip-group-${index}`} style={styles.section}>
          <SkeletonLine variant="label" width="34%" />
          <View style={styles.panel}>
            <SkeletonLine variant="caption" width="28%" />
            <View style={styles.chipRow}>
              <SkeletonPill height={36} width={96} />
              <SkeletonPill height={36} width={124} />
              <SkeletonPill height={36} width={82} />
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      gap: mobileSpacing.sectionGap,
    },
    section: {
      gap: 10,
    },
    panel: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 14,
      padding: 16,
    },
    field: {
      gap: 7,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
  });
