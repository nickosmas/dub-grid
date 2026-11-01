import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileColors } from "../providers/ThemeModeProvider";

/** The chosen row's mark in an iOS list: a bare checkmark in the tint colour. */
export function SelectionCheck({ selected = true }: { selected?: boolean }) {
  const mobileColors = useMobileColors();
  if (!selected) return null;
  return <Ionicons color={mobileColors.brand} name="checkmark" size={22} />;
}
