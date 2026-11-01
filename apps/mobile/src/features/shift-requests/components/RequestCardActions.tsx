import { Fragment, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { FitText } from "../../../shared/components/FitText";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

export type RequestCardAction = {
  key: string;
  label: string;
  /** The way forward is weighted; Decline, Reject and Cancel request stay plain, never red. */
  emphasis: "primary" | "plain";
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * A request card's actions as the last row of the card: tinted text buttons
 * under a hairline, peers side by side as equal halves, the way a grouped
 * list ends a card with its actions instead of buttons floating inside it.
 */
export function RequestCardActions({ actions }: { actions: ReadonlyArray<RequestCardAction> }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  if (actions.length === 0) return null;

  const rows: RequestCardAction[][] = [];
  for (let index = 0; index < actions.length; index += 2) {
    rows.push(actions.slice(index, index + 2));
  }

  return (
    <View>
      {rows.map((row) => (
        <View key={row.map((action) => action.key).join("|")}>
          <View style={styles.separator} />
          <View style={styles.row}>
            {row.map((action, index) => (
              <Fragment key={action.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <PressableRow
                  accessibilityLabel={action.label}
                  disabled={action.disabled}
                  onPress={action.onPress}
                  style={styles.action}
                >
                  {action.loading ? (
                    <ActivityIndicator color={mobileColors.brand} size="small" />
                  ) : null}
                  <FitText
                    ellipsizeMode="tail"
                    style={action.emphasis === "primary" ? styles.labelPrimary : styles.labelPlain}
                  >
                    {action.label}
                  </FitText>
                </PressableRow>
              </Fragment>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: mobileSpace.lg,
      backgroundColor: mobileColors.borderSubtle,
    },
    row: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    action: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileListRow.paddingVertical,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: mobileSpace.sm,
      backgroundColor: mobileColors.borderSubtle,
    },
    labelPrimary: {
      ...mobileText.rowTitle,
      color: mobileColors.brand,
    },
    labelPlain: {
      ...mobileTextWeighted("rowTitle", "regular"),
      color: mobileColors.brand,
    },
  });
