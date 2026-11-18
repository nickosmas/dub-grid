import { Stack } from "expo-router";
import { useMemo } from "react";
import { createTopLevelStackOptions } from "../navigation/top-level-stack";
import { useMobileColors } from "../providers/ThemeModeProvider";

const SPLIT_HEADER = { headerLargeTitle: false, title: "" } as const;

/**
 * A split page's native title: none while split, where `PaneHeader` draws it
 * over the list, and the page's own large title otherwise. Always rendered,
 * because options a `Stack.Screen` sets outlive it: dropping it on close left
 * the closed page with no title.
 */
export function SplitStackTitle({ split, title }: { split: boolean; title: string }) {
  const mobileColors = useMobileColors();
  const options = useMemo(
    () => (split ? SPLIT_HEADER : createTopLevelStackOptions(mobileColors, title)),
    [split, mobileColors, title],
  );

  return <Stack.Screen options={options} />;
}
