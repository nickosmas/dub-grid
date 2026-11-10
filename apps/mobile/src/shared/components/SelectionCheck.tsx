import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileColors } from "../providers/ThemeModeProvider";

/**
 * The chosen row's mark in every list that asks the user to choose one: a
 * bare checkmark in the brand colour, on the chosen row only.
 */
export function SelectionCheck({ selected = true }: { selected?: boolean }) {
  const mobileColors = useMobileColors();
  if (!selected) return null;
  return <Ionicons color={mobileColors.brand} name="checkmark" size={22} />;
}
