import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { useMemo, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
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

type IconFamily = ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

const TAB_CONFIG: Record<
  string,
  { label: string; family: IconFamily; outline: string; filled: string }
> = {
  home: {
    label: "Home",
    family: MaterialCommunityIcons as unknown as IconFamily,
    outline: "home-outline",
    filled: "home",
  },
  team: {
    label: "Schedule",
    family: Ionicons as unknown as IconFamily,
    outline: "calendar-outline",
    filled: "calendar",
  },
  requests: {
    label: "Requests",
    family: Ionicons as unknown as IconFamily,
    outline: "swap-horizontal-outline",
    filled: "swap-horizontal",
  },
  people: {
    label: "People",
    family: Ionicons as unknown as IconFamily,
    outline: "people-outline",
    filled: "people",
  },
  profile: {
    label: "Profile",
    family: Ionicons as unknown as IconFamily,
    outline: "person-circle-outline",
    filled: "person-circle",
  },
};

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
              <config.family
                name={focused ? config.filled : config.outline}
                size={22}
                color={focused ? mobileColors.brand : mobileColors.textPrimary}
              />
            </TabIconPill>
            <Text
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
