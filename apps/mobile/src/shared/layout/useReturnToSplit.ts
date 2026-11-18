import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { PUSHED_BY_FOLD_PARAM, shouldReturnToSplit } from "./fold-rule";
import { useSplitLayout } from "./SplitView";

/**
 * A page pushed when an open iPhone Duo folded closed goes back once it
 * opens again, to the split that still has it picked beside the list.
 */
export function useReturnToSplit(enabled = true) {
  const params = useLocalSearchParams<{ [PUSHED_BY_FOLD_PARAM]?: string }>();
  const split = useSplitLayout();
  const pushedByFold = enabled && params[PUSHED_BY_FOLD_PARAM] === "1";
  useEffect(() => {
    if (shouldReturnToSplit({ isSplit: split !== null, pushedByFold }) && router.canGoBack()) {
      router.back();
    }
  }, [split, pushedByFold]);
}
