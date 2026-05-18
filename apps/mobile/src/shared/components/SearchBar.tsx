import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { mobileColors, mobileRadii, mobileText } from "../theme/tokens";

const DEFAULT_DEBOUNCE_MS = 300;

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
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={mobileColors.textSubtle}
        returnKeyType={returnKeyType}
        style={styles.input}
        value={value}
      />
      {showClear ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => onChangeText("")}
        >
          <Ionicons
            color={mobileColors.textMuted}
            name="close-circle"
            size={18}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 46,
    alignItems: "center",
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    flexDirection: "row",
    flex: 1,
    gap: 9,
    paddingHorizontal: 14,
  },
  input: {
    ...mobileText.sectionTitle,
    fontWeight: "400",
    color: mobileColors.textPrimary,
    flex: 1,
    paddingVertical: 12,
  },
});
