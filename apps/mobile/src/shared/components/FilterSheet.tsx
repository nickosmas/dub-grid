import { ActionButtons } from "./ActionButtons";
import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { BottomSheetModal, SheetHeader } from "./BottomSheetModal";
import { Button } from "./Button";
import { NumericBadge } from "./NumericBadge";
import { PressableRow } from "./PressableRow";
import { SelectionCheck } from "./SelectionCheck";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../theme/tokens";

/** How far a row's surface is inset inside its slot. Matches the org picker. */
const SELECTION_ROW_INSET = 6;

// Shared filter-sheet idiom, extracted from PeopleScreen.tsx so every
// screen with a filter/sort bottom sheet (people directory, and the mobile
// dashboard's full-page expanded views) looks and behaves the same way.

export function FilterSheet({
  visible,
  title,
  onDismiss,
  onDone,
  onClearAll,
  clearDisabled = false,
  children,
}: {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  onDone: () => void;
  onClearAll?: () => void;
  clearDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BottomSheetModal
      footer={
        <ActionButtons
          primaryAction={<Button compact label="Done" tone="primary" onPress={onDone} />}
        >
          {onClearAll ? (
            <Button
              compact
              disabled={clearDisabled}
              label="Clear all"
              tone="neutral"
              onPress={onClearAll}
            />
          ) : null}
        </ActionButtons>
      }
      // The title lives in the sheet's drag region rather than the scrolling
      // body, so dragging anywhere on the header closes the sheet.
      header={<SheetHeader title={title} />}
      onDismiss={onDismiss}
      scrollable
      visible={visible}
    >
      {children}
    </BottomSheetModal>
  );
}

type SelectionRowElement = ReactElement<{ selected: boolean; showDivider?: boolean }>;

/** Whether an arbitrary child is a `SelectionRow` we can read `selected` off. */
function isSelectionRow(child: ReactNode): child is SelectionRowElement {
  return (
    isValidElement(child) && typeof (child.props as { selected?: unknown }).selected === "boolean"
  );
}

export function SelectionSection({ label, children }: { label: string; children: ReactNode }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // Flattened here rather than pushed onto the ten call sites: sections mix a
  // literal first row ("All focus areas") with a mapped array, so only this
  // component can see which row is last and which sits next to a selected one.
  const rows = Children.toArray(children);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.selectionList}>
        {rows.map((child, index) => {
          if (!isSelectionRow(child)) return child;
          const next = rows[index + 1];
          return cloneElement(child, {
            // No rule below the last row (it used to draw one straight onto the
            // group's own bottom edge), and none on either side of a selected
            // row, which has lifted out of the group as its own card.
            showDivider:
              index < rows.length - 1 &&
              !child.props.selected &&
              !(isSelectionRow(next) && next.props.selected),
          });
        })}
      </View>
    </View>
  );
}

export function SelectionRow({
  label,
  detail,
  selected,
  showDivider = true,
  disabled = false,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  /** Injected by `SelectionSection`; call sites don't set this. */
  showDivider?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  // Two boxes. The outer slot is full-bleed and owns the divider, so the list
  // keeps its flush grouped look; the inner box is the inset, rounded,
  // `overflow: hidden` surface. That shape is what makes the selected fill read
  // as its own item, and what gives the press highlight and the Android ripple
  // the same rounded corners instead of a square band across the group.
  return (
    <View style={[styles.selectionSlot, showDivider && styles.selectionDivider]}>
      <PressableRow
        disabled={disabled}
        onPress={onPress}
        selected={selected}
        style={[styles.selectionRow, selected && styles.selectionRowSelected]}
      >
        <View style={styles.selectionRowCopy}>
          <Text style={[styles.selectionRowTitle, selected && styles.selectionRowTitleSelected]}>
            {label}
          </Text>
          {detail ? <Text style={styles.selectionRowDetail}>{detail}</Text> : null}
        </View>
        {selected ? <SelectionCheck /> : null}
      </PressableRow>
    </View>
  );
}

export function FilterButton({
  activeCount,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  activeCount: number;
  expanded: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Button
      // Recreate the native button when its tone changes: Android can retain
      // the old background while updating the label, making it look disabled.
      key={activeCount > 0 ? "active" : "inactive"}
      accessibilityLabel={
        activeCount > 0
          ? `${accessibilityLabel}, ${activeCount} active ${activeCount === 1 ? "filter" : "filters"}`
          : accessibilityLabel
      }
      expanded={expanded}
      fullWidth
      icon="options-outline"
      label="Filter"
      trailingAccessory={<NumericBadge count={activeCount} tone="onAccent" />}
      onPress={onPress}
      size="sm"
      // Promotes to a solid brand fill once any filter is on, so an active
      // filter set is visible without opening the sheet.
      tone={activeCount > 0 ? "primary" : "neutral"}
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    section: {
      gap: mobileSpace.md,
    },
    sectionTitle: {
      ...mobileTextWeighted("sectionTitle", "medium"),
      color: mobileColors.textSubtle,
      paddingHorizontal: mobileSpace.lg,
      // Air above a title that follows another section's card; the card's
      // own gap below the title stays at the section's `gap`.
      paddingTop: mobileSpace.sm,
    },
    selectionList: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      // A hairline, not `cardBorder`. Cards on the page are drawn by their
      // shadow, which is why `cardBorder` is transparent in light mode - but a
      // card inside a sheet is deliberately flat (see `flatInSheet`), so with
      // no shadow to draw it there was no edge at all in light mode. Dark is
      // unchanged: `cardBorder` already resolves to this token there.
      borderColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    /** The full-bleed box a row occupies. Carries the divider and nothing else. */
    selectionSlot: {},
    selectionDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    /**
     * The row's own surface, inset inside its slot and fully rounded. Every row
     * has this shape; on an unselected row it stays transparent until a press
     * paints it, which is what rounds the highlight. `overflow: hidden` is what
     * clips the Android ripple to the radius — it ignores `borderRadius` alone.
     */
    selectionRow: {
      minHeight: 58,
      alignItems: "center",
      borderRadius: mobileRadii.control,
      flexDirection: "row",
      gap: mobileSpace.md,
      margin: SELECTION_ROW_INSET,
      overflow: "hidden",
      // The inset taken back out of the padding, so the label sits on the same
      // vertical line it did when the rows were flush.
      paddingHorizontal: mobileSpace.lg - SELECTION_ROW_INSET,
      paddingVertical: mobileSpace.md,
    },
    selectionRowSelected: {
      // The same control fill the organization picker uses for its current row,
      // so "chosen" looks the same wherever a sheet asks you to choose.
      backgroundColor: mobileColors.controlSecondaryBg,
    },
    selectionRowCopy: {
      flex: 1,
      gap: mobileSpace.xs,
    },
    selectionRowTitle: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    selectionRowTitleSelected: {
      ...mobileTextWeighted("body", "medium"),
    },
    selectionRowDetail: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });
