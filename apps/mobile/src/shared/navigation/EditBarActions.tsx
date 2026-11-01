import { Stack } from "expo-router";
import { useMobileColors } from "../providers/ThemeModeProvider";

type EditBarAction = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * An editor's actions in the navigation bar, as the system's own bar items
 * (owner, 2026-10-31: no buttons along the bottom of an edit surface): the
 * commit on the trailing edge as a prominent item, filled with the brand
 * colour and gray glass while it can't be pressed, and, while there are
 * changes to lose, Discard on the leading edge in place of the back button.
 */
export function EditBarActions({
  save,
  discard,
}: {
  save: EditBarAction;
  discard?: EditBarAction | null;
}) {
  const mobileColors = useMobileColors();

  return (
    <>
      <Stack.Screen options={{ headerBackVisible: !discard }} />
      {discard ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel={discard.accessibilityLabel ?? discard.label}
            onPress={discard.onPress}
          >
            {discard.label}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={save.accessibilityLabel ?? save.label}
          disabled={Boolean(save.disabled || save.loading)}
          onPress={save.onPress}
          tintColor={mobileColors.brand}
          variant="prominent"
        >
          {save.label}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}
