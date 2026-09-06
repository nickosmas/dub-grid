import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { mobileSpace } from "../theme/tokens";
import { getOrderedActionItems } from "./action-button-layout";

/** First two actions share a row; every later action has its own full-width row. */
export function ActionButtons({
  children,
  primaryAction,
  style,
}: {
  children?: ReactNode;
  primaryAction?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const actions = getOrderedActionItems(children, primaryAction);
  if (actions.length === 0) return null;

  return (
    <View style={[style, styles.group]}>
      <View style={styles.row}>
        {actions.slice(0, 2).map(({ key, node }) => (
          <View key={key} style={styles.item}>
            {node}
          </View>
        ))}
      </View>
      {actions.slice(2).map(({ key, node }) => (
        <View key={key}>{node}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignSelf: "stretch",
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: mobileSpace.sm,
  },
  row: { flexDirection: "row", gap: mobileSpace.sm },
  item: { flex: 1, minWidth: 0 },
});
