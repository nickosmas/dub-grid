import { useEffect, useState } from "react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import type { UnsavedChangesGuard } from "./useUnsavedChangesGuard";

type NavigationAction = Parameters<Parameters<typeof usePreventRemove>[1]>[0]["data"]["action"];

/**
 * Routes a stack removal — header back, Android hardware back, the iOS back
 * swipe, `router.back()` — into an existing `UnsavedChangesGuard`, so a screen
 * with an inline editor asks once, from one confirmation, however the user
 * leaves. Pair it with the guard that already backs the panel's own Cancel
 * button; two guards would mean two modals racing each other.
 *
 * Covers stack removal only. `router.replace`, `<Redirect>`, tab switches, deep
 * links and backgrounding do not fire `beforeRemove` and are deliberately not
 * guarded — so don't read a tab switch that drops a draft as this being broken.
 *
 * The intercepted action is dispatched from an effect rather than straight from
 * the confirm handler, and that is not incidental. `usePreventRemove`'s
 * listener closes over the render-time `preventRemove` value, so dispatching
 * synchronously — before React has committed a render with it false — is vetoed
 * by our own guard, and the back button silently stops working. Parking the
 * action in state drops `preventRemove` first; the effect runs after that
 * commit.
 */
export function useNavigationDiscardGuard(guard: UnsavedChangesGuard): void {
  const navigation = useNavigation();
  const [exitAction, setExitAction] = useState<NavigationAction | null>(null);

  usePreventRemove(guard.isDirty && !guard.disabled && exitAction == null, ({ data }) => {
    guard.requestExit(() => setExitAction(data.action));
  });

  useEffect(() => {
    if (!exitAction) return;
    navigation.dispatch(exitAction);
    // Cleared after the dispatch, not before: while it is set, `preventRemove`
    // is false, which is the only reason the dispatch gets through.
    setExitAction(null);
  }, [exitAction, navigation]);
}
