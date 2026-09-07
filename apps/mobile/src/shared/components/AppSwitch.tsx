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
      // iOS draws its own fill behind the track before the switch is on; left
      // to the default it is a light grey that reads as "on" in dark mode.
      ios_backgroundColor={mobileColors.border}
      thumbColor={mobileColors.onBrandSurface}
      trackColor={{ false: mobileColors.border, true: mobileColors.brand }}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
