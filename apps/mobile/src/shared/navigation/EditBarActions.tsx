import { Platform } from "react-native";
import { useEffect } from "react";
import { Stack, useNavigation } from "expo-router";
import { barActionIsCheckmark } from "../lib/bar-action";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useIosToolbarImage, useToolbarIcon } from "./useToolbarIcon";

const IS_IOS = Platform.OS === "ios";

/** The words `useUnsavedChangesGuard` asks with, for an editor's X. */
export const DISCARD_CONFIRM = {
  title: "Discard unsaved changes?",
  label: "Discard",
  keepLabel: "Keep editing",
};

type EditBarAction = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Ask before acting: on iOS the X opens the question as a menu from itself,
   * with the action in red, as the system's editors do.
   */
  confirm?: { title: string; label: string; keepLabel: string };
};

/**
 * An editor's actions in the navigation bar, as the system's own bar items
 * (owner, 2026-10-31: no buttons along the bottom of an edit surface): the
 * commit on the trailing edge as a prominent item (a checkmark when it only
 * saves, its words for Send or Finish), filled with the brand
 * colour and gray glass while it can't be pressed, and, while there are
 * changes to lose, an X on the leading edge in place of the back button. The
 * icons stand for the words (owner, same day), which screen readers still
 * hear. Android's toolbar draws only icons, so it needs them too.
 */
export function EditBarActions({
  save,
  discard,
}: {
  save: EditBarAction;
  discard?: EditBarAction | null;
}) {
  const mobileColors = useMobileColors();
  const navigation = useNavigation();
  // Screen options outlive the element that set them, so leaving the editor
  // has to give the back button back.
  useEffect(() => () => navigation.setOptions({ headerBackVisible: true }), [navigation]);
  const discardIcon = useToolbarIcon("xmark", "close");
  // Android tints the icon itself, dimming it while disabled.
  const saveSymbol = useToolbarIcon("checkmark", save.label.startsWith("Send") ? "send" : "check");
  const saveImage = useIosToolbarImage("checkmark", mobileColors.onBrandText);
  const saveIcon = IS_IOS ? saveImage : saveSymbol;
  // A save is a checkmark; Send or Finish keep their words. Android's toolbar
  // draws only icons, so there a send is its arrow and the rest a checkmark.
  const saveAsCheckmark = !IS_IOS || barActionIsCheckmark(save.label);

  return (
    <>
      <Stack.Screen options={{ headerBackVisible: !discard }} />
      {discard ? (
        <Stack.Toolbar placement="left">
          {IS_IOS && discard.confirm ? (
            <Stack.Toolbar.Menu
              accessibilityLabel={discard.accessibilityLabel ?? discard.label}
              icon={discardIcon}
              title={discard.confirm.title}
            >
              <Stack.Toolbar.MenuAction destructive onPress={discard.onPress}>
                {discard.confirm.label}
              </Stack.Toolbar.MenuAction>
              {/* Changing your mind is an answer on screen too (owner,
                  2026-11-01). */}
              <Stack.Toolbar.MenuAction onPress={() => undefined}>
                {discard.confirm.keepLabel}
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : (
            <Stack.Toolbar.Button
              accessibilityLabel={discard.accessibilityLabel ?? discard.label}
              icon={discardIcon}
              onPress={discard.onPress}
            />
          )}
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        {saveAsCheckmark ? (
          <Stack.Toolbar.Button
            accessibilityLabel={save.accessibilityLabel ?? save.label}
            disabled={Boolean(save.disabled || save.loading)}
            icon={saveIcon}
            iconRenderingMode={IS_IOS ? "original" : undefined}
            onPress={save.onPress}
            tintColor={mobileColors.brand}
            variant="prominent"
          />
        ) : (
          <Stack.Toolbar.Button
            accessibilityLabel={save.accessibilityLabel ?? save.label}
            disabled={Boolean(save.disabled || save.loading)}
            onPress={save.onPress}
            tintColor={mobileColors.brand}
            variant="prominent"
          >
            {save.label}
          </Stack.Toolbar.Button>
        )}
      </Stack.Toolbar>
    </>
  );
}
