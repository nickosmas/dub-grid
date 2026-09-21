import { useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "../../../../shared/components/Text";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../../shared/theme/tokens";

/**
 * The top of a simulated iPhone showing a live render of a real screen, cut
 * off below the feature the slide is about. The screen inside is laid out at
 * the device's own width and scaled down to fit the frame, so what a new user
 * is shown is the app as it will look on first launch: the same components,
 * in their theme, at their text size.
 *
 * Nothing here is pressable or announced: the frame sits inside the
 * onboarding pager, and the slide's own title and body carry the meaning.
 */

const BEZEL = 8;
const MAX_FRAME_WIDTH = 340;
// The proportions of the captures this replaced, kept so the slides' silhouette
// does not change.
const SCREEN_ASPECT = 933 / 804;
const BEZEL_LIGHT = "#0A0A0C";
// A near-black bezel disappears against the dark page, so it lightens there.
const BEZEL_DARK = "#3F3F46";
const FRAME_RADIUS = 44;
const SCREEN_RADIUS = FRAME_RADIUS - BEZEL;
// The status bar of an iPhone with the Dynamic Island, in points.
const STATUS_BAR_HEIGHT = 54;
const ISLAND_WIDTH = 126;
const ISLAND_HEIGHT = 37;
const ISLAND_TOP = 11;
const STATUS_BAR_INSET = 32;

export function OnboardingDeviceFrame({
  background,
  children,
}: {
  /** What the screen paints under everything, like `Screen`'s `pageBackground`. */
  background?: ReactNode;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, windowWidth - mobileSpace["2xl"] * 2);
  const screenWidth = frameWidth - BEZEL * 2;
  const screenHeight = Math.round(screenWidth * SCREEN_ASPECT);
  const scale = screenWidth / windowWidth;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.stage}
    >
      <View style={[styles.bezel, { width: frameWidth }]}>
        <View style={[styles.screen, { width: screenWidth, height: screenHeight }]}>
          {/* Laid out at full device width, then scaled from the top-left
              corner: a centred scale would pull the miniature up and left. */}
          <View
            style={[
              styles.device,
              { width: windowWidth, height: screenHeight / scale, transform: [{ scale }] },
            ]}
          >
            {background}
            {/* A scroll view like the real screens', not a plain column: a
                column of definite height is measured "at most", which
                collapses a flex-basis-0 text such as the open-shift title. */}
            <ScrollView
              contentContainerStyle={styles.belowStatusBar}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              style={styles.scroller}
            >
              {children}
            </ScrollView>
            {/* Last, so the island cuts through whatever the screen paints,
                as the hardware one does. */}
            <View style={styles.statusBar}>
              <Text fit="fixed" style={styles.statusBarTime}>
                9:41
              </Text>
              <View style={styles.island} />
              <View style={styles.statusBarIcons}>
                <Ionicons color={mobileColors.textPrimary} name="cellular" size={16} />
                <Ionicons color={mobileColors.textPrimary} name="wifi" size={16} />
                <Ionicons color={mobileColors.textPrimary} name="battery-full" size={20} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    stage: {
      alignSelf: "stretch",
      alignItems: "center",
      paddingTop: 12,
      paddingHorizontal: 8,
    },
    bezel: {
      paddingTop: BEZEL,
      paddingHorizontal: BEZEL,
      borderTopLeftRadius: FRAME_RADIUS,
      borderTopRightRadius: FRAME_RADIUS,
      backgroundColor: isDark ? BEZEL_DARK : BEZEL_LIGHT,
      ...mobileElevation("raised", isDark),
    },
    screen: {
      borderTopLeftRadius: SCREEN_RADIUS,
      borderTopRightRadius: SCREEN_RADIUS,
      backgroundColor: mobileColors.background,
      overflow: "hidden",
    },
    device: {
      transformOrigin: "top left",
      backgroundColor: mobileColors.background,
    },
    scroller: {
      flex: 1,
    },
    belowStatusBar: {
      paddingTop: STATUS_BAR_HEIGHT,
    },
    statusBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: STATUS_BAR_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: STATUS_BAR_INSET,
    },
    statusBarTime: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    statusBarIcons: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    island: {
      position: "absolute",
      top: ISLAND_TOP,
      left: "50%",
      marginLeft: -ISLAND_WIDTH / 2,
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
      borderRadius: ISLAND_HEIGHT / 2,
      backgroundColor: BEZEL_LIGHT,
    },
  });
