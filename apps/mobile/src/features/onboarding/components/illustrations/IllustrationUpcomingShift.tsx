import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileAvatarText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../../shared/theme/tokens";
import { IllustrationFrame } from "./illustration-primitives";

/**
 * The shift hero card that opens the Home tab, mirroring `MeHeroCard` in
 * `schedule/screens/ScheduleScreen.tsx`. Gradient, card fill, shadow and
 * collaborator strip colours are that card's own constants.
 */
const HERO_GRADIENT_LIGHT = ["#142579", "#2C49CC", "#6E90FF"] as const;
const HERO_GRADIENT_DARK = ["#0A1442", "#1D3AA0", "#2075FF"] as const;
const HERO_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;
const HERO_GRADIENT_START = { x: 0, y: 1 } as const;
const HERO_GRADIENT_END = { x: 1, y: 0 } as const;
const HERO_BACKGROUND_LIGHT = "#2946C7";
const HERO_BACKGROUND_DARK = "#152238";
const HERO_SHADOW_LIGHT = "rgba(37, 99, 235, 0.3)";
const HERO_SHADOW_DARK = "rgba(32, 117, 255, 0.28)";
const HERO_COLLABORATOR_BACKGROUND_LIGHT = "#3A55CB";
const HERO_COLLABORATOR_BACKGROUND_DARK = "#1E2F66";

/**
 * Avatar tones are seeded off the employee id in the real card, so these ids
 * (not the initials) are what fix each avatar's colour here too.
 */
const SHIFTMATES = [
  { id: "onboarding-shiftmate-1", initials: "BT" },
  { id: "onboarding-shiftmate-2", initials: "RC" },
  { id: "onboarding-shiftmate-3", initials: "RB" },
] as const;

export function IllustrationUpcomingShift() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const collaboratorBackground = {
    backgroundColor: isDark
      ? HERO_COLLABORATOR_BACKGROUND_DARK
      : HERO_COLLABORATOR_BACKGROUND_LIGHT,
  };

  return (
    <IllustrationFrame>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? HERO_BACKGROUND_DARK : HERO_BACKGROUND_LIGHT,
            shadowColor: isDark ? HERO_SHADOW_DARK : HERO_SHADOW_LIGHT,
          },
        ]}
      >
        <LinearGradient
          colors={isDark ? HERO_GRADIENT_DARK : HERO_GRADIENT_LIGHT}
          end={HERO_GRADIENT_END}
          locations={HERO_GRADIENT_LOCATIONS}
          start={HERO_GRADIENT_START}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>Upcoming</Text>
              </View>
              <Text style={styles.title}>Day Shift</Text>
            </View>
            <View style={styles.dateTile}>
              <Text style={styles.dateWeekday}>FRI</Text>
              <Text style={styles.dateDay}>15</Text>
            </View>
          </View>

          <View style={styles.areaRow}>
            <Ionicons color="rgba(255, 255, 255, 0.82)" name="location" size={18} />
            <Text style={styles.areaLabel}>Skilled Nursing</Text>
          </View>

          <View style={styles.scheduleRow}>
            <View style={styles.timeRow}>
              <Ionicons color="rgba(255, 255, 255, 0.82)" name="time" size={24} />
              <Text style={styles.timeText}>7:00 AM - 3:30 PM</Text>
            </View>
            <Text style={styles.progressLabel}>Starts in 2h</Text>
          </View>

          <View style={[styles.collaborators, collaboratorBackground]}>
            <View style={styles.collaboratorLabelRow}>
              <Ionicons color="rgba(255, 255, 255, 0.76)" name="people" size={22} />
              <Text style={styles.collaboratorLabel}>Working with</Text>
            </View>
            <View style={styles.avatarStack}>
              {SHIFTMATES.map((shiftmate, index) => {
                const avatarTone = getAvatarTone(shiftmate.id, isDark);

                return (
                  <View
                    key={shiftmate.id}
                    style={[
                      styles.avatarFrame,
                      collaboratorBackground,
                      index > 0 && styles.avatarFrameOverlap,
                    ]}
                  >
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: avatarTone.backgroundColor,
                          borderColor: avatarTone.borderColor,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.avatarText, { color: avatarTone.textColor }]}
                      >
                        {shiftmate.initials}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={[styles.avatarFrame, collaboratorBackground, styles.avatarFrameOverlap]}>
                <View style={styles.avatarOverflow}>
                  <Text style={styles.avatarOverflowText}>+2</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </IllustrationFrame>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    card: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 18,
      shadowOffset: {
        width: 0,
        height: 14,
      },
      shadowOpacity: 1,
      shadowRadius: 28,
      elevation: 5,
    },
    content: {
      gap: 11,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    badge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    badgeDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: "#BFDBFE",
    },
    badgeText: {
      ...mobileText.label,
      color: mobileColors.textInverse,
      textTransform: "uppercase",
    },
    title: {
      ...mobileText.heroMetric,
      flexShrink: 1,
      minWidth: 0,
      color: mobileColors.textInverse,
    },
    dateTile: {
      minWidth: 58,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.22)",
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    dateWeekday: {
      ...mobileText.label,
      color: "rgba(255, 255, 255, 0.72)",
    },
    dateDay: {
      ...mobileText.heroMetric,
      color: mobileColors.textInverse,
    },
    areaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 2,
    },
    areaLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
    },
    scheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 9,
      minWidth: 0,
    },
    timeText: {
      ...mobileText.sectionTitle,
      color: mobileColors.textInverse,
      flexShrink: 1,
    },
    progressLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.86)",
      flexShrink: 0,
    },
    collaborators: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.14)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginTop: 6,
      marginBottom: 6,
    },
    collaboratorLabelRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    collaboratorLabel: {
      ...mobileText.rowTitle,
      color: "rgba(255, 255, 255, 0.84)",
      flexShrink: 1,
    },
    avatarStack: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    avatarFrame: {
      width: 42,
      height: 42,
      borderRadius: 21,
      padding: 2,
    },
    avatarFrameOverlap: {
      marginLeft: -10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      ...mobileAvatarText(38),
    },
    avatarOverflow: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarOverflowText: {
      ...mobileText.bodyStrong,
      color: mobileColors.textMuted,
    },
  });
