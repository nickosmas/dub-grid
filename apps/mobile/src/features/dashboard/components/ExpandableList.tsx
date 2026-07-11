import { Fragment, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";

const DEFAULT_COLLAPSED_COUNT = 5;

export function ExpandableList<T>({
  title,
  items,
  keyExtractor,
  renderItem,
  renderDivider,
  collapsedCount = DEFAULT_COLLAPSED_COUNT,
  onSeeAll,
}: {
  title: string;
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderDivider?: () => ReactNode;
  collapsedCount?: number;
  /**
   * When provided, "See all N" navigates via this callback (e.g. to a
   * full-page expanded route) instead of opening the built-in bottom sheet.
   */
  onSeeAll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > collapsedCount;
  const visibleItems = items.slice(0, collapsedCount);

  const renderRows = (list: T[]) =>
    list.map((item, index) => (
      <Fragment key={keyExtractor(item)}>
        {index > 0 && renderDivider ? renderDivider() : null}
        {renderItem(item)}
      </Fragment>
    ));

  return (
    <View style={styles.list}>
      {renderRows(visibleItems)}
      {hasMore ? (
        <Button
          compact
          tone="link"
          label={`See all ${items.length}`}
          onPress={onSeeAll ?? (() => setExpanded(true))}
        />
      ) : null}
      {onSeeAll ? null : (
        <BottomSheetModal
          visible={expanded}
          onDismiss={() => setExpanded(false)}
          scrollable
          footer={<Button label="Done" onPress={() => setExpanded(false)} />}
        >
          <Text style={styles.sheetTitle}>{title}</Text>
          <View style={styles.list}>{renderRows(items)}</View>
        </BottomSheetModal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  sheetTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
  },
});
