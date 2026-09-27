import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MobileScheduleIndicator } from "@dubgrid/contracts";
import { AppText, type TextVariant } from "./AppText";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, mobileText } from "../theme/tokens";
import {
  scheduleNoteLabel,
  scheduleNoteStateWords,
  scheduleNoteIconName,
  scheduleNotesSpokenLabel,
} from "../../features/schedule/lib/scheduleNotes";

const ICON_SIZE = 14;
// Centres the icon on the name's first line once a long name wraps.
const ICON_OFFSET = Math.max(((mobileText.caption.lineHeight ?? ICON_SIZE) - ICON_SIZE) / 2, 0);

/**
 * A shift's schedule notes, spelled out: each name after a sticky-note icon,
 * wrapping as needed. `inverse` sits on a filled card (the hero). A row that
 * already leads with one sticky-note icon turns the per-name icons off and
 * sets the text size to match its own. Renders nothing without notes.
 */
export function ScheduleNoteLabels({
  notes,
  inverse = false,
  showIcons = true,
  textVariant = "caption",
  style,
}: {
  notes: readonly MobileScheduleIndicator[];
  inverse?: boolean;
  showIcons?: boolean;
  textVariant?: Extract<TextVariant, "caption" | "body" | "rowTitle">;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const iconColor = inverse ? mobileColors.textInverse : mobileColors.textMuted;
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
            {showIcons ? (
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={iconColor}
                importantForAccessibility="no-hide-descendants"
                name={scheduleNoteIconName(note.state)}
                size={ICON_SIZE}
                style={styles.icon}
              />
            ) : null}
            <AppText
              variant={textVariant}
              tone={inverse ? "inverse" : "secondary"}
              style={styles.name}
            >
              {note.name}
              {words ? (
                <AppText variant={textVariant} tone={inverse ? "inverse" : "muted"}>
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
    icon: {
      marginTop: ICON_OFFSET,
    },
  });
