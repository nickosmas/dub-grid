import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileColors } from "../providers/ThemeModeProvider";

/**
 * The mark on a selected row, in every list that asks the user to choose one.
 *
 * One component because the two pickers had already drifted: the organization
 * switcher drew a filled `checkmark-circle` at 22 while the filter sheet drew a
 * bare `checkmark` at 20, so the same idea was a heavy disc in one sheet and a
 * light tick in the other.
 *
 * The bare glyph is the one to keep, for two reasons. The row's tinted fill is
 * already the primary "this one is chosen" signal, so the mark only has to
 * confirm it — a filled disc on top of a filled row is the same statement made
 * twice. And `checkmark-circle` is spoken for: `ToastProvider` and
 * `StatusBanner` both use it to mean *success*. Keeping the disc for status and
 * the bare tick for selection means the two never have to be told apart by
 * context.
 */
export function SelectionCheck() {
  const mobileColors = useMobileColors();

  return <Ionicons color={mobileColors.brand} name="checkmark" size={20} />;
}
