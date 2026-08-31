import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Pressable } from "./Pressable";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useMotionPreference } from "../motion/useMotionPreference";
import { getScreenGutter } from "./screen-layout";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../theme/tokens";
import { FLOATING_TAB_BAR_HEIGHT, getFloatingTabBarMarginBottom } from "./floating-tab-bar-layout";

/** How far inside the content gutter each end of the bar sits. */
const TAB_BAR_INSET_BEYOND_CONTENT = mobileSpace.sm;

type TabBarRenderer = NonNullable<ComponentProps<typeof Tabs>["tabBar"]>;
type BottomTabBarProps = Parameters<TabBarRenderer>[0];

/** Icon size inside the selected-tab pill. */
const TAB_ICON_SIZE = 22;

/**
 * Discriminated by family so each glyph name is checked against that family's
 * own glyph union. Casting the components to a shared `{ name: string }` shape
 * instead widens the name to `string`, and a misspelled glyph then compiles
 * clean and renders an empty pill.
 */
type TabIcon =
  | {
      family: "ionicons";
      outline: ComponentProps<typeof Ionicons>["name"];
      filled: ComponentProps<typeof Ionicons>["name"];
    }
  | {
      family: "material-community";
      outline: ComponentProps<typeof MaterialCommunityIcons>["name"];
      filled: ComponentProps<typeof MaterialCommunityIcons>["name"];
    };

const TAB_CONFIG: Record<string, { label: string; icon: TabIcon }> = {
  home: {
    label: "Home",
    icon: { family: "material-community", outline: "home-outline", filled: "home" },
  },
  team: {
    label: "Schedule",
    icon: { family: "ionicons", outline: "calendar-outline", filled: "calendar" },
  },
  requests: {
    label: "Requests",
    icon: { family: "ionicons", outline: "swap-horizontal-outline", filled: "swap-horizontal" },
  },
  people: {
    label: "People",
    icon: { family: "ionicons", outline: "people-outline", filled: "people" },
  },
  profile: {
    label: "Profile",
    icon: { family: "ionicons", outline: "person-circle-outline", filled: "person-circle" },
  },
};

/**
 * Narrows on `family` before reading the glyph name, so each branch hands its
 * component a name from that component's own union.
 */
function TabGlyph({ icon, focused, color }: { icon: TabIcon; focused: boolean; color: string }) {
  if (icon.family === "ionicons") {
    return (
      <Ionicons name={focused ? icon.filled : icon.outline} size={TAB_ICON_SIZE} color={color} />
    );
  }
  return (
    <MaterialCommunityIcons
      name={focused ? icon.filled : icon.outline}
      size={TAB_ICON_SIZE}
      color={color}
    />
  );
}

export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  return (
    <View
      style={[
        styles.bar,
        // Shared with `getScreenBottomPadding`, which has to clear exactly this
        // much for the last row of a screen to be reachable.
        { marginBottom: getFloatingTabBarMarginBottom(insets.bottom) },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if ((options as { href?: string | null }).href === null) {
          return null;
        }
        const config = TAB_CONFIG[route.name];
        if (!config) {
          return null;
        }

        const focused = state.index === index;
        const label = config.label;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            // Report `selected: false` explicitly — an empty state object makes
            // VoiceOver/TalkBack announce nothing at all for unselected tabs,
            // so a user can't tell which one they're on.
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            onPress={onPress}
            onLongPress={onLongPress}
            android_ripple={{
              color: mobileColors.brandSoft,
              borderless: true,
              radius: 36,
            }}
            style={styles.tab}
          >
            <TabIconPill focused={focused} style={styles.iconPill}>
              <TabGlyph
                icon={config.icon}
                focused={focused}
                color={focused ? mobileColors.brand : mobileColors.textPrimary}
              />
            </TabIconPill>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The selected-tab indicator. Deliberately not a `Button` — it is a selection
 * marker, not a control, and the Pressable around it already owns the press.
 */
function TabIconPill({
  focused,
  style,
  children,
}: {
  focused: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const { timing } = useMotionPreference();

  // Built on the JS thread, never inside the worklet below: Reanimated
  // serializes a captured non-worklet function as a remote-function *object*,
  // so calling `timing()` on the UI thread throws "timing is not a function
  // (it is Object)". Worklets may only close over the resulting plain config.
  const fillTiming = useMemo(() => timing("emphasized", mobileMotion.duration.fast), [timing]);

  const fillStyle = useAnimatedStyle(
    () => ({
      // Constant fill, with opacity alone driving visibility. Flipping the
      // colour to transparent on the same frame the fade started meant the
      // un-focus animation ran on an already-invisible view, so the pill
      // vanished instantly instead of fading out.
      backgroundColor: mobileColors.brandSoft,
      opacity: withTiming(focused ? 1 : 0, fillTiming),
    }),
    [focused, mobileColors.brandSoft, fillTiming],
  );

  return (
    <View style={style}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fillStyle]} />
      {children}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    bar: {
      // Out of the navigator's flow, so the screen container fills the window
      // and content passes *under* the bar. Left in flow it took layout height
      // of its own, which ended every screen in a flat band above it — the bar
      // read as docked chrome rather than something floating over the page.
      // Screens clear it with `bottomPaddingMode="tabbed"`.
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      // Derived from the content gutter rather than restated, so the bar stays
      // a step inside the cards it floats over however that gutter moves. Level
      // with them it read as another card in the stack, not as chrome above it.
      marginHorizontal: getScreenGutter() + TAB_BAR_INSET_BEYOND_CONTENT,
      height: FLOATING_TAB_BAR_HEIGHT,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.sm,
      // `floatBar` rather than plain `float`: same downward cast, but composed
      // so the blur wraps every edge at a readable strength instead of whatever
      // a single `elevation` number happens to paint.
      ...mobileElevation("floatBar", isDark),
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
    },
    iconPill: {
      width: 64,
      height: 32,
      borderRadius: mobileRadii.pill,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      ...mobileText.micro,
      marginTop: 2,
    },
    labelActive: {
      color: mobileColors.brand,
    },
    labelInactive: {
      // Full-strength text, not the muted ramp: a tab is a destination, and
      // the selected one is already called out by its brand fill and pill.
      color: mobileColors.textPrimary,
    },
  });
