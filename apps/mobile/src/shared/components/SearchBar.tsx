import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import Animated from "react-native-reanimated";
import { usePressAnimation } from "../motion/usePressAnimation";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileControl,
  mobileInputText,
  mobileMotion,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";
import { useAsyncAction } from "../hooks/useAsyncAction";

const DEFAULT_DEBOUNCE_MS = 300;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Small enough to read as a clear affordance rather than a second control in
 * the field. Its touch target comes from `hitSlop`, not from its size.
 */
const CLEAR_SIZE = 22;

export type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onDebouncedChange?: (text: string) => void;
  debounceMs?: number;
  placeholder?: string;
  accessibilityLabel?: string;
  autoFocus?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
};

/**
 * The app's search field. A screen that puts one above a list should also pass
 * `adjustsForKeyboard={false}` to its `<Screen>`: a field at the top of the
 * page never needs lifting off the keyboard, and insetting for it collapses
 * the iOS large title and jumps the page the moment this is focused.
 */
export function SearchBar({
  value,
  onChangeText,
  onDebouncedChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  placeholder = "Search",
  accessibilityLabel,
  autoFocus,
  returnKeyType = "search",
  onSubmitEditing,
}: SearchBarProps) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const debouncedCallbackRef = useRef(onDebouncedChange);
  useEffect(() => {
    debouncedCallbackRef.current = onDebouncedChange;
  });

  useEffect(() => {
    if (!debouncedCallbackRef.current) return;
    const id = setTimeout(() => {
      debouncedCallbackRef.current?.(value);
    }, debounceMs);
    return () => clearTimeout(id);
  }, [value, debounceMs]);

  const showClear = value.length > 0;

  return (
    <View style={styles.field}>
      <Ionicons color={mobileColors.textSubtle} name="search" size={18} />
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={mobileColors.textSubtle}
        returnKeyType={returnKeyType}
        style={styles.input}
        value={value}
      />
      {/* The slot is always mounted, so the input keeps the same width whether
          or not there is a query. Mounting the button itself on first keystroke
          re-flowed the field mid-word, which reads as the text jumping. */}
      <View style={styles.clearSlot}>
        {showClear ? <ClearButton onPress={() => onChangeText("")} /> : null}
      </View>
    </View>
  );
}

function ClearButton({ onPress }: { onPress: () => unknown }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleBorderless: true,
    scale: mobileMotion.press.iconOnlyScale,
  });

  // Latched here rather than at each call site: these press handlers are
  // synchronous today, and the latch returns early for those, but nothing
  // stops a caller passing one that fires a request.
  const action = useAsyncAction(onPress ?? (() => {}));

  return (
    <AnimatedPressable
      accessibilityLabel="Clear search"
      accessibilityRole="button"
      android_ripple={androidRipple}
      hitSlop={12}
      onPress={action.run}
      {...pressHandlers}
      style={[styles.clearButton, animatedStyle]}
    >
      <Ionicons color={mobileColors.textSecondary} name="close" size={14} />
    </AnimatedPressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    field: {
      minHeight: mobileControl.md,
      alignItems: "center",
      // White, like every other enterable surface. `surfaceSecondary` made the
      // field a *recessed* gray, which is the older iOS search idiom and reads
      // as a filled control rather than something to type in — and against the
      // slate page it had almost nothing to separate it (1.02:1), so the border
      // was carrying the whole shape. Both screens that use this put it in page
      // content, never in the white header bar, so the fill has the page to
      // stand against. `surface`, not a literal, so dark mode gets its card
      // color instead of a white slab.
      backgroundColor: mobileColors.surface,
      // Kept: at 1.12:1 the fill alone is a card-strength edge, and this is an
      // interactive target that should read as crisper than a card.
      borderColor: mobileColors.borderSubtle,
      // Pill, to match the filter and add controls it sits beside.
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      flexDirection: "row",
      flex: 1,
      gap: mobileSpace.sm,
      // A pill needs more room at the ends than a 12pt-radius box before its
      // contents stop looking crowded by the curve.
      paddingLeft: 16,
      paddingRight: 12,
    },
    input: {
      ...mobileInputText("regular"),
      fontSize: mobileText.input.fontSize,
      lineHeight: mobileText.input.lineHeight,
      // Explicit rather than left to the platform default, so this field
      // can't inherit stray tracking from a native fallback font.
      letterSpacing: 0,
      color: mobileColors.textPrimary,
      flex: 1,
      paddingVertical: 12,
    },
    clearSlot: {
      width: CLEAR_SIZE,
      height: CLEAR_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    clearButton: {
      width: CLEAR_SIZE,
      height: CLEAR_SIZE,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.controlNeutralBg,
      borderRadius: mobileRadii.pill,
      overflow: "hidden",
    },
  });
