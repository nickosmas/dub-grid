import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import { useMemo, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useMotionPreference } from "../motion/useMotionPreference";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileElevation,
  mobileMotion,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

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
        {
          marginBottom: Math.max(insets.bottom, 8) + 6,
        },
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
                color={focused ? mobileColors.brand : mobileColors.textSubtle}
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      marginHorizontal: mobileSpace.lg,
      height: 68,
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.sm,
      // A detached bar floating over content, so it takes the `float` level
      // rather than the hand-tuned platform fork this used to carry.
      ...mobileElevation("float", isDark),
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
      color: mobileColors.textSubtle,
    },
  });
