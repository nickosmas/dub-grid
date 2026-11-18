import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { AppText } from "../components/AppText";
import { ChromeIconButton } from "../components/ChromeIconButton";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileInputText,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

export type PaneHeaderAction = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** Tinted, as a filter that is on. */
  active?: boolean;
};

/**
 * The list pane's own title, buttons and search in a split view. Apple keeps
 * a split's leading pane controls above that pane; the native bar, which
 * spans the screen, holds only the detail's actions.
 */
export function PaneHeader({
  title,
  actions,
  search,
}: {
  title: string;
  actions: PaneHeaderAction[];
  search?: { placeholder: string; onChange: (text: string) => void };
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
          variant="screenTitle"
        >
          {title}
        </AppText>
        <View style={styles.actions}>
          {actions.map((action) => (
            <ChromeIconButton
              key={action.label}
              accessibilityLabel={action.label}
              onPress={action.onPress}
            >
              <Ionicons
                color={action.active ? mobileColors.brand : mobileColors.textPrimary}
                name={action.icon}
                size={20}
              />
            </ChromeIconButton>
          ))}
        </View>
      </View>
      {search ? (
        <View style={styles.search}>
          <Ionicons color={mobileColors.textSubtle} name="search" size={18} />
          <TextInput
            accessibilityLabel={search.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={search.onChange}
            placeholder={search.placeholder}
            placeholderTextColor={mobileColors.textSubtle}
            returnKeyType="search"
            style={[styles.searchInput, mobileInputText()]}
          />
        </View>
      ) : null}
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    header: {
      gap: mobileSpace.md,
      paddingTop: mobileSpace.sm,
    },
    titleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    title: {
      flex: 1,
    },
    actions: {
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    search: {
      alignItems: "center",
      backgroundColor: mobileColors.surfaceMuted,
      borderRadius: mobileRadii.control,
      flexDirection: "row",
      gap: mobileSpace.sm,
      minHeight: 40,
      paddingHorizontal: mobileSpace.md,
    },
    searchInput: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flex: 1,
      paddingVertical: mobileSpace.sm,
    },
  });
}
