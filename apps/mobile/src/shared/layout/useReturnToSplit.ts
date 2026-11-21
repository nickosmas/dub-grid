import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { PUSHED_BY_FOLD_PARAM, shouldReturnToSplit } from "./fold-rule";
import { useSplitLayout } from "./SplitView";

/** The Profile param that picks a setting beside the list on an open iPhone Duo. */
export const PROFILE_PICK_PARAM = "pick";

/**
 * A Profile setting's own page on an open iPhone Duo goes back to the split
 * with that setting picked beside the list: one pushed as the Duo folded
 * closed returns as it opens again, and one reached from elsewhere (an
 * alert, a link) returns at once rather than filling the wide screen.
 */
export function useReturnToSplit(enabled = true, section?: string) {
  const params = useLocalSearchParams<{ [PUSHED_BY_FOLD_PARAM]?: string }>();
  const split = useSplitLayout();
  const pushedByFold = enabled && params[PUSHED_BY_FOLD_PARAM] === "1";
  useEffect(() => {
    if (shouldReturnToSplit({ isSplit: split !== null, pushedByFold }) && router.canGoBack()) {
      router.back();
      return;
    }
    if (enabled && !pushedByFold && split !== null && section) {
      router.dismissTo({ pathname: "/(tabs)/profile", params: { [PROFILE_PICK_PARAM]: section } });
    }
  }, [split, pushedByFold, enabled, section]);
}
