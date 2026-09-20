import { useMemo } from "react";
import {
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { useIsDarkMode } from "../../../../shared/providers/ThemeModeProvider";
import { mobileElevation, mobileSpace } from "../../../../shared/theme/tokens";

/**
 * The top of a simulated iPhone showing a still of a real screen, cut off
 * below the feature the slide is about. Each still is a capture of the app
 * in that theme (`assets/images/onboarding`), so what a new user is shown is
 * what they get on first launch.
 *
 * Nothing here is pressable or announced: the frame sits inside the
 * onboarding pager, and the slide's own title and body carry the meaning.
 */

/**
 * iPhone 17 Pro captures (402pt wide), stored at 2x. The frame is at most
 * 340pt wide, so a 3x still only costs bundle bytes. PNG rather than JPEG:
 * vitest's CommonJS shim registers `.jpe?g` as a literal extension, so a
 * `.jpg` require loads as JavaScript under test and throws.
 */
export const ONBOARDING_STILL_WIDTH = 804;

const BEZEL = 8;
const MAX_FRAME_WIDTH = 340;
const BEZEL_LIGHT = "#0A0A0C";
// A near-black bezel disappears against the dark page, so it lightens there.
const BEZEL_DARK = "#3F3F46";
const FRAME_RADIUS = 44;
const SCREEN_RADIUS = FRAME_RADIUS - BEZEL;

export function OnboardingDeviceFrame({
  light,
  dark,
  stillHeight,
}: {
  light: ImageSourcePropType;
  dark: ImageSourcePropType;
  /** Pixel height of the still, at `ONBOARDING_STILL_WIDTH` wide. */
  stillHeight: number;
}) {
  const isDark = useIsDarkMode();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  // Sized in points rather than by percentage: an Image with a percentage
  // width and an aspect ratio lays out at the still's pixel size instead.
  const frameWidth = Math.min(MAX_FRAME_WIDTH, windowWidth - mobileSpace["2xl"] * 2);
  const screenWidth = frameWidth - BEZEL * 2;
  const screenHeight = Math.round((screenWidth * stillHeight) / ONBOARDING_STILL_WIDTH);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.stage}
    >
      <View style={[styles.bezel, { width: frameWidth }]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={isDark ? dark : light}
          style={[styles.screen, { width: screenWidth, height: screenHeight }]}
        />
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
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
    },
  });
