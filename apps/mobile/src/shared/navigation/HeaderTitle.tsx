import { Stack } from "expo-router";
import { memo } from "react";

/**
 * A route's native header title, for screens whose title is data.
 *
 * The header is the platform's own — iOS collapses its large title, Android
 * shows its top app bar title — and this only feeds it a string. It replaced a
 * scroll-driven version that watched the page's offset and swapped the title in
 * once the page's own heading had scrolled away. That was a JS imitation of a
 * collapsing header, and on a route asking for `headerLargeTitle` it fought the
 * real one: iOS renders that title *as* the large title, so a blank large-title
 * block sat there until the name popped in mid-scroll. Collapsing is the
 * platform's job.
 *
 * Memoized, and rendering nothing but the options: handing the navigator a
 * fresh options object on every unrelated render makes the native screen
 * re-apply its animation, gesture and content config each time. Everything else
 * about the header stays with the layout's own options for the route.
 *
 * Whatever this names, the page must not print again — see `ProfileHero`, whose
 * `title` is omitted on exactly these screens.
 */
export const HeaderTitle = memo(function HeaderTitle({ title }: { title: string }) {
  return <Stack.Screen options={{ title }} />;
});
