import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { MobileScheduleIndicator } from "@dubgrid/contracts";
import { AppText } from "./AppText";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileText } from "../theme/tokens";
import {
  scheduleNoteLabel,
  scheduleNoteStateWords,
  scheduleNoteSwatchStyle,
  scheduleNotesSpokenLabel,
} from "../../features/schedule/lib/scheduleNotes";

const SWATCH_SIZE = 8;
// Centres the swatch on the name's first line once a long name wraps.
const SWATCH_OFFSET = ((mobileText.caption.lineHeight ?? SWATCH_SIZE) - SWATCH_SIZE) / 2;

/**
 * A shift's schedule notes, spelled out: each name after a small swatch in its
 * own colour, wrapping as needed. `inverse` sits on a filled card (the hero).
 * Renders nothing without notes.
 */
export function ScheduleNoteLabels({
  notes,
  inverse = false,
  style,
}: {
  notes: readonly MobileScheduleIndicator[];
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const ringColor = inverse ? mobileColors.textInverse : mobileColors.border;
  const styles = useMemo(() => createStyles(), []);
  if (notes.length === 0) return null;

  return (
    // One element for screen readers: a row reads a labelled child's label
    // and stops, so the names have to be in this one.
    <View
      accessible
      accessibilityLabel={scheduleNotesSpokenLabel(notes)}
      style={[styles.list, style]}
    >
      {notes.map((note) => {
        const words = scheduleNoteStateWords(note.state);
        return (
          <View
            key={`${note.indicatorTypeId}_${note.state}_${note.focusAreaId ?? "day"}`}
            style={styles.item}
            accessibilityLabel={scheduleNoteLabel(note)}
          >
            <View style={[styles.swatch, scheduleNoteSwatchStyle(note, ringColor)]} />
            <AppText variant="caption" tone={inverse ? "inverse" : "secondary"} style={styles.name}>
              {note.name}
              {words ? (
                <AppText variant="caption" tone={inverse ? "inverse" : "muted"}>
                  {` (${words})`}
                </AppText>
              ) : null}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    list: {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: mobileSpace.md,
      rowGap: mobileSpace.xs,
    },
    item: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.xs,
      flexShrink: 1,
    },
    name: {
      flexShrink: 1,
    },
    swatch: {
      marginTop: SWATCH_OFFSET,
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      borderRadius: mobileRadii.pill,
    },
  });
