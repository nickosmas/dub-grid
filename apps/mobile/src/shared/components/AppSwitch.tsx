import { Switch } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";

/**
 * The app's switch, with its colours already on it.
 *
 * Every call site was repeating the same three props, and getting one of them
 * wrong is invisible until you look in the other theme: the thumb had been
 * `surface`, which is white in light mode and near-black in dark, so on a dark
 * track there was nothing to see. `onBrandSurface` is fixed white in both,
 * which is the property the thumb actually needs.
 *
 * Everything else is `Switch`'s own API, so a call site only says what the
 * switch is for and what it is bound to.
 */
export function AppSwitch({
  accessibilityLabel,
  disabled,
  value,
  onValueChange,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const mobileColors = useMobileColors();

  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      // UIKit keeps a sliver of this colour visible around the whole track in
      // every state, not just before the switch is turned on — left to the
      // default it's a light grey that both reads as "on" in dark mode and
      // outlines the ON track as a visible ring. `border` (the app's hairline
      // colour, tuned to stand out) made that ring obvious against the brand
      // fill; `surface` blends into the surrounding card in both themes while
      // still being dark enough in dark mode not to misread as "on".
      ios_backgroundColor={mobileColors.surface}
      thumbColor={mobileColors.onBrandSurface}
      trackColor={{ false: mobileColors.border, true: mobileColors.brand }}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
