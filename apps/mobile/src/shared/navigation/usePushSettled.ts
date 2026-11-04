import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";

/** Long enough for a native push to finish if its end is never reported. */
const PUSH_SETTLE_FALLBACK_MS = 600;

/**
 * Whether this screen's push animation has finished. A bar item added while
 * it runs is morphed by iOS 26 from the last screen's item: an Edit became a
 * long pill on its way to an editor's checkmark. Added after, it just appears.
 */
export function usePushSettled(): boolean {
  const navigation = useNavigation();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled) return;
    const fallback = setTimeout(() => setSettled(true), PUSH_SETTLE_FALLBACK_MS);
    const unsubscribe = navigation.addListener(
      "transitionEnd" as never,
      ((event: { data?: { closing?: boolean } }) => {
        if (!event.data?.closing) setSettled(true);
      }) as never,
    );
    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [navigation, settled]);

  return settled;
}
