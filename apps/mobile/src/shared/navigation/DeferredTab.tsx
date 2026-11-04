import { useEffect, useState, type ReactNode } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useMobileColors } from "../providers/ThemeModeProvider";

/**
 * How long after launch an unvisited tab waits before mounting anyway, so its
 * data is ready by the first tap without competing with Home's first load.
 */
export const DEFERRED_TAB_WARM_MS = 2500;

/**
 * Native tabs render every tab's content at launch, so each tab's queries
 * used to start beside Home's and slow it down. A tab now mounts when first
 * focused, or once launch has settled, whichever comes first, and stays
 * mounted after.
 */
export function DeferredTab({ children }: { children: ReactNode }) {
  const isFocused = useIsFocused();
  const [isMounted, setIsMounted] = useState(isFocused);
  const mobileColors = useMobileColors();

  useEffect(() => {
    if (isMounted) return;
    if (isFocused) {
      setIsMounted(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setIsMounted(true), DEFERRED_TAB_WARM_MS);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [isFocused, isMounted]);

  if (!isMounted) {
    return <View style={[styles.placeholder, { backgroundColor: mobileColors.background }]} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  placeholder: { flex: 1 },
});
