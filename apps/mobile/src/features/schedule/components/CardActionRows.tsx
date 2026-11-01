import { Fragment, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type Ionicons from "@expo/vector-icons/Ionicons";
import { ActionButtons } from "../../../shared/components/ActionButtons";
import { Button } from "../../../shared/components/Button";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Text } from "../../../shared/components/Text";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

export type CardAction = {
  key: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** The card's main answer: semibold on device, the solid button on the web build. */
  primary?: boolean;
  /** The web build's button tone when the action is not primary. */
  webTone?: "secondary" | "neutral";
  /** The web build's button glyph. */
  webIcon?: React.ComponentProps<typeof Ionicons>["name"];
};

/**
 * A card's own actions. On device they are the card's last rows, tinted text
 * under hairlines the way a grouped list puts an action in a section, rather
 * than buttons drawn inside the card. The card pads its top and sides only
 * (`cardWithActionRows`), since the rows bring their own height. The web
 * build keeps the drawn buttons.
 */
export function CardActionRows({
  actions,
  style,
}: {
  actions: CardAction[];
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (actions.length === 0) return null;

  if (!IS_NATIVE_LIST) {
    const [first, ...rest] = actions.map((action) => (
      <Button
        key={action.key}
        disabled={action.disabled}
        icon={action.webIcon}
        label={action.label}
        loading={action.loading}
        onPress={action.onPress}
        tone={action.primary ? "primary" : (action.webTone ?? "secondary")}
      />
    ));
    return rest.length === 0 ? first : <ActionButtons primaryAction={first}>{rest}</ActionButtons>;
  }

  return (
    <View style={[styles.group, style]}>
      {actions.map((action) => (
        <Fragment key={action.key}>
          <View style={styles.separator} />
          {/* A row busy with its own answer keeps full strength under its
              spinner; only a row that can't be pressed dims. */}
          <PressableRow
            accessibilityLabel={action.label}
            disabled={Boolean(action.disabled) && !action.loading}
            onPress={action.loading ? () => undefined : action.onPress}
            style={styles.row}
          >
            {action.loading ? (
              <ActivityIndicator color={mobileColors.brand} size="small" />
            ) : (
              <Text fit="compact" style={action.primary ? styles.labelPrimary : styles.label}>
                {action.label}
              </Text>
            )}
          </PressableRow>
        </Fragment>
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Runs to the card's edges so a pressed row lights the card's full width;
    // the card clips the last row to its corners.
    group: {
      marginHorizontal: -mobileSpace.lg,
    },
    // Inset at the leading edge to the card's text, as a grouped list's are.
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: mobileSpace.lg,
      backgroundColor: mobileColors.borderSubtle,
    },
    row: {
      justifyContent: "center",
      minHeight: mobileListRow.minHeight,
      paddingHorizontal: mobileSpace.lg,
    },
    label: {
      ...mobileText.body,
      color: mobileColors.brand,
    },
    labelPrimary: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.brand,
    },
  });
