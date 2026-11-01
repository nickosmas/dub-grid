import Ionicons from "@expo/vector-icons/Ionicons";
import { Children, useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useIsInsideSheet } from "../../../../shared/components/BottomSheetModal";
import { Pressable } from "../../../../shared/components/Pressable";
import { PressableRow } from "../../../../shared/components/PressableRow";
import { SelectionCheck } from "../../../../shared/components/SelectionCheck";
import { Text } from "../../../../shared/components/Text";
import { hapticSelection } from "../../../../shared/lib/haptics";
import { IS_ANDROID_LIST, IS_IOS_LIST, IS_NATIVE_LIST } from "../../../../shared/lib/native-list";
import { useIsDarkMode, useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../../shared/theme/tokens";

/** Where a row's text starts, so separators begin under it rather than at the card edge. */
export const DETAIL_ROW_INSET = mobileSpace.lg;

function useDetailStyles() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insideSheet = useIsInsideSheet();
  return useMemo(
    () => createStyles(mobileColors, isDark, insideSheet),
    [mobileColors, isDark, insideSheet],
  );
}

/**
 * One group of a grouped list, as iOS Settings and Material 3 draw it: a
 * header over a flat card of rows, separators only between rows and inset to
 * the text, and an optional footnote under the card.
 */
export function DetailGroup({
  title,
  footer,
  titleTone = "default",
  separatorInset = DETAIL_ROW_INSET,
  placeholder,
  testID,
  children,
}: {
  title?: string;
  /** Brand for a header that marks the current side of a comparison, such as After. */
  titleTone?: "default" | "brand";
  /** Shown in place of the card when the group has no rows: a loading, error or empty state. */
  placeholder?: ReactNode;
  footer?: ReactNode;
  separatorInset?: number;
  testID?: string;
  children?: ReactNode;
}) {
  const styles = useDetailStyles();
  const rows = Children.toArray(children);

  return (
    <View style={styles.group}>
      {title ? (
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.header, titleTone === "brand" && styles.headerBrand]}
        >
          {title}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.card} testID={testID}>
          {rows.map((row, index) => (
            <View key={index}>
              {row}
              {index < rows.length - 1 ? (
                <View style={[styles.separator, { marginLeft: separatorInset }]} />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        (placeholder ?? null)
      )}
      {typeof footer === "string" ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.footer}>
          {footer}
        </Text>
      ) : (
        (footer ?? null)
      )}
    </View>
  );
}

/** A plain padded row, for content that isn't a label and a value. */
export function DetailRowFrame({
  children,
  style,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const styles = useDetailStyles();
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.row, style]} testID={testID}>
      {children}
    </View>
  );
}

/** A field's name over its value, the way Contacts lays out a detail row. */
export function DetailFieldRow({
  label,
  value,
  prominent = false,
  accessibilityLabel,
  testID,
  children,
}: {
  label: string;
  value?: string;
  prominent?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  /** Drawn in place of a text value. */
  children?: ReactNode;
}) {
  const styles = useDetailStyles();
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? (value ? `${label} ${value}` : undefined)}
      style={[styles.row, styles.fieldRow]}
      testID={testID}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.fieldLabel}>
        {label}
      </Text>
      {value ? (
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.fieldValue, prominent && styles.fieldValueProminent]}
        >
          {value}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** A row that opens more, with the platform's trailing chevron. */
export function DetailNavRow({
  accessibilityLabel,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const styles = useDetailStyles();
  return (
    <PressableRow
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.row, styles.navRow]}
    >
      <View style={styles.navContent}>{children}</View>
      {IS_ANDROID_LIST ? null : (
        <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={20} />
      )}
    </PressableRow>
  );
}

/** The text a `DetailNavRow` carries, at the row's reading size. */
export function DetailNavLabel({ children }: { children: ReactNode }) {
  const styles = useDetailStyles();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.navLabel}>
      {children}
    </Text>
  );
}

/** An action inside a list: tinted text, red when it removes something. */
export function DetailActionRow({
  label,
  accessibilityLabel,
  tone = "brand",
  disabled = false,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  tone?: "brand" | "danger";
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useDetailStyles();
  return (
    <PressableRow
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, styles.actionRow]}
    >
      <Text
        fit="compact"
        style={[styles.actionLabel, tone === "danger" && styles.actionLabelDanger]}
      >
        {label}
      </Text>
    </PressableRow>
  );
}

/**
 * One choice of a pick-one list: a bare checkmark on the chosen row on iOS, a
 * radio button on every row on Android.
 */
export function DetailChoiceRow({
  title,
  detail,
  trailing,
  selected,
  disabled = false,
  tone = "default",
  accessibilityLabel,
  accessibilityValue,
  onPress,
  children,
}: {
  title: string;
  detail?: string | null;
  /** Secondary text at the trailing edge, before the mark, such as a count. */
  trailing?: string;
  selected: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
  accessibilityLabel?: string;
  accessibilityValue?: string;
  onPress: () => void;
  /** More lines under the title, such as a teammate's shifts. */
  children?: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const styles = useDetailStyles();
  const press = () => {
    hapticSelection();
    onPress();
  };

  // The shared Pressable rather than PressableRow, which has no way to say a
  // value such as a day's count of teammates.
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join(". ")}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected, checked: selected }}
      accessibilityValue={accessibilityValue ? { text: accessibilityValue } : undefined}
      android_ripple={disabled ? undefined : { color: mobileColors.rippleNeutral }}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.row,
        styles.choiceRow,
        pressed && !disabled && !IS_ANDROID_LIST && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.choiceCopy}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.choiceTitle, tone === "danger" && styles.actionLabelDanger]}
        >
          {title}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.choiceDetail}>
            {detail}
          </Text>
        ) : null}
        {children}
      </View>
      {trailing ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.choiceTrailing}>
          {trailing}
        </Text>
      ) : null}
      {IS_ANDROID_LIST ? (
        <SelectionCheck selected={selected} />
      ) : IS_IOS_LIST ? (
        <View style={styles.checkSlot}>
          <SelectionCheck selected={selected} />
        </View>
      ) : selected ? (
        <SelectionCheck selected />
      ) : null}
    </Pressable>
  );
}

/** Body text set in a list's own margin, for a sentence that leads into a group. */
export function DetailIntro({ children }: { children: ReactNode }) {
  const styles = useDetailStyles();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.intro}>
      {children}
    </Text>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean, insideSheet: boolean) =>
  StyleSheet.create({
    group: {
      gap: mobileSpace.sm,
    },
    header: IS_ANDROID_LIST
      ? {
          // Material 3: a list subheader in the brand colour.
          ...mobileTextWeighted("body", "semibold"),
          color: mobileColors.brand,
          paddingHorizontal: DETAIL_ROW_INSET,
        }
      : {
          ...mobileTextWeighted("sectionTitle", "semibold"),
          color: mobileColors.textPrimary,
          paddingHorizontal: DETAIL_ROW_INSET,
        },
    headerBrand: {
      color: mobileColors.brand,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // Flat on the grouped page: a hairline only in dark mode, where page and
      // card are close, or on a drawn sheet, which is white itself.
      borderWidth: isDark || (insideSheet && !IS_NATIVE_LIST) ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? mobileColors.cardBorder : mobileColors.borderSubtle,
      overflow: "hidden",
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
    footer: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
      paddingHorizontal: DETAIL_ROW_INSET,
    },
    intro: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      paddingHorizontal: IS_IOS_LIST ? DETAIL_ROW_INSET : 0,
    },
    row: {
      paddingHorizontal: DETAIL_ROW_INSET,
      paddingVertical: mobileSpace.md,
      minHeight: 48,
      justifyContent: "center",
    },
    fieldRow: {
      gap: 0,
    },
    fieldLabel: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    fieldValue: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    fieldValueProminent: {
      ...mobileText.rowTitle,
      ...mobileTabularText,
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    navContent: {
      flex: 1,
      minWidth: 0,
    },
    navLabel: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    actionRow: {
      alignItems: "flex-start",
    },
    actionLabel: {
      ...mobileText.body,
      color: mobileColors.brand,
    },
    actionLabelDanger: {
      color: mobileColors.dangerText,
    },
    choiceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
    },
    choiceCopy: {
      flex: 1,
      minWidth: 0,
      gap: 0,
    },
    choiceTitle: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    choiceDetail: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    choiceTrailing: {
      ...mobileText.body,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    pressed: {
      backgroundColor: mobileColors.navActiveBg,
    },
    disabled: {
      opacity: 0.4,
    },
    // The checkmark keeps its column on every row, so titles don't shift when
    // the choice moves.
    checkSlot: {
      width: 22,
      alignItems: "center",
    },
  });
