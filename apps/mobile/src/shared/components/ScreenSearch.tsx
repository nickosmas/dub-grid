import { Stack } from "expo-router";

export type ScreenSearchProps = {
  placeholder: string;
  onSearchChange: (text: string) => void;
};

/**
 * A screen's search field, the same on every searchable screen. iOS draws the
 * system search field under the large title; Android draws Material's docked
 * search bar where this sits, at the top of the content
 * (`ScreenSearch.android.tsx`).
 */
export function ScreenSearch({ placeholder, onSearchChange }: ScreenSearchProps) {
  return (
    <Stack.SearchBar
      hideWhenScrolling={false}
      // Under the large title on every screen; on a pushed page iOS 26 would
      // otherwise move it to the bottom toolbar.
      placement="stacked"
      placeholder={placeholder}
      onChangeText={(event) => onSearchChange(event.nativeEvent.text)}
      onCancelButtonPress={() => onSearchChange("")}
    />
  );
}
