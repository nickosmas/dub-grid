import { Fragment, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import type { MobileColors } from "../../../shared/theme/tokens";

/**
 * The rows of a dashboard card, and of the full-page screen behind it.
 *
 * One component for both so a card's preview and its "See all" screen never
 * drift: the rows are the same components at the same rhythm, separated by a
 * hairline rather than a gap. A card passes `limit` (three: enough to show
 * what kind of thing is inside, few enough that the next card is still on
 * screen) and puts its "See all" in the `Card` header; this list never draws
 * one of its own.
 */
export function DashboardRowList<T>({
  items,
  keyExtractor,
  renderItem,
  limit,
}: {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  limit?: number;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const visibleItems = limit == null ? items : items.slice(0, limit);

  return (
    <View>
      {visibleItems.map((item, index) => (
        <Fragment key={keyExtractor(item)}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {renderItem(item)}
        </Fragment>
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
  });
