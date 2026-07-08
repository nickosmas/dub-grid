import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";
import type { ComponentProps, ComponentType } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { mobileColors } from "../theme/tokens";

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
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
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
            <View style={[styles.iconPill, focused && styles.iconPillActive]}>
              <config.family
                name={focused ? config.filled : config.outline}
                size={22}
                color={focused ? mobileColors.brand : mobileColors.textSubtle}
              />
            </View>
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginHorizontal: 16,
    height: 68,
    backgroundColor: mobileColors.surface,
    borderRadius: 34,
    paddingHorizontal: 8,
    ...Platform.select({
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
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
    borderRadius: 9999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconPillActive: {
    backgroundColor: mobileColors.brandSoft,
  },
  label: {
    marginTop: 2,
    fontSize: 11,
  },
  labelActive: {
    color: mobileColors.brand,
    fontWeight: "700",
  },
  labelInactive: {
    color: mobileColors.textSubtle,
    fontWeight: "600",
  },
});
