import { Fragment, useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MobileScheduleIndicator } from "@dubgrid/contracts";
import { AppText, type TextVariant } from "./AppText";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, mobileText } from "../theme/tokens";
import {
  scheduleNoteStateWords,
  scheduleNotesSpokenLabel,
} from "../../features/schedule/lib/scheduleNotes";

const ICON_SIZE = 14;

type NoteTextVariant = Extract<TextVariant, "caption" | "body" | "rowTitle">;

/**
 * A shift's schedule notes, spelled out: one sticky-note icon, then the names
 * as a comma-separated list, wrapping as needed. `inverse` sits on a filled
 * card (the hero). A row that already leads with its own icon turns this one
 * off and sets the text size to match. Renders nothing without notes.
 */
export function ScheduleNoteLabels({
  notes,
  inverse = false,
  showIcon = true,
  textVariant = "caption",
  style,
}: {
  notes: readonly MobileScheduleIndicator[];
  inverse?: boolean;
  showIcon?: boolean;
  textVariant?: NoteTextVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const iconColor = inverse ? mobileColors.textInverse : mobileColors.textMuted;
  const styles = useMemo(() => createStyles(textVariant), [textVariant]);
  if (notes.length === 0) return null;

  return (
    // One element for screen readers, with every name in its label.
    <View
      accessible
      accessibilityLabel={scheduleNotesSpokenLabel(notes)}
      style={[styles.row, style]}
    >
      {showIcon ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={iconColor}
          importantForAccessibility="no-hide-descendants"
          name="note-outline"
          size={ICON_SIZE}
          style={styles.icon}
        />
      ) : null}
      <AppText variant={textVariant} tone={inverse ? "inverse" : "secondary"} style={styles.names}>
        {notes.map((note, index) => {
          const words = scheduleNoteStateWords(note.state);
          return (
            <Fragment key={`${note.indicatorTypeId}_${note.state}_${note.focusAreaId ?? "day"}`}>
              {index > 0 ? ", " : null}
              {note.name}
              {words ? (
                <AppText variant={textVariant} tone={inverse ? "inverse" : "muted"}>
                  {` (${words})`}
                </AppText>
              ) : null}
            </Fragment>
          );
        })}
      </AppText>
    </View>
  );
}

const createStyles = (textVariant: NoteTextVariant) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.xs,
    },
    names: {
      flexShrink: 1,
    },
    // Centres the icon on the first line once the list wraps.
    icon: {
      marginTop: Math.max(((mobileText[textVariant].lineHeight ?? ICON_SIZE) - ICON_SIZE) / 2, 0),
    },
  });
